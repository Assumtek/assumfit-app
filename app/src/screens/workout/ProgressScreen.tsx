import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import { useChartWidth } from '../../components/charts/useChartWidth';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable } from 'react-native';

import { Note } from '../../components/Card';
import { ProgressPhotos } from '../../components/ProgressPhotos';
import { RangeSheet } from '../../components/RangeSheet';
import { BarChart } from '../../components/charts/BarChart';
import { DetailScreen, usePullRefresh } from '../../components/DetailScreen';
import { Icon, type IconName } from '../../components/Icon';
import { Body, Card, Data, Label, Metric, MetricSm, RatingText, SectionTitle } from '../../components/ui';
import {
  consolidateMovement,
  movementSeries,
  movementTotals,
  sportBreakdown,
  weekdayTally,
  type MovementEntry,
} from '../../domain/movement';
import { DASH, rateMovement } from '../../domain/ratings';
import { SPORTS } from '../../domain/sport';
import { formatDuration } from '../../domain/workout';
import {
  fetchDashboard,
  fetchExecutionHistory,
  fetchSportSessions,
  type ExecutionHistoryItem,
  type SportSession,
  type WorkoutDashboard,
} from '../../services/api.service';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Progresso — o relatório completo do que foi MOVIMENTO, não só do que foi
 * musculação.
 *
 * Estrutura portada do `StudentProgressReport` do MUVX: números no topo, volume
 * por grupo muscular, evolução e o detalhe exercício por exercício. O seletor de
 * período (hoje / 7 / 30 / 90) também é de lá.
 *
 * ## As duas naturezas não se somam em tudo
 *
 * Treino guiado e sessão de esporte entram juntos no que é COMUM às duas —
 * atividades, minutos, caloria, constância, check-ins —, pela mesma regra de
 * `domain/movement.ts` que a agenda de movimento usa (sessão vinculada a uma
 * execução é um ato só). Já volume load (carga × repetições) fica na seção de
 * musculação: uma corrida soma zero ali, e um total misturado diria que a
 * semana de corrida foi uma semana fraca.
 *
 * ## Volume load é o número que faltava no app
 *
 * `carga × repetições`, somado. É a única métrica que responde "estou
 * progredindo?" na musculação — contagem de treinos responde "estou
 * aparecendo", que é outra pergunta.
 *
 * A agregação de musculação é toda do servidor. Trazer as séries cruas de 90
 * dias para o app somar significaria trafegar tudo por causa de um gráfico de
 * barras, e recalcular a cada troca de período.
 */

const PERIODOS = [
  { dias: 1 as const, rotulo: 'Hoje' },
  { dias: 7 as const, rotulo: '7 dias' },
  { dias: 30 as const, rotulo: '30 dias' },
  { dias: 90 as const, rotulo: '90 dias' },
];

type Linha = MovementEntry<ExecutionHistoryItem, SportSession>;

