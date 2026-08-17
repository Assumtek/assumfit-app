import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BandStatusLine } from '../components/BandStatus';
import { HomeBanners } from '../components/HomeBanners';
import { HomeCarousel, type HomeCard } from '../components/HomeCarousel';
import { HomeRings, type RingItem } from '../components/HomeRings';
import { Icon } from '../components/Icon';
import { MovementWeek } from '../components/MovementWeek';
import { Body, Button, Data, Label, SectionTitle } from '../components/ui';
import { Card } from '../components/ui/Card';
import { LineChart } from '../components/charts/LineChart';
import { LiveDot } from '../components/charts/LiveChart';
import { energyState } from '../domain/energy';
import { buildMovementWeek, movementMinutes } from '../domain/movement';
import { rateSleep, rateStress, shown, stateColor } from '../domain/ratings';
import { isSportDay, modalityMeta } from '../domain/workout';
import * as api from '../services/api.service';
import { supportsGattInspection } from '../services/ble';
import { useAmbientStore } from '../store/ambient.store';
import { useInsightStore } from '../store/insight.store';
import { useBiometricStore } from '../store/biometric.store';
import { useUiStore } from '../store/ui.store';
import { greeting, useUserStore } from '../store/user.store';
import { useTheme } from '../theme/ThemeProvider';

