import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { MetricBlock } from '../components/MetricBlock';
import { Body, Button, Data, Headline, Label, Metric, MetricSm, SectionTitle } from '../components/ui';
import { DayCurve } from '../components/charts/DayCurve';
import { LiveChart, LiveDot } from '../components/charts/LiveChart';
import { Meter } from '../components/charts/Meter';
import { calcBioAge } from '../domain/bioAge';
import { CALIBRATION_DAYS, ENERGY_BANDS, energyState } from '../domain/energy';
import { frescor, rateHeartRate, rateHrv, rateSleep, rateSpo2 } from '../domain/ratings';
import { supportsGattInspection } from '../services/ble';
import { useAmbientStore } from '../store/ambient.store';
import { useInsightStore } from '../store/insight.store';
import { deepSleepPct, useBiometricStore } from '../store/biometric.store';
import { useWorkoutStore } from '../store/workout.store';
import { useUiStore } from '../store/ui.store';
import { greeting, useUserStore } from '../store/user.store';
import type { TrainingPlan } from '../services/api.service';
import { useBottomClearance } from '../components/TabBar';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Para onde cada ação do estado leva. O ícone já identifica a ação em
 * `energy.ts`, então ele serve de chave — assim não existe uma terceira lista
 * para manter em sincronia com as outras duas.
 */
const ACTION_ROUTE = {
  play: 'Focus',
  calendar: 'Agenda',
  drop: 'Habits',
  dumbbell: 'Plan',
  footprints: 'Sport',
  flame: 'Meals',
} as const;