export function ProgressScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [aba, setAba] = useState<'movimento' | 'evolucao'>('movimento');
  const [dias, setDias] = useState<1 | 7 | 30 | 90>(30);
  /*
   Período PERSONALIZADO — "escolher um intervalo de datas" (pedido de testador,
   ago/2026). Com janela, `dias` vira o tamanho dela, para as médias por dia e
   a série continuarem certas; sem janela, os botões mandam como sempre.
  */
  const [janela, setJanela] = useState<{ from: string; to: string } | null>(null);
  const [escolhendoPeriodo, setEscolhendoPeriodo] = useState(false);
  const diasDaJanela = janela
    ? Math.max(1, Math.round((Date.parse(`${janela.to}T12:00:00`) - Date.parse(`${janela.from}T12:00:00`)) / 86_400_000) + 1)
    : null;
  const [dados, setDados] = useState<WorkoutDashboard | null>(null);
  const [historico, setHistorico] = useState<ExecutionHistoryItem[]>([]);
  const [esportes, setEsportes] = useState<SportSession[]>([]);
  const [carregando, setCarregando] = useState(true);

  /*
   Cada fonte falha por si. O esporte fora do ar não pode apagar o relatório de
   musculação inteiro — nem o contrário.
  */
  const carregar = React.useCallback(async () => {
    const [d, h, e] = await Promise.all([
      fetchDashboard(dias, janela ?? undefined).catch(() => null),
      fetchExecutionHistory(dias, janela ?? undefined).catch(() => []),
      fetchSportSessions(dias, janela ?? undefined).catch(() => []),
    ]);
    setDados(d);
    setHistorico(h);
    setEsportes(e);
  }, [dias, janela]);

  useEffect(() => {
    setCarregando(true);
    void carregar().finally(() => setCarregando(false));
  }, [carregar]);

  const refresh = usePullRefresh(carregar);

  const linhas = useMemo(() => consolidateMovement(historico, esportes), [historico, esportes]);
  const totais = useMemo(() => movementTotals(linhas), [linhas]);
  const modalidades = useMemo(() => sportBreakdown(esportes), [esportes]);
  const diasEfetivos = diasDaJanela ?? dias;
  const movimento = rateMovement({ minutes: totais.minutos, days: diasEfetivos });
  const maiorModalidade = Math.max(...modalidades.map((m) => m.minutos), 1);
  const maiorGrupo = Math.max(...(dados?.muscleDistribution ?? []).map((g) => g.volume), 1);

  const musculacao = dados && dados.summary.totalWorkouts > 0 ? dados : null;
  const vazio = linhas.length === 0 && !musculacao;

  return (
    <DetailScreen title="Progresso" refreshControl={refresh}>
      {/*
        Movimento e Evolução são ABAS da mesma tela, como no MUVX.

        A Evolução era uma tela própria no menu rápido, e a separação obrigava a
        escolher a porta certa antes de saber o que havia atrás de cada uma. As
        duas respondem a mesma pergunta em janelas diferentes — "o que eu fiz" e
        "para onde estou indo" — e trocar de aba preserva o período escolhido.
      */}
      <XStack borderRadius={12} borderWidth={1} borderColor="$border" overflow="hidden" marginBottom="$md">
        {(
          [
            ['movimento', 'Movimento'],
            ['evolucao', 'Evolução'],
          ] as const
        ).map(([chave, rotulo]) => (
          <Pressable
            key={chave}
            onPress={() => setAba(chave)}
            accessibilityRole="tab"
            accessibilityState={{ selected: aba === chave }}
            style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
          >
            <YStack
              paddingVertical="$md"
              alignItems="center"
              backgroundColor={aba === chave ? '$primarySoft' : 'transparent'}
            >
              <Body
                fontWeight={aba === chave ? '700' : '400'}
                color={aba === chave ? '$foreground' : '$mutedForeground'}
              >
                {rotulo}
              </Body>
            </YStack>
          </Pressable>
        ))}
      </XStack>

      {/* Compartilhar o progresso do período como story (pedido de testador, 21/08). */}
      <XStack justifyContent="flex-end" marginBottom="$sm">
        <Pressable
          onPress={() =>
            navigation.push('WorkoutShare', {
              selo: 'MEU PROGRESSO',
              titulo: janela ? 'Meu progresso' : dias === 1 ? 'Meu dia' : `Meus últimos ${dias} dias`,
              metricas: [
                { valor: String(Math.round(totais.minutos)), rotulo: 'min ativos' },
                musculacao ? { valor: String(musculacao.summary.totalWorkouts), rotulo: 'treinos' } : null,
                musculacao && musculacao.summary.volumeLoad > 0
                  ? { valor: `${Math.round(musculacao.summary.volumeLoad / 1000)} t`, rotulo: 'carga' }
                  : null,
              ].filter(Boolean),
            })
          }
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Compartilhar meu progresso"
          style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
        >
          <Icon name="share" size={20} color={colors.textMuted} strokeWidth={4} />
        </Pressable>
      </XStack>
      <SeletorDePeriodo
        atual={janela ? 'outro' : dias}
        onEscolher={(d) => {
          setJanela(null);
          setDias(d);
        }}
        onOutro={() => setEscolhendoPeriodo(true)}
      />
      {janela ? (
        <Data marginTop="$sm">
          de {janela.from.split('-').reverse().join('/')} a {janela.to.split('-').reverse().join('/')} ·{' '}
          {diasDaJanela} {diasDaJanela === 1 ? 'dia' : 'dias'}
        </Data>
      ) : null}
      <RangeSheet
        open={escolhendoPeriodo}
        onClose={() => setEscolhendoPeriodo(false)}
        onApply={setJanela}
        inicial={janela}
      />

      {carregando ? (
        <Body marginTop="$xl">Carregando…</Body>
      ) : vazio ? (
        <Note
          title="Nada registrado neste período"
          body="Treino concluído e sessão de esporte aparecem aqui, com minutos, calorias e volume. Troque o período acima para olhar mais para trás."
        />
      ) : aba === 'evolucao' ? (
        <Evolucao dados={musculacao} linhas={linhas} dias={diasEfetivos} />
      ) : (
        <>
          <YStack marginTop="$xl" gap="$md">
            <SectionTitle>Movimento</SectionTitle>
            <Card>
              <Label>tempo em movimento</Label>
              <XStack alignItems="baseline" gap="$sm" marginTop="$xs">
                <Metric numberOfLines={1}>{movimento.detail}</Metric>
                <Data>treino guiado e esporte</Data>
              </XStack>
              <RatingText marginTop="$sm">{movimento.label}</RatingText>
              {/* Barra de PREENCHIMENTO: minutos acumulam rumo a uma régua, e a
                  régua é o fim do trilho. */}
              <YStack height={8} borderRadius={4} backgroundColor="$track" marginTop="$md" overflow="hidden">
                <YStack
                  height={8}
                  borderRadius={4}
                  backgroundColor="$primary"
                  width={`${movimento.fraction * 100}%`}
                />
              </YStack>
              {/* "Ritmo", e não "meta": a régua é proporcional ao período
                  escolhido, e num dia ela vale um sétimo. */}
              <Data marginTop="$sm">
                {Math.round(movimento.fraction * 100)}% do ritmo de 150 min por semana
              </Data>
            </Card>

            <XStack gap="$md">
              <Numero
                icone="checklist"
                valor={String(totais.atividades)}
                rotulo={totais.atividades === 1 ? 'atividade' : 'atividades'}
              />
              {/*
                Caloria é estimativa por MET do cronômetro de esporte. Sem
                sessão cronometrada não há estimativa nenhuma — e "0 kcal"
                depois de cinco treinos afirmaria que a pessoa não gastou nada.
              */}
              <Numero
                icone="flame"
                valor={totais.esportes > 0 ? totais.kcal.toLocaleString('pt-BR') : DASH}
                rotulo="kcal estimadas"
              />
            </XStack>
          </YStack>

          {modalidades.length > 0 ? (
            <YStack marginTop="$xxl" gap="$md">
              <SectionTitle>Por modalidade</SectionTitle>
              {modalidades.map((modalidade) => (
                <Card key={modalidade.sport}>
                  <XStack alignItems="center" gap="$md">
                    <YStack flex={1} minWidth={0}>
                      <Body color="$foreground">{nomeDoEsporte(modalidade.sport)}</Body>
                      <Data>
                        {modalidade.sessoes} {modalidade.sessoes === 1 ? 'sessão' : 'sessões'}
                        {modalidade.metros > 0 ? ` · ${emKm(modalidade.metros)}` : ''}
                      </Data>
                    </YStack>
                    <Data flexShrink={0}>{formatDuration(modalidade.minutos * 60)}</Data>
                  </XStack>
                  <YStack height={4} borderRadius={4} backgroundColor="$track" marginTop="$sm" overflow="hidden">
                    <YStack
                      height={4}
                      borderRadius={4}
                      backgroundColor="$primary"
                      width={`${fracaoDe(modalidade.minutos, maiorModalidade) * 100}%`}
                    />
                  </YStack>
                </Card>
              ))}
            </YStack>
          ) : null}

          {musculacao ? (
            <>
              <YStack marginTop="$xxl" gap="$md">
                <SectionTitle>Musculação</SectionTitle>
                <Body>Séries, repetições e carga vêm só do treino guiado.</Body>
                <XStack gap="$md">
                  <Numero
                    icone="dumbbell"
                    valor={String(musculacao.summary.totalWorkouts)}
                    rotulo="treinos"
                  />
                  <Numero
                    icone="checklist"
                    valor={String(musculacao.summary.totalSeries)}
                    rotulo="séries"
                  />
                </XStack>
                <XStack gap="$md">
                  <Numero icone="skip" valor={String(musculacao.summary.totalReps)} rotulo="repetições" />
                  <Numero
                    icone="clock"
                    valor={formatDuration(musculacao.summary.totalDuration)}
                    rotulo="tempo de treino"
                  />
                </XStack>

                {/*
                  Volume load em destaque, sozinho e maior.

                  É o número que responde progressão, e enfileirá-lo com os
                  outros quatro o faria parecer um a mais. Em toneladas quando
                  passa de mil: "12.480 kg" é difícil de ler de relance,
                  "12,5 t" não.
                */}
                <Card>
                  <Label>volume total</Label>
                  <XStack alignItems="baseline" gap="$sm" marginTop="$xs">
                    <Metric numberOfLines={1}>{formatarVolume(musculacao.summary.volumeLoad)}</Metric>
                    <Data>carga × repetições</Data>
                  </XStack>
                </Card>
              </YStack>

              {musculacao.volumeEvolution.length > 1 ? (
                <YStack marginTop="$xxl" gap="$md">
                  <SectionTitle>Volume por dia</SectionTitle>
                  <Card>
                    <Medido>
                      {(largura) => (
                        <BarChart
                          bars={musculacao.volumeEvolution.map((d) => ({
                            label: d.day.slice(8),
                            value: d.volume,
                          }))}
                          width={largura}
                          height={152}
                          labelEvery={Math.max(1, Math.ceil(musculacao.volumeEvolution.length / 6))}
                          id="volume-dia"
                        />
                      )}
                    </Medido>
                  </Card>
                </YStack>
              ) : null}

              {musculacao.muscleDistribution.length > 0 ? (
                <YStack marginTop="$xxl" gap="$md">
                  <SectionTitle>Por grupo muscular</SectionTitle>
                  {musculacao.muscleDistribution.map((grupo) => (
                    <Card key={grupo.muscleGroup}>
                      <XStack alignItems="center" gap="$md">
                        <YStack flex={1} minWidth={0}>
                          <Body color="$foreground">{nomeDoMusculo(grupo.muscleGroup)}</Body>
                          <Data>
                            {grupo.series} {grupo.series === 1 ? 'série' : 'séries'}
                          </Data>
                        </YStack>
                        <Data flexShrink={0}>{formatarVolume(grupo.volume)}</Data>
                      </XStack>
                      <YStack height={4} borderRadius={4} backgroundColor="$track" marginTop="$sm" overflow="hidden">
                        <YStack
                          height={4}
                          borderRadius={4}
                          backgroundColor="$primary"
                          width={`${fracaoDe(grupo.volume, maiorGrupo) * 100}%`}
                        />
                      </YStack>
                    </Card>
                  ))}
                </YStack>
              ) : null}

              <YStack marginTop="$xxl" gap="$md">
                <SectionTitle>Exercícios realizados</SectionTitle>
                {musculacao.exercisesDetail.map((exercicio) => (
                  <Card key={exercicio.name}>
                    <YStack gap="$xs">
                      <Body color="$foreground" numberOfLines={2}>
                        {exercicio.name}
                      </Body>
                      <Data>{nomeDoMusculo(exercicio.muscleGroup)}</Data>
                      <XStack gap="$xl" marginTop="$sm" flexWrap="wrap">
                        <Miudo valor={String(exercicio.series)} rotulo="séries" />
                        <Miudo valor={String(exercicio.reps)} rotulo="reps" />
                        <Miudo valor={formatarVolume(exercicio.volume)} rotulo="volume" />
                        {/*
                          Carga máxima só aparece quando houve peso externo.
                          Flexão e prancha entram com carga nula, e "0 kg" ali
                          afirmaria que a pessoa levantou zero em vez de que o
                          exercício é de peso corporal.
                        */}
                        {exercicio.maxLoad != null ? (
                          <Miudo valor={`${exercicio.maxLoad} kg`} rotulo="carga máx." />
                        ) : null}
                      </XStack>
                    </YStack>
                  </Card>
                ))}
              </YStack>
            </>
          ) : null}
        </>
      )}
    </DetailScreen>
  );
}