export function HomeScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const latest = useBiometricStore((s) => s.latest);
  const stressHistory = useBiometricStore((s) => s.stressHistory);
  const hrvHistory = useBiometricStore((s) => s.hrvHistory);
  const sleep = useBiometricStore((s) => s.sleep);
  const connection = useBiometricStore((s) => s.connection);
  const pairedDeviceId = useBiometricStore((s) => s.pairedDeviceId);
  const user = useUserStore((s) => s.user);
  const openSidebar = useUiStore((s) => s.openSidebar);
  const batteryPct = useBiometricStore((s) => s.batteryPct);
  const ambient = useAmbientStore((s) => s.ambient);
  const city = useAmbientStore((s) => s.city);
  const refreshAmbient = useAmbientStore((s) => s.refresh);
  const model = useInsightStore((s) => s.model);
  const insightStatus = useInsightStore((s) => s.status);
  const refreshInsight = useInsightStore((s) => s.refresh);
  const hour = new Date().getHours();
  const { width } = useWindowDimensions();
  // Largura útil do gráfico: tela − margem da home − respiro interno do card.
  const larguraGrafico = width - 48 - 40;
  // A média da última hora é a linha de base do gráfico — igual à tela de HRV.
  const mediaHrv = hrvHistory.length
    ? hrvHistory.reduce((a, b) => a + b, 0) / hrvHistory.length
    : 0;

  /**
   * O que alimenta o carrossel: o plano ativo (card de treino) e as refeições
   * de hoje (card de nutrição). `'loading'` é estado próprio — "buscando" e
   * "não há plano" pedem frases diferentes, e `null` sozinho não distingue.
   */
  const [plan, setPlan] = useState<api.TrainingPlan | null | 'loading'>('loading');
  const [mealsToday, setMealsToday] = useState<api.MealRecord[] | null>(null);

  /**
   * Minutos de movimento por dia (treino do plano concluído ou esporte
   * registrado), para a agenda de movimento. `null` = ainda não carregou ou
   * falhou — e aí o card não aparece: semana em branco por falta de rede
   * viraria mentira ("você não treinou"), e o princípio é medido ou traço.
   */
  const [movimento, setMovimento] = useState<Map<string, number> | null>(null);

  const carregarCards = useCallback(async () => {
    await Promise.all([
      api
        .fetchActivePlan()
        .then(setPlan)
        .catch(() => setPlan(null)),
      api
        .fetchMeals(1)
        .then((refeicoes) => {
          const inicio = new Date();
          inicio.setHours(0, 0, 0, 0);
          setMealsToday(refeicoes.filter((r) => new Date(r.at) >= inicio));
        })
        .catch(() => setMealsToday(null)),
      /*
       As duas fontes de movimento juntas: execuções CONCLUÍDAS do plano (o
       dashboard de volume não serve — corrida por blocos soma zero kg × reps
       e o dia sumia) e sessões de esporte. 90 dias é a janela: sequência
       maior aparece como 90 — limite documentado em `buildMovementWeek`.
       Uma fonte fora do ar não derruba a outra; as DUAS fora derrubam o card.
       */
      Promise.all([
        api.fetchExecutionHistory(90).catch(() => null),
        api.fetchSportSessions(90).catch(() => null),
      ]).then(([treinos, esportes]) => {
        if (treinos === null && esportes === null) {
          setMovimento(null);
          return;
        }
        setMovimento(movementMinutes(treinos ?? [], esportes ?? []));
      }),
    ]);
  }, []);

  useEffect(() => {
    void carregarCards();
  }, [carregarCards]);

  useEffect(() => {
    void refreshAmbient();
  }, [refreshAmbient]);

  // A hora entra na dependência: virou a hora, o insight é outro.
  useEffect(() => {
    void refreshInsight(hour);
  }, [refreshInsight, hour]);

  // Puxar para atualizar substitui o "atualizar" que morava no bloco de
  // estado: recarrega o insight à força e os dois cards de dados juntos.
  const [refreshing, setRefreshing] = useState(false);
  const aoAtualizar = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshInsight(hour, { force: true }), carregarCards()]);
    setRefreshing(false);
  }, [refreshInsight, hour, carregarCards]);

  /**
   * Sem leitura ainda — e isso NÃO pode ser um beco sem saída.
   *
   * A versão anterior devolvia uma tela com duas palavras e mais nada: sem
   * menu, sem botão, sem explicação. Quem parease a pulseira e não recebesse a
   * primeira leitura ficava preso ali sem caminho nenhum — nem para o
   * dispositivo, nem para as configurações, nem para sair. E é justamente o
   * estado mais provável de acontecer no primeiro uso, que é onde uma pessoa
   * desiste do produto.
   *
   * Agora a barra superior continua, o texto diz o que está acontecendo em
   * função do estado da conexão, e há saída para as duas ações que fazem
   * sentido: parear de novo ou abrir o menu.
   */
  if (!latest) {
    const conectado = connection === 'connected';
    return (
      <YStack flex={1} backgroundColor="$background">
        <YStack flex={1} paddingHorizontal={24} paddingBottom={insets.bottom + 48} paddingTop={insets.top + 12}>
          <Cabecalho conectado={conectado} onMenu={openSidebar} />

          {/* Bloco de espera: alinhado à esquerda, como o resto do sistema. */}
          <YStack flex={1} justifyContent="center" paddingBottom="$xxxl">
            <Label marginBottom="$sm">{greeting()}</Label>
            <SectionTitle>{user.name}</SectionTitle>

            {/* O parágrafo é a explicação DURÁVEL; o ao vivo fica na linha de
                estado abaixo, que narra a etapa em curso e muda sozinha. */}
            <Body marginTop="$lg" maxWidth="92%">
              {conectado
                ? 'Pulseira conectada. A primeira leitura entra sozinha — mantenha-a no pulso, firme e com o sensor encostado na pele.'
                : 'Sem leitura não há score — o resto do app continua acessível pelo menu.'}
            </Body>

            <BandStatusLine marginTop="$lg" />

            {/*
             Conectada e sem leitura, a ação útil é DESCOBRIR o que ela expõe
             — mas só onde isso é possível. Com o SDK do fabricante não é: ele
             fala com a pulseira por canal próprio, e o diagnóstico GATT vira
             um beco sem saída que só informa a própria impotência.

             `Button primary`, não pill à mão: a cópia manual perdia a sombra
             colorida e pintava a seta com `colors.ink`, que inverte no tema
             claro e sumia sobre o roxo.
            */}
            <YStack alignSelf="flex-start" marginTop="$xxl">
              <Button
                // Com pulseira pareada e fora do ar, a porta útil é a do
                // dispositivo — é lá que mora o Reconectar. "Parear" só para
                // quem nunca pareou; mandar quem já tem para a varredura de
                // novo é refazer um caminho que ela não precisa.
                title={
                  conectado
                    ? supportsGattInspection
                      ? 'Diagnosticar pulseira'
                      : 'Ver dispositivo'
                    : pairedDeviceId
                      ? 'Ver dispositivo'
                      : 'Parear pulseira'
                }
                onPress={() =>
                  (navigation as any).push(
                    (conectado
                      ? supportsGattInspection
                        ? 'Gatt'
                        : 'Device'
                      : pairedDeviceId
                        ? 'Device'
                        : 'Connect') as never,
                  )
                }
                // Fixo nos dois temas, como o `primaryForeground` do config e
                // pelo mesmo motivo (ver Button.tsx): sobre o roxo, só o ink
                // escuro da marca alcança contraste.
                icon={<Icon name="arrowRight" size={16} color="#0E0A22" />}
              />
            </YStack>
          </YStack>
        </YStack>
      </YStack>
    );
  }

  // Cálculo local sempre — é ele que sustenta a tela sem rede. O modelo, quando
  // responde, substitui o TEXTO e o SCORE, porque ele enxerga o que o aparelho
  // não enxerga: água registrada, sono anotado e a linha de base de 30 dias.
  const local = energyState({ reading: latest, sleep, hour });
  const insight = model?.insight ?? null;

  const energy = {
    score: model?.score ?? local.score,
    level: model?.level ?? local.level,
    calibrating: model?.calibrating ?? local.calibrating,
    title: insight?.headline ?? local.title.replace('\n', ' '),
    description: insight?.detail ?? local.description,
  };

  const abrir = (route: string) => (navigation as any).push(route as never);

  /*
   Os três indicadores do topo (decisão da fundadora, ago/2026): Sono, Stress
   e Recuperação. O anel só dá forma — cor e fração continuam decididas por
   `ratings.ts`, a mesma régua das telas de detalhe. "Recuperação" é o score
   de prontidão com o nome que a pessoa entende; a tela por trás é a de HRV,
   que é de onde ele deriva.
   */
  const sono = rateSleep(sleep?.score ?? null, sleep?.totalMin ?? null);
  /*
   O stress de agora OU o último que a pulseira registrou sozinha hoje. O
   agendamento grava a cada 30 min na memória do aparelho, e o ciclo de
   sincronização traz a série — ignorá-la deixava o anel em traço com dado
   fresco a um braço de distância.
   */
  const stressAtual =
    latest.stressScore ?? (stressHistory.length ? stressHistory[stressHistory.length - 1].value : null);
  const stress = rateStress(stressAtual);
  const rings: RingItem[] = [
    {
      key: 'sono',
      label: 'Sono',
      value: shown(sleep?.score ?? null),
      fraction: sono.fraction,
      color: stateColor(sono.state, colors),
      accessibilityLabel: `Sono: ${sono.label}, ${sono.detail}`,
      onPress: () => abrir('Sleep'),
    },
    {
      key: 'stress',
      label: 'Stress',
      value: shown(stressAtual),
      fraction: stress.fraction,
      color: stateColor(stress.state, colors),
      accessibilityLabel: `Stress: ${stress.label}, ${stress.detail}`,
      onPress: () => abrir('Stress'),
    },
    {
      key: 'recuperacao',
      label: 'Recuperação',
      value: String(energy.score),
      fraction: energy.score / 100,
      color: colors.accent,
      accessibilityLabel: `Recuperação: prontidão ${energy.score} de 100`,
      onPress: () => abrir('Hrv'),
    },
  ];

  /*
   O carrossel: um card por assunto — treino, nutrição, saúde. Cada card só
   afirma o que existe: plano sem gerar, refeição sem registrar e insight sem
   rede têm frase de estado, nunca número inventado.
   */
  const treinoHoje =
    plan !== 'loading' && plan ? plan.days.find((d) => d.dayOfWeek === plan.today) : undefined;
  const conselhoTreino =
    energy.level === 'high'
      ? 'Prontidão alta — bom dia para intensidade.'
      : energy.level === 'mid'
        ? 'Prontidão média — mantenha a execução confortável.'
        : 'Prontidão baixa — reduza o volume ou priorize técnica leve.';

  const cardTreino: HomeCard =
    plan === 'loading'
      ? {
          key: 'treino',
          title: 'treino',
          headline: 'Buscando seu plano',
          body: 'Carregando o treino de hoje.',
          onPress: () => abrir('Plan'),
        }
      : !plan
        ? {
            key: 'treino',
            title: 'treino',
            headline: 'Sem plano ativo',
            body: 'Gere um plano com a IA para receber aqui o treino de cada dia.',
            onPress: () => abrir('Plan'),
          }
        : !treinoHoje || treinoHoje.dayType === 'OFF' || !treinoHoje.workout
          ? {
              key: 'treino',
              title: 'treino',
              headline: 'Hoje é dia de descanso',
              body: 'O plano reserva hoje para recuperar — movimento leve conta a favor.',
              onPress: () => abrir('Plan'),
            }
          : {
              key: 'treino',
              title: 'treino',
              headline: treinoHoje.workout.name,
              body: conselhoTreino,
              // Dia de esporte fala a língua do esporte: "corrida", não
              // "3 exercícios".
              fact: `${
                isSportDay(treinoHoje.workout.modality)
                  ? `sessão de ${modalityMeta(treinoHoje.workout.modality).label}`
                  : `${treinoHoje.workout.exerciseCount} exercícios`
              }${
                treinoHoje.workout.estimatedDuration
                  ? ` · ~${treinoHoje.workout.estimatedDuration} min`
                  : ''
              }`,
              onPress: () => abrir('Plan'),
            };

  const kcalMin = mealsToday?.reduce((soma, r) => soma + r.kcalMin, 0) ?? 0;
  const kcalMax = mealsToday?.reduce((soma, r) => soma + r.kcalMax, 0) ?? 0;
  const cardNutricao: HomeCard =
    mealsToday && mealsToday.length
      ? {
          key: 'nutricao',
          title: 'nutrição',
          // FAIXA, não número exato: a caloria da foto é estimativa da IA, e
          // apresentá-la precisa seria mentir precisão (princípio 2).
          headline: `${kcalMin}–${kcalMax} kcal hoje`,
          body: 'Estimativa da IA pelas fotos, com as calorias da tabela TACO.',
          fact: `${mealsToday.length} ${mealsToday.length === 1 ? 'refeição registrada' : 'refeições registradas'}`,
          onPress: () => abrir('Meals'),
        }
      : {
          key: 'nutricao',
          title: 'nutrição',
          headline: 'Nenhuma refeição hoje',
          body: 'Fotografe o prato e a IA estima as calorias pela tabela TACO.',
          onPress: () => abrir('Meals'),
        };

  const cardSaude: HomeCard = {
    key: 'saude',
    title: 'saúde',
    headline: energy.title,
    body: energy.description,
    fact: insight
      ? null
      : insightStatus === 'loading'
        ? 'gerando o insight do dia…'
        : insightStatus === 'offline'
          ? 'sem rede — texto do cálculo local'
          : null,
    onPress: () => abrir('Health'),
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={{
        paddingHorizontal: 24,
        paddingBottom: insets.bottom + 48,
        paddingTop: insets.top + 12,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void aoAtualizar()}
          tintColor={colors.textMuted}
        />
      }
    >
      <Cabecalho
        conectado={connection === 'connected'}
        rotuloAoVivo="Lendo agora"
        onMenu={openSidebar}
      />

      <XStack alignItems="flex-end" justifyContent="space-between">
        <YStack flex={1}>
          <Label marginBottom="$sm">{greeting()}</Label>
          <SectionTitle>{user.name}</SectionTitle>
        </YStack>

        {/* O canto do nome: ambiente em cima, relógio embaixo. A linha do
            ambiente é contexto em texto corrido — os números grandes da tela
            são os anéis. O relógio (com a carga em texto, sem segundo ícone)
            é porta para a tela do dispositivo. */}
        <YStack alignItems="flex-end" gap="$sm" paddingBottom={2}>
          {ambient ? (
            <Data
              // Palavra além da cor no calor extremo, como antes: só a cor
              // exclui quem não separa as cores.
              color={ambient.heatStress ? '$destructive' : undefined}
              maxWidth={170}
              numberOfLines={2}
              textAlign="right"
              accessibilityLabel={`${city ? `${city}, ` : ''}${Math.round(ambient.temperatureC)} graus, ${Math.round(ambient.humidityPct)} por cento de umidade${ambient.heatStress ? ', calor extremo' : ''}`}
            >
              {city ? `${city} · ` : ''}
              {Math.round(ambient.temperatureC)} °C · {Math.round(ambient.humidityPct)}%
              {ambient.heatStress ? ' · calor extremo' : ''}
            </Data>
          ) : null}
          <Pressable
            onPress={() => abrir('Device')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={
              batteryPct != null
                ? `AssumFit Watch, bateria ${batteryPct} por cento`
                : 'AssumFit Watch, bateria não lida'
            }
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <XStack alignItems="center" gap="$sm">
              <Icon name="watch" size={18} color={colors.textMuted} strokeWidth={1.5} />
              <Data>{batteryPct != null ? `${batteryPct}%` : '—'}</Data>
            </XStack>
          </Pressable>
        </YStack>
      </XStack>

      {/* Os três anéis principais — Sono, Stress, Recuperação. O antigo bloco
          de estado (manchete + régua + botão de ação) virou o card de saúde do
          carrossel; o score continua aqui, dentro do anel de Recuperação. */}
      <YStack paddingTop="$xxxl" paddingBottom="$xxl">
        <HomeRings items={rings} />
      </YStack>

      <HomeCarousel cards={[cardTreino, cardNutricao, cardSaude]} />

      {/* A agenda de movimento entre o carrossel e os instrumentos de hoje:
          o que foi CUMPRIDO, não o que foi planejado — o planejado mora na
          tela do plano. Não depende de haver plano: esporte avulso também é
          movimento. O toque abre o progresso, que é onde a história inteira
          está. */}
      {movimento ? (
        <YStack marginTop="$xxl">
          <MovementWeek
            semana={buildMovementWeek(movimento, new Date())}
            onPress={() => abrir('Progress')}
          />
        </YStack>
      ) : null}

      {/* Os dois instrumentos de hoje, meio a meio: água (entrada) e bateria
          do corpo (reserva) — a mesma família visual, forma preenchida até a
          fração. */}
      {/* O gráfico de HRV, de volta (decisão da fundadora, ago/2026): a curva
          da última hora contra a faixa da própria média — só quando há
          medição, nunca decoração vazia. */}
      {hrvHistory.length >= 2 ? (
        <YStack marginTop="$xxl">
          <Card onPress={() => abrir('Hrv')} accessibilityLabel="Variabilidade cardíaca, abrir detalhe">
            <Label marginBottom="$md">variabilidade (hrv)</Label>
            <LineChart
              data={hrvHistory}
              width={larguraGrafico}
              height={120}
              markLast
              band={{ from: mediaHrv * 0.85, to: mediaHrv * 1.15 }}
              thresholds={[{ value: mediaHrv, label: 'sua média' }]}
              xLabels={['1h atrás', '30 min', 'agora']}
              id="hrv-home"
            />
          </Card>
        </YStack>
      ) : null}

      {/* Os banners do rodapé, passando sozinhos. */}
      <YStack marginTop="$xxl">
        <HomeBanners aoAbrir={abrir} />
      </YStack>

    </ScrollView>
  );
}