export function HomeScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const folgaInferior = useBottomClearance();
  const latest = useBiometricStore((s) => s.latest);
  const sleep = useBiometricStore((s) => s.sleep);
  const connection = useBiometricStore((s) => s.connection);
  const user = useUserStore((s) => s.user);
  const age = useUserStore((s) => s.age());
  const openSidebar = useUiStore((s) => s.openSidebar);
  const hrvHistory = useBiometricStore((s) => s.hrvHistory);
  const [chartWidth, setChartWidth] = useState(0);
  const ambient = useAmbientStore((s) => s.ambient);
  const city = useAmbientStore((s) => s.city);
  const refreshAmbient = useAmbientStore((s) => s.refresh);
  const model = useInsightStore((s) => s.model);
  const insightStatus = useInsightStore((s) => s.status);
  const refreshInsight = useInsightStore((s) => s.refresh);
  const plan = useWorkoutStore((s) => s.plan);
  const refreshWorkout = useWorkoutStore((s) => s.refresh);
  const [curveWidth, setCurveWidth] = useState(0);
  const hour = new Date().getHours();

  useEffect(() => {
    void refreshAmbient();
  }, [refreshAmbient]);

  // O treino do dia na home precisa do plano carregado; o refresh já é
  // fail-soft (catch interno) e barato — o widget depende do mesmo dado.
  useEffect(() => {
    void refreshWorkout();
  }, [refreshWorkout]);

  // A hora entra na dependência: virou a hora, o insight é outro.
  useEffect(() => {
    void refreshInsight(hour);
  }, [refreshInsight, hour]);

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
        <YStack flex={1} paddingHorizontal={24} paddingBottom={folgaInferior} paddingTop={insets.top + 12}>
          <Cabecalho conectado={conectado} onMenu={openSidebar} />

          {/* Bloco de espera: alinhado à esquerda, como o resto do sistema. */}
          <YStack flex={1} justifyContent="center" paddingBottom="$xxxl">
            <Label marginBottom="$sm">{greeting()}</Label>
            <SectionTitle>{user.name}</SectionTitle>

            <Body marginTop="$lg" marginBottom="$xxl" maxWidth="92%">
              {conectado
                ? 'Pulseira conectada, aguardando a primeira leitura. Ela precisa estar no pulso, firme e com o sensor encostado na pele.'
                : 'Nenhuma pulseira conectada. Sem leitura não há score — o resto do app continua acessível pelo menu.'}
            </Body>

            {/*
             Conectada e sem leitura, a ação útil é DESCOBRIR o que ela expõe
             — mas só onde isso é possível. Com o SDK do fabricante não é: ele
             fala com a pulseira por canal próprio, e o diagnóstico GATT vira
             um beco sem saída que só informa a própria impotência.

             `Button primary`, não pill à mão: a cópia manual perdia a sombra
             colorida e pintava a seta com `colors.ink`, que inverte no tema
             claro e sumia sobre o roxo.
            */}
            <YStack alignSelf="flex-start">
              <Button
                title={conectado ? (supportsGattInspection ? 'Diagnosticar pulseira' : 'Ver dispositivo') : 'Parear pulseira'}
                onPress={() =>
                  (navigation as any).navigate((conectado ? (supportsGattInspection ? 'Gatt' : 'Device') : 'Connect') as never)
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
    eyebrow: insight?.eyebrow ?? local.eyebrow,
    title: insight?.headline ?? local.title.replace('\n', ' '),
    description: insight?.detail ?? local.description,
    nextLabel: insight?.nextLabel ?? local.nextLabel,
    action: insight
      ? { label: insight.action.label, icon: insight.action.key }
      : local.action,
  };

  // A curva do dia: a do modelo quando respondeu (conhece água/sono/base de
  // 30 dias); a local sempre existe e sustenta o offline.
  const curva = model?.curve?.length ? model.curve.map((p) => p.score) : local.curve;

  // Mesmo cálculo offline da tela de detalhe (o gêmeo com paridade testada).
  const bio = calcBioAge({
    realAge: age,
    sex: user.sex,
    hrvMs: latest.hrvMs,
    restingHr: latest.heartRate,
    spo2Pct: latest.spo2Pct,
    deepSleepPct: sleep ? deepSleepPct(sleep) : null,
    tempRangeC: null,
  });
  const resumoBioAge =
    bio.delta > 0
      ? `${bio.bioAge} anos — ${bio.delta} ${bio.delta === 1 ? 'ano abaixo' : 'anos abaixo'} da real`
      : bio.delta < 0
        ? `${bio.bioAge} anos — ${Math.abs(bio.delta)} ${Math.abs(bio.delta) === 1 ? 'ano acima' : 'anos acima'} da real`
        : `${bio.bioAge} anos — igual à idade real`;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={{
        paddingHorizontal: 24,
        paddingBottom: folgaInferior,
        paddingTop: insets.top + 12,
      }}
      showsVerticalScrollIndicator={false}
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

        {/* Ambiente em número, ao lado do nome. Fica FORA do grid 2×2 de
            propósito: o grid é o corpo da pessoa, e 25° não é métrica dela. */}
        {ambient ? (
          // Um nó só no VoiceOver: sem o agrupamento, o leitor recitava
          // "São Paulo", "25", "°C", "60", "%" como cinco itens soltos.
          <YStack
            alignItems="flex-end"
            paddingBottom={2}
            accessible
            accessibilityLabel={`${city ? `${city}, ` : ''}${Math.round(ambient.temperatureC)} graus, ${Math.round(ambient.humidityPct)} por cento de umidade${ambient.heatStress ? ', calor extremo' : ''}`}
          >
            {city ? (
              <Label marginBottom="$xs" maxWidth={150} textAlign="right" numberOfLines={1}>
                {city}
              </Label>
            ) : null}
            {/* MetricSm, não 30pt cru: o ambiente é contexto, e a 30 ele
                disputava com o score — o único número grande da tela é o
                instrumento. */}
            <XStack alignItems="baseline" gap="$xs">
              <MetricSm color={ambient.heatStress ? '$destructive' : '$foreground'}>
                {Math.round(ambient.temperatureC)}
              </MetricSm>
              <Data>°C</Data>
              <MetricSm color="$mutedForeground" marginLeft="$sm">
                {Math.round(ambient.humidityPct)}
              </MetricSm>
              <Data>%</Data>
            </XStack>
            {/* Em PALAVRA, além da cor: só o número terracota exclui quem não
                separa as cores — e some no modo de alto contraste. */}
            {ambient.heatStress ? <Data color="$destructive">calor extremo</Data> : null}
          </YStack>
        ) : null}
      </XStack>

      {/* Estado do dia. Alinhado à esquerda, sem caixa, sem ícone decorativo.
          O Atualizar relê o DIA no servidor — treino, esporte, refeições,
          passos, água — e rediz a frase; sem ele, o texto só mudaria na virada
          da hora. */}
      <YStack paddingTop="$xxxl" paddingBottom="$xl">
        <XStack alignItems="center" justifyContent="space-between" marginBottom="$md">
          <Label>{energy.eyebrow}</Label>
          <Pressable
            onPress={() => void refreshInsight(hour, { force: true })}
            disabled={insightStatus === 'loading'}
            // 44pt de alvo efetivo: o texto tem ~16pt de altura.
            hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Atualizar leitura"
            style={({ pressed }) => pressed && { opacity: 0.5 }}
          >
            <XStack alignItems="center" gap="$xs">
              {insightStatus === 'loading' ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Icon name="refresh" size={13} color={colors.textMuted} strokeWidth={1.5} />
              )}
              {/* Apertou e falhou não pode terminar em silêncio: o rótulo diz
                  que a releitura não veio e que dá para tentar de novo. */}
              <Data>
                {insightStatus === 'loading'
                  ? 'relendo…'
                  : insightStatus === 'offline'
                    ? 'sem rede — tentar de novo'
                    : 'atualizar'}
              </Data>
            </XStack>
          </Pressable>
        </XStack>
        <Headline marginBottom="$md">{energy.title}</Headline>
        <Body marginBottom="$lg" maxWidth="92%">
          {energy.description}
        </Body>

        {/* Contexto do perfil de rotina. Fica separado do parágrafo fisiológico
            de propósito: um veio da medição, o outro do que a pessoa contou, e
            misturar os dois apagaria a diferença. */}
        {insight?.context ? (
          <XStack gap="$md" marginBottom="$xl" maxWidth="94%">
            {/* Fio de acento: marca a frase como vinda do perfil, sem virar caixa. */}
            <YStack width={2} borderRadius={1} backgroundColor="$primary" opacity={0.6} />
            <Body flex={1}>{insight.context}</Body>
          </XStack>
        ) : null}

        <XStack
          alignItems="flex-end"
          gap="$lg"
          // Um nó só: "72" solto e três palavras de faixa não contam a
          // história; o rótulo junta score, faixa e a transição calculada.
          accessible
          accessibilityLabel={`Energia ${energy.score} de 100, nível ${
            energy.level === 'low' ? 'baixo' : energy.level === 'mid' ? 'médio' : 'alto'
          }${energy.nextLabel ? `, ${energy.nextLabel}` : ''}`}
        >
          <Metric lineHeight={46}>{energy.score}</Metric>
          <YStack flex={1} paddingBottom={4}>
            {/*
             Sempre no acento. Energia baixa às 22h É a faixa saudável — o
             corpo funcionando —, e `$destructive` é reservado a valor fora
             dela (regra 3). Pintar o marcador de alerta toda noite fabricaria
             achado clínico e contradiria o próprio texto ("reserve o horário
             para tarefas leves"). A POSIÇÃO na faixa "baixo" já comunica.
            */}
            <Meter
              value={energy.score}
              color={colors.accent}
              zones={[
                { upTo: ENERGY_BANDS.mid, label: 'baixo' },
                { upTo: ENERGY_BANDS.high, label: 'médio' },
                { upTo: 100, label: 'alto' },
              ]}
            />
            {energy.nextLabel ? (
              <Data marginTop="$sm">energia · {energy.nextLabel}</Data>
            ) : null}
          </YStack>
        </XStack>

        {/*
          A curva das 24 HORAS — calculada desde sempre (local e modelo) e
          nunca mostrada. Sem ela, "seu corpo decide o dia" era "decide a
          hora": a régua diz onde você está, a curva diz o que ainda vem. O
          toque abre a Agenda, que é onde a curva vira janela de compromisso.
        */}
        <Pressable
          onPress={() => (navigation as any).navigate('Agenda' as never)}
          accessibilityRole="button"
          accessibilityLabel={`Curva de energia do dia${energy.nextLabel ? `, ${energy.nextLabel}` : ''}. Abre a agenda`}
          style={({ pressed }) => pressed && { opacity: 0.7 }}
        >
          <YStack
            marginTop="$lg"
            onLayout={(e: LayoutChangeEvent) => setCurveWidth(e.nativeEvent.layout.width)}
          >
            <DayCurve data={curva} hour={hour} width={curveWidth} />
            <Data marginTop="$xs">sua curva de hoje · agenda</Data>
          </YStack>
        </Pressable>

        {/* Só no modo local: o texto do modelo já explica a calibração dentro
            do próprio parágrafo, e repetir aqui daria o mesmo aviso duas vezes
            na mesma tela. */}
        {energy.calibrating && !insight ? (
          <Data marginTop="$md">
            Calibrando — precisão individual após {CALIBRATION_DAYS} dias
          </Data>
        ) : null}

        <YStack alignSelf="flex-start" marginTop="$xl">
          <Button
            title={energy.action.label}
            onPress={() => (navigation as any).navigate(ACTION_ROUTE[energy.action.icon] as never)}
            icon={<Icon name="arrowRight" size={16} color="#0E0A22" />}
          />
        </YStack>
      </YStack>

      {/*
        O treino do dia com presença ESTRUTURAL — o pilar "IA que age" não
        pode depender de a IA escolher a ação `dumbbell` naquela hora. Peça
        fixa: treino do plano quando há, descanso quando é descanso, convite
        quando não há plano. A palavra "treino" volta a existir na home.
      */}
      <TreinoDeHoje plan={plan} onPress={() => (navigation as any).navigate('Plan' as never)} />

      {/* Série ao vivo: o pulso na ponta é o que diferencia dado corrente de número parado. */}
      <YStack
        marginBottom="$xl"
        onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}
      >
        <LiveChart
          data={hrvHistory}
          width={chartWidth}
          height={92}
          /*
           A idade do HRV vem do DADO, não de um texto fixo.

           Antes dizia "atualiza a cada 2 s" — cadência do wearable simulado,
           que emite a cada 1,8 s. Na pulseira real o HRV é medido em janelas
           agendadas, e a amostra pode ter horas. Prometer segundos ali fazia a
           tela apresentar dado velho como corrente.
           */
          label={
            latest.hrvMs == null
              ? `FC · ${Math.round(latest.heartRate)} bpm · ao vivo`
              : [`HRV · ${Math.round(latest.hrvMs)} ms`, frescor(latest.hrvAt, Date.now())]
                  .filter(Boolean)
                  .join(' · ')
          }
          id="homeLive"
        />
      </YStack>

      <XStack gap="$sm" marginBottom="$sm">
        <MetricBlock
          label="HRV"
          rating={rateHrv(latest.hrvMs)}
          onPress={() => (navigation as any).navigate('Hrv' as never)}
        />
        <MetricBlock
          label="Sono"
          rating={rateSleep(sleep?.score ?? null, sleep?.totalMin ?? null)}
          onPress={() => (navigation as any).navigate('Sleep' as never)}
        />
      </XStack>
      <XStack gap="$sm" marginBottom="$sm">
        <MetricBlock
          label="Oxigênio"
          rating={rateSpo2(latest.spo2Pct)}
          onPress={() => (navigation as any).navigate('Oxygen' as never)}
        />
        {/* Mesmo destino do HRV de propósito: FC de repouso e variabilidade
            são a mesma tela ("Coração e HRV") — o título de lá assume os dois
            nomes para o toque não parecer rota errada. */}
        <MetricBlock
          label="Coração"
          rating={rateHeartRate(latest.heartRate)}
          onPress={() => (navigation as any).navigate('Hrv' as never)}
        />
      </XStack>

      {/*
        O fecho da tela — antes o scroll morria seco no card de menor
        hierarquia. Idade biológica é gancho da assinatura e morava no
        penúltimo card da segunda aba; e o grid 2×2 parecia o inventário
        completo quando esconde seis métricas. As duas linhas resolvem os
        dois: um fim com valor, e a porta anunciada para o resto.
      */}
      <YStack marginTop="$lg">
        <Fecho
          rotulo="Idade biológica"
          valor={resumoBioAge}
          onPress={() => (navigation as any).navigate('BioAge' as never)}
        />
        <Fecho
          rotulo="Tudo que a pulseira mede"
          valor="estresse, pressão, passos e mais"
          onPress={() => (navigation as any).navigate('Health' as never)}
        />
      </YStack>
    </ScrollView>
  );
}

