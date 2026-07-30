import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { Note } from '../../components/Card';
import { BarChart } from '../../components/charts/BarChart';
import { DetailScreen, usePullRefresh } from '../../components/DetailScreen';
import { Icon, type IconName } from '../../components/Icon';
import { Body, Card, Data, Label, MetricSm, SectionTitle } from '../../components/ui';
import { formatDuration } from '../../domain/workout';
import {
  fetchDashboard,
  fetchExecutionHistory,
  type ExecutionHistoryItem,
  type WorkoutDashboard,
} from '../../services/api.service';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Progresso — o relatório completo do que foi treinado.
 *
 * Estrutura portada do `StudentProgressReport` do MUVX: quatro números no topo,
 * volume por grupo muscular, evolução do volume e o detalhe exercício por
 * exercício. O seletor de período (hoje / 7 / 30 / 90) também é de lá.
 *
 * ## Volume load é o número que faltava no app
 *
 * `carga × repetições`, somado. É a única métrica que responde "estou
 * progredindo?" — contagem de treinos responde "estou aparecendo", que é outra
 * pergunta. Duas sessões de peito com as mesmas séries podem ter volumes muito
 * diferentes, e é essa diferença que move adaptação.
 *
 * A agregação é toda do servidor. Trazer as séries cruas de 90 dias para o app
 * somar significaria trafegar tudo por causa de um gráfico de barras, e
 * recalcular a cada troca de período.
 */

const PERIODOS = [
  { dias: 1 as const, rotulo: 'Hoje' },
  { dias: 7 as const, rotulo: '7 dias' },
  { dias: 30 as const, rotulo: '30 dias' },
  { dias: 90 as const, rotulo: '90 dias' },
];