/**
 * O cabeçalho da home, um só para os dois estados da tela.
 *
 * Existiam duas cópias — uma no estado vazio, outra no estado com dado — e elas
 * já divergiam no rótulo de conexão. Duas cópias de um cabeçalho é o lugar
 * clássico onde um ícone novo entra num e esquece do outro.
 *
 * Ajuda e avisos ficam à ESQUERDA do estado de conexão, e o estado fica na
 * ponta: ele é informação contínua, os dois ícones são portas. Misturar a ordem
 * faria a pessoa procurar o status entre botões.
 */
function Cabecalho({
  conectado,
  rotuloAoVivo = 'Conectado',
  onMenu,
}: {
  conectado: boolean;
  rotuloAoVivo?: string;
  onMenu: () => void;
}) {
  const { colors } = useTheme();
  const navigation = useNavigation();

  return (
    <XStack alignItems="center" justifyContent="space-between" marginBottom="$xxxl">
      {/* O sanduíche VISÍVEL — as duas linhas finas eram discretas demais para
          a porta de TODA a navegação (feedback de campo, jul/2026). Três
          traços de 24px no peso cheio; hitSlop completa os 44pt. */}
      <Pressable
        onPress={onMenu}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Abrir menu"
        style={({ pressed }) => pressed && { opacity: 0.6 }}
      >
        <Icon name="menu" size={24} strokeWidth={2} color={colors.text} />
      </Pressable>

      <XStack alignItems="center" gap="$lg">
        <Pressable
          onPress={() => (navigation as any).push('Help' as never)}
          hitSlop={13}
          accessibilityRole="button"
          accessibilityLabel="Ajuda"
        >
          <Icon name="help" size={19} color={colors.textMuted} />
        </Pressable>

        <Pressable
          onPress={() => (navigation as any).push('Alerts' as never)}
          hitSlop={13}
          accessibilityRole="button"
          accessibilityLabel="Avisos"
        >
          <Icon name="bell" size={19} color={colors.textMuted} />
        </Pressable>

        <XStack alignItems="center" gap="$sm">
          {conectado ? <LiveDot /> : null}
          <Label>{conectado ? rotuloAoVivo : 'Sem conexão'}</Label>
        </XStack>
      </XStack>
    </XStack>
  );
}