/** A peça fixa do treino — plano de hoje, descanso, ou o convite para gerar. */
function TreinoDeHoje({ plan, onPress }: { plan: TrainingPlan | null; onPress: () => void }) {
  const { colors } = useTheme();
  const hoje = plan?.days.find((d) => d.dayOfWeek === plan.today);
  const treino = hoje?.workout ?? null;

  const titulo = !plan ? 'Monte seu treino com a IA' : treino ? treino.name : 'Descanso programado';
  const detalhe = !plan
    ? 'anamnese e plano personalizado em minutos'
    : treino
      ? [
          treino.estimatedDuration ? `~${treino.estimatedDuration} min` : null,
          `${treino.exerciseCount} ${treino.exerciseCount === 1 ? 'exercício' : 'exercícios'}`,
        ]
          .filter(Boolean)
          .join(' · ')
      : 'recuperação é o que faz a adaptação acontecer';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Treino de hoje: ${titulo}`}
      style={({ pressed }) => pressed && { opacity: 0.6 }}
    >
      <XStack
        alignItems="center"
        gap="$md"
        paddingVertical="$lg"
        borderTopWidth={1}
        borderBottomWidth={1}
        borderColor="$border"
        marginBottom="$xl"
      >
        <YStack flex={1} minWidth={0} gap={2}>
          <Label>treino de hoje</Label>
          <SectionTitle numberOfLines={1}>{titulo}</SectionTitle>
          <Data numberOfLines={1}>{detalhe}</Data>
        </YStack>
        <Icon name="arrowRight" size={16} color={colors.textMuted} />
      </XStack>
    </Pressable>
  );
}

/** Linha de fecho: um destino anunciado com o valor dele — nunca um card. */
function Fecho({ rotulo, valor, onPress }: { rotulo: string; valor: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${rotulo}: ${valor}`}
      style={({ pressed }) => pressed && { opacity: 0.6 }}
    >
      <XStack alignItems="center" gap="$md" paddingVertical="$md" borderTopWidth={1} borderColor="$border">
        <YStack flex={1} minWidth={0} gap={2}>
          <Body color="$foreground">{rotulo}</Body>
          <Data numberOfLines={1}>{valor}</Data>
        </YStack>
        <Icon name="arrowRight" size={14} color={colors.textMuted} />
      </XStack>
    </Pressable>
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
      {/* hitSlops calculados para 44×44pt EFETIVOS (piso do iOS): o desenho do
          hambúrguer tem 18×7; os ícones, 19. O alvo cresce, o traço não. */}
      <Pressable
        onPress={onMenu}
        hitSlop={{ top: 19, bottom: 19, left: 13, right: 13 }}
        accessibilityRole="button"
        accessibilityLabel="Abrir menu"
      >
        <YStack width={18} height={1} backgroundColor="$foreground" marginBottom={5} />
        <YStack width={12} height={1} backgroundColor="$foreground" />
      </Pressable>

      <XStack alignItems="center" gap="$lg">
        <Pressable
          onPress={() => (navigation as any).navigate('Help' as never)}
          hitSlop={13}
          accessibilityRole="button"
          accessibilityLabel="Ajuda"
        >
          <Icon name="help" size={19} color={colors.textMuted} />
        </Pressable>

        <Pressable
          onPress={() => (navigation as any).navigate('Alerts' as never)}
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