export function ProgressScreen() {
  const [aba, setAba] = useState<'treinos' | 'evolucao'>('treinos');
  const [dias, setDias] = useState<1 | 7 | 30 | 90>(30);
  const [dados, setDados] = useState<WorkoutDashboard | null>(null);
  const [historico, setHistorico] = useState<ExecutionHistoryItem[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = React.useCallback(
    () =>
      Promise.all([
        fetchDashboard(dias).then(setDados),
        fetchExecutionHistory(dias).then(setHistorico),
      ]).catch(() => setDados(null)),
    [dias],
  );

  useEffect(() => {
    setCarregando(true);
    void carregar().finally(() => setCarregando(false));
  }, [carregar]);

  const refresh = usePullRefresh(carregar);

  const vazio = !dados || dados.summary.totalWorkouts === 0;

  return (
    <DetailScreen title="Progresso" refreshControl={refresh}>
      {/*
        Treinos e Evolução são ABAS da mesma tela, como no MUVX.

        A Evolução era uma tela própria no menu rápido, e a separação obrigava a
        escolher a porta certa antes de saber o que havia atrás de cada uma. As
        duas respondem a mesma pergunta em janelas diferentes — "o que eu fiz" e
        "para onde estou indo" — e trocar de aba preserva o período escolhido.
      */}
      <XStack borderRadius={10} borderWidth={1} borderColor="$border" overflow="hidden" marginBottom="$md">
        {(
          [
            ['treinos', 'Treinos'],
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
              <Text
                fontSize={14}
                fontWeight={aba === chave ? '700' : '400'}
                color={aba === chave ? '$foreground' : '$mutedForeground'}
              >
                {rotulo}
              </Text>
            </YStack>
          </Pressable>
        ))}
      </XStack>

      <SeletorDePeriodo atual={dias} onEscolher={setDias} />

      {carregando ? (
        <Body marginTop="$xl">Carregando…</Body>
      ) : vazio ? (
        <Note
          title="Nada treinado neste período"
          body="Séries, repetições e volume aparecem aqui depois da primeira sessão concluída. Troque o período acima para olhar mais para trás."
        />
      ) : aba === 'evolucao' ? (
        <Evolucao dados={dados} historico={historico} />
      ) : (
        <>
          <YStack gap="$md" marginTop="$xl">
            <XStack gap="$md">
              <Numero icone="dumbbell" valor={String(dados.summary.totalWorkouts)} rotulo="treinos" />
              <Numero icone="checklist" valor={String(dados.summary.totalSeries)} rotulo="séries" />
            </XStack>
            <XStack gap="$md">
              <Numero icone="skip" valor={String(dados.summary.totalReps)} rotulo="repetições" />
              <Numero
                icone="clock"
                valor={formatDuration(dados.summary.totalDuration)}
                rotulo="tempo total"
              />
            </XStack>
          </YStack>

          {/*
            Volume load em destaque, sozinho e maior.

            É o número que responde progressão, e enfileirá-lo com os outros
            quatro o faria parecer um a mais. Em toneladas quando passa de mil:
            "12.480 kg" é difícil de ler de relance, "12,5 t" não.
          */}
          <YStack marginTop="$md">
            <Card>
            <Label>volume total</Label>
            <XStack alignItems="baseline" gap="$sm" marginTop="$xs">
              <Text fontSize={38} fontWeight="200" letterSpacing={-1.6} color="$foreground" fontVariant={['tabular-nums']}>
                {formatarVolume(dados.summary.volumeLoad)}
              </Text>
              <Data>carga × repetições</Data>
            </XStack>
            </Card>
          </YStack>

          {dados.volumeEvolution.length > 1 ? (
            <YStack marginTop="$xxl" gap="$md">
              <SectionTitle>Volume por dia</SectionTitle>
              <Card>
                <Medido>
                  {(largura) => (
                    <BarChart
                      bars={dados.volumeEvolution.map((d) => ({
                        label: d.day.slice(8),
                        value: d.volume,
                      }))}
                      width={largura}
                      height={150}
                      labelEvery={Math.max(1, Math.ceil(dados.volumeEvolution.length / 6))}
                    />
                  )}
                </Medido>
              </Card>
            </YStack>
          ) : null}

          {dados.muscleDistribution.length > 0 ? (
            <YStack marginTop="$xxl" gap="$md">
              <SectionTitle>Por grupo muscular</SectionTitle>
              {dados.muscleDistribution.map((grupo) => (
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
                  {/*
                    A barra é relativa ao MAIOR grupo do período, não a um teto
                    fixo: aqui a pergunta é a proporção entre grupos — se o
                    treino está desequilibrado —, e não o valor absoluto.
                  */}
                  <YStack height={4} borderRadius={2} backgroundColor="$track" marginTop="$sm" overflow="hidden">
                    <YStack
                      height={4}
                      borderRadius={2}
                      backgroundColor="$primary"
                      width={`${fracaoDoMaior(grupo.volume, dados.muscleDistribution) * 100}%`}
                    />
                  </YStack>
                </Card>
              ))}
            </YStack>
          ) : null}

          <YStack marginTop="$xxl" gap="$md">
            <SectionTitle>Exercícios realizados</SectionTitle>
            {dados.exercisesDetail.map((exercicio) => (
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
                      Carga máxima só aparece quando houve peso externo. Flexão e
                      prancha entram com carga nula, e "0 kg" ali afirmaria que a
                      pessoa levantou zero em vez de que o exercício é de peso
                      corporal.
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
      )}
    </DetailScreen>
  );
}

/** Abas de período. Segmentado, não dropdown: são quatro e cabem numa linha. */
function SeletorDePeriodo({
  atual,
  onEscolher,
}: {
  atual: number;
  onEscolher: (dias: 1 | 7 | 30 | 90) => void;
}) {
  return (
    <XStack borderRadius={10} borderWidth={1} borderColor="$border" overflow="hidden">
      {PERIODOS.map((periodo) => {
        const ativo = periodo.dias === atual;
        return (
          <Pressable
            key={periodo.dias}
            onPress={() => onEscolher(periodo.dias)}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativo }}
            style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
          >
            <YStack
              paddingVertical="$md"
              alignItems="center"
              backgroundColor={ativo ? '$control' : 'transparent'}
            >
              <Text
                fontSize={13}
                fontWeight={ativo ? '600' : '400'}
                color={ativo ? '$foreground' : '$mutedForeground'}
              >
                {periodo.rotulo}
              </Text>
            </YStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}

/** Um dos quatro números do topo. */
function Numero({ icone, valor, rotulo }: { icone: IconName; valor: string; rotulo: string }) {
  const { colors } = useTheme();
  return (
    <YStack flex={1}>
      <Card>
        <XStack alignItems="center" gap="$xs">
          <Icon name={icone} size={13} color={colors.textMuted} />
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
  const [largura, setLargura] = useState(0);
  return (
    <XStack marginTop="$sm" onLayout={(e) => setLargura(e.nativeEvent.layout.width)}>
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

function fracaoDoMaior(volume: number, todos: { volume: number }[]): number {
  const maior = Math.max(...todos.map((t) => t.volume), 1);
  return Math.max(volume / maior, 0.02);
}

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

/**
 * A aba Evolução — tendência, não inventário.
 *
 * Três blocos, como no MUVX: a evolução do volume no período, a constância por
 * dia da semana e os últimos check-ins. O que era a tela "Evolução" (treinos
 * por semana) está coberto pelos dois primeiros.
 */
function Evolucao({
  dados,
  historico,
}: {
  dados: WorkoutDashboard;
  historico: ExecutionHistoryItem[];
}) {
  const { colors } = useTheme();

  /*
   Constância por dia da SEMANA, não por data.

   A pergunta desta barra é "que dias funcionam para mim?" — quem sempre treina
   quarta e nunca sábado vê isso aqui, e é o insumo para o plano da próxima
   geração. Uma barra por data responderia outra pergunta, que a evolução de
   volume já responde.
  */
  const porDiaDaSemana = new Array(7).fill(0);
  for (const item of historico) {
    if (item.status === 'FINISHED') porDiaDaSemana[new Date(item.startedAt).getDay()] += 1;
  }
  const rotulos = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <YStack marginTop="$xl" gap="$xxl">
      <YStack gap="$md">
        <SectionTitle>Evolução de volume</SectionTitle>
        {dados.volumeEvolution.length > 1 ? (
          <Card>
            <Medido>
              {(largura) => (
                <BarChart
                  bars={dados.volumeEvolution.map((d) => ({ label: d.day.slice(8), value: d.volume }))}
                  width={largura}
                  height={150}
                  labelEvery={Math.max(1, Math.ceil(dados.volumeEvolution.length / 6))}
                />
              )}
            </Medido>
          </Card>
        ) : (
          <Body>Com mais de um dia treinado no período, a curva aparece aqui.</Body>
        )}
      </YStack>

      <YStack gap="$md">
        <SectionTitle>Constância por dia da semana</SectionTitle>
        <Card>
          <Medido>
            {(largura) => (
              <BarChart
                bars={porDiaDaSemana.map((v, i) => ({ label: rotulos[i], value: v }))}
                width={largura}
                height={120}
                labelEvery={1}
              />
            )}
          </Medido>
        </Card>
      </YStack>

      <YStack gap="$md">
        <SectionTitle>Últimos check-ins</SectionTitle>
        {historico.slice(0, 6).map((item) => (
          <Card key={item.id}>
            <XStack alignItems="center" gap="$md">
              <YStack flex={1} minWidth={0} gap={2}>
                <Body color="$foreground" numberOfLines={1}>
                  {item.workoutName}
                </Body>
                <Data>
                  {new Date(item.startedAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                  {item.durationSec ? ` · ${formatDuration(item.durationSec)}` : ''}
                </Data>
              </YStack>
              <Data color={item.status === 'FINISHED' ? '$primary' : '$faint'}>
                {item.status === 'FINISHED' ? 'Concluído' : 'Interrompido'}
              </Data>
              <Icon name="arrowRight" size={14} color={colors.textMuted} />
            </XStack>
          </Card>
        ))}
      </YStack>
    </YStack>
  );
}