/** Abas de período. Segmentado, não dropdown: são quatro e cabem numa linha. */
function SeletorDePeriodo({
  atual,
  onEscolher,
  onOutro,
}: {
  atual: number | 'outro';
  onEscolher: (dias: 1 | 7 | 30 | 90) => void;
  onOutro: () => void;
}) {
  const opcoes: { dias: 1 | 7 | 30 | 90 | 'outro'; rotulo: string }[] = [...PERIODOS, { dias: 'outro', rotulo: 'Outro' }];
  return (
    <XStack borderRadius={12} borderWidth={1} borderColor="$border" overflow="hidden">
      {opcoes.map((periodo) => {
        const ativo = periodo.dias === atual;
        return (
          <Pressable
            key={periodo.dias}
            onPress={() => (periodo.dias === 'outro' ? onOutro() : onEscolher(periodo.dias))}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativo }}
            style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
          >
            <YStack
              paddingVertical="$md"
              alignItems="center"
              backgroundColor={ativo ? '$control' : 'transparent'}
            >
              <Body
                fontWeight={ativo ? '600' : '400'}
                color={ativo ? '$foreground' : '$mutedForeground'}
              >
                {periodo.rotulo}
              </Body>
            </YStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}

/** Um dos números do topo. */
function Numero({ icone, valor, rotulo }: { icone: IconName; valor: string; rotulo: string }) {
  const { colors } = useTheme();
  return (
    <YStack flex={1}>
      <Card>
        <XStack alignItems="center" gap="$xs">
          <Icon name={icone} size={16} color={colors.textMuted} />
          <Label>{rotulo}</Label>
        </XStack>
        <MetricSm marginTop="$xs" numberOfLines={1}>
          {valor}
        </MetricSm>
      </Card>
    </YStack>
  );
}

/** Número pequeno com rótulo, dentro do card de exercício. */
function Miudo({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <YStack>
      <Data color="$foreground">{valor}</Data>
      <Data>{rotulo}</Data>
    </YStack>
  );
}

/** Dá ao filho a largura real — SVG precisa de número, não de porcentagem. */
function Medido({ children }: { children: (largura: number) => React.ReactNode }) {
  const [largura, onLayoutLargura] = useChartWidth();
  return (
    <XStack marginTop="$sm" onLayout={onLayoutLargura}>
      {largura > 0 ? children(largura) : null}
    </XStack>
  );
}

/**
 * `12480` → `12,5 t`; `840` → `840 kg`.
 *
 * Tonelada acima de mil porque "12.480 kg" não se lê de relance, e volume é
 * exatamente um número de relance — ninguém compara o dígito das unidades entre
 * duas semanas.
 */
function formatarVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1).replace('.', ',')} t`;
  return `${kg} kg`;
}

const emKm = (metros: number) => `${(metros / 1000).toFixed(2).replace('.', ',')} km`;

/**
 * Largura da barra relativa ao MAIOR do conjunto, com um piso visível: aqui a
 * pergunta é a proporção entre as linhas, não o valor absoluto.
 */
const fracaoDe = (valor: number, maior: number) => Math.max(valor / Math.max(maior, 1), 0.02);

/** O enum do banco em português. `PEITO` não é o que se mostra numa tela. */
const MUSCULO: Record<string, string> = {
  PEITO: 'Peito',
  COSTAS: 'Costas',
  OMBROS: 'Ombros',
  BICEPS: 'Bíceps',
  TRICEPS: 'Tríceps',
  PERNAS: 'Pernas',
  QUADRICEPS: 'Quadríceps',
  POSTERIOR: 'Posterior',
  GLUTEOS: 'Glúteos',
  PANTURRILHA: 'Panturrilha',
  ABDOMEN: 'Abdômen',
  CORE: 'Core',
  LOMBAR: 'Lombar',
  ANTEBRACO: 'Antebraço',
  TRAPEZIO: 'Trapézio',
  CARDIO: 'Cardio',
  CORPO_INTEIRO: 'Corpo inteiro',
};

const nomeDoMusculo = (chave: string) =>
  MUSCULO[chave] ?? chave.charAt(0) + chave.slice(1).toLowerCase().replace(/_/g, ' ');

const esporteMeta = (kind: string) => SPORTS.find((s) => s.kind === kind);

const nomeDoEsporte = (kind: string) => esporteMeta(kind)?.label ?? kind;

/**
 * A aba Evolução — tendência, não inventário.
 *
 * O movimento por dia vem das duas fontes; a evolução de volume, só da
 * musculação. Os check-ins são a linha do tempo consolidada, e cada um abre o
 * detalhe de onde nasceu.
 */
function Evolucao({
  dados,
  linhas,
  dias,
}: {
  dados: WorkoutDashboard | null;
  linhas: Linha[];
  dias: number;
}) {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();

  const serie = useMemo(() => movementSeries(linhas, dias, new Date()), [linhas, dias]);
  const volume = dados?.volumeEvolution ?? [];

  /*
   Constância por dia da SEMANA, não por data.

   A pergunta desta barra é "que dias funcionam para mim?" — quem sempre treina
   quarta e nunca sábado vê isso aqui, e é o insumo para o plano da próxima
   geração. Uma barra por data responderia outra pergunta, que a evolução de
   volume já responde.
  */
  const porDiaDaSemana = useMemo(() => weekdayTally(linhas), [linhas]);
  const rotulos = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <YStack marginTop="$xl" gap="$xxl">
      {serie.length > 1 ? (
        <YStack gap="$md">
          <SectionTitle>Movimento por dia</SectionTitle>
          <Card>
            <Label>minutos</Label>
            <Medido>
              {(largura) => (
                <BarChart
                  bars={serie}
                  width={largura}
                  height={152}
                  labelEvery={Math.max(1, Math.ceil(serie.length / 6))}
                  id="movimento-dia"
                />
              )}
            </Medido>
          </Card>
        </YStack>
      ) : null}

      <YStack gap="$md">
        <SectionTitle>Evolução de volume</SectionTitle>
        {volume.length > 1 ? (
          <Card>
            <Label>musculação</Label>
            <Medido>
              {(largura) => (
                <BarChart
                  bars={volume.map((d) => ({ label: d.day.slice(8), value: d.volume }))}
                  width={largura}
                  height={152}
                  labelEvery={Math.max(1, Math.ceil(volume.length / 6))}
                  id="volume-evolucao"
                />
              )}
            </Medido>
          </Card>
        ) : (
          <Body>Com mais de um dia de musculação no período, a curva aparece aqui.</Body>
        )}
      </YStack>

      <YStack gap="$md">
        <SectionTitle>Constância por dia da semana</SectionTitle>
        <Card>
          <Label>atividades</Label>
          <Medido>
            {(largura) => (
              <BarChart
                bars={porDiaDaSemana.map((v, i) => ({ label: rotulos[i], value: v }))}
                width={largura}
                height={120}
                labelEvery={1}
                id="constancia-semana"
              />
            )}
          </Medido>
        </Card>
      </YStack>

      <YStack gap="$md">
        <SectionTitle>Últimos check-ins</SectionTitle>
        {linhas.slice(0, 6).map((linha) => {
          const data = new Date(linha.quando).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
          });

          if (linha.tipo === 'esporte') {
            const sessao = linha.esporte;
            const meta = esporteMeta(sessao.sport);
            return (
              <Card
                key={`esporte-${sessao.id}`}
                onPress={() => navigation.navigate('Sport', { abrirSessao: sessao })}
                accessibilityLabel={`${nomeDoEsporte(sessao.sport)}, ${data}`}
              >
                <XStack alignItems="center" gap="$md">
                  <Icon name={meta?.icon ?? 'footprints'} size={16} color={colors.textMuted} />
                  <YStack flex={1} minWidth={0} gap={4}>
                    <Body color="$foreground" numberOfLines={1}>
                      {nomeDoEsporte(sessao.sport)}
                    </Body>
                    <Data>
                      {data} · {formatDuration(sessao.durationS)}
                      {sessao.distanceM ? ` · ${emKm(sessao.distanceM)}` : ''}
                    </Data>
                  </YStack>
                  <Icon name="arrowRight" size={16} color={colors.textMuted} />
                </XStack>
              </Card>
            );
          }

          const item = linha.treino;
          return (
            <Card
              key={`treino-${item.id}`}
              onPress={() => navigation.push('ExecutionDetail', { id: item.id })}
              accessibilityLabel={`${item.workoutName}, ${data}`}
            >
              <XStack alignItems="center" gap="$md">
                <Icon name="dumbbell" size={16} color={colors.textMuted} />
                <YStack flex={1} minWidth={0} gap={4}>
                  <Body color="$foreground" numberOfLines={1}>
                    {item.workoutName}
                  </Body>
                  <Data>
                    {data}
                    {item.durationSec ? ` · ${formatDuration(item.durationSec)}` : ''}
                  </Data>
                </YStack>
                {/*
                  O abandono é dito em palavra, não em cor: `$destructive` é
                  reservado a valor fora da faixa saudável, e pintar de vermelho
                  um treino interrompido transformaria uma escolha de rotina em
                  falha clínica.
                */}
                {item.status !== 'FINISHED' ? <Data flexShrink={0}>interrompido</Data> : null}
                <Icon name="arrowRight" size={16} color={colors.textMuted} />
              </XStack>
            </Card>
          );
        })}
      </YStack>
      <ProgressPhotos />
    </YStack>
  );
}
