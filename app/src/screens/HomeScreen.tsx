import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BandStatusLine } from '../components/BandStatus';
import { HomeBanners } from '../components/HomeBanners';
import { HomeRings } from '../components/HomeRings';
import { IndicatorList } from '../components/IndicatorList';
import { AssinaturaDoDia } from '../components/home/AssinaturaDoDia';
import { BlocoConquistas } from '../components/home/BlocoConquistas';
import { BlocoMetas } from '../components/home/BlocoMetas';
import { BlocoSemana } from '../components/home/BlocoSemana';
import { BlocoTendencias } from '../components/home/BlocoTendencias';
import { assinaturaDoDia, diasComparaveis } from '../domain/assinatura';
import { indicadoresDaHome } from '../domain/homeIndicators';
import { ageFromBirthDate, calorieGoal } from '../domain/nutritionGoal';
import { useHabitsStore } from '../store/habits.store';
import { useWorkoutStore } from '../store/workout.store';
import { Icon } from '../components/Icon';
import { PermissionGate, permissaoNegadaEm } from '../components/PermissionGate';
import { SyncProgress } from '../components/SyncProgress';
import { Body, Button, Data, Label, SectionTitle } from '../components/ui';
import { Card } from '../components/ui/Card';
import { LineChart } from '../components/charts/LineChart';
import { LiveDot } from '../components/charts/LiveChart';
import { energyState, rotuloDoScore } from '../domain/energy';
import { rateSleep, rateStress, shown, stateColor } from '../domain/ratings';
import { faixaInicial, noPeriodo, rotulosDoPeriodo } from '../domain/series';
import { isSportDay, modalityMeta } from '../domain/workout';
import * as api from '../services/api.service';
import { supportsGattInspection } from '../services/ble';
import { useAmbientStore } from '../store/ambient.store';
import { useInsightStore } from '../store/insight.store';
import { useBiometricStore } from '../store/biometric.store';
import { useHoraLocal } from '../hooks/useHoraLocal';
import { useHomeStore } from '../store/home.store';
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
  const sincronizando = useBiometricStore((s) => s.syncing);
  const syncError = useBiometricStore((s) => s.syncError);
  const sleep = useBiometricStore((s) => s.sleep);
  const activity = useBiometricStore((s) => s.activity);
  const connection = useBiometricStore((s) => s.connection);
  const pairedDeviceId = useBiometricStore((s) => s.pairedDeviceId);
  const connectionReason = useBiometricStore((s) => s.connectionReason);
  const connect = useBiometricStore((s) => s.connect);
  const user = useUserStore((s) => s.user);
  const openSidebar = useUiStore((s) => s.openSidebar);
  const blocosDaHome = useHomeStore((s) => s.blocos);
  const carregarLayout = useHomeStore((s) => s.carregar);
  const batteryPct = useBiometricStore((s) => s.batteryPct);
  const ambient = useAmbientStore((s) => s.ambient);
  const city = useAmbientStore((s) => s.city);
  const refreshAmbient = useAmbientStore((s) => s.refresh);
  const model = useInsightStore((s) => s.model);
  const insightStatus = useInsightStore((s) => s.status);
  const refreshInsight = useInsightStore((s) => s.refresh);
  const hour = useHoraLocal();
  const { width } = useWindowDimensions();
  // Largura útil do gráfico: tela − margem da home − respiro interno do card.
  const larguraGrafico = width - 48 - 40;
  /*
   A home mostra a faixa mais estreita que tenha curva, como a tela de HRV.

   Fixar "última hora" aqui deixava o card sumir quase sempre: a pulseira mede
   HRV em janelas agendadas, e é comum a última hora não ter nenhuma amostra.
  */
  const faixaHrv = faixaInicial(hrvHistory);
  const serieHrv = noPeriodo(hrvHistory, faixaHrv);
  const mediaHrv = serieHrv.length
    ? serieHrv.reduce((soma, p) => soma + p.value, 0) / serieHrv.length
    : 0;

  /**
   * O que alimenta o carrossel: o plano ativo (card de treino) e as refeições
   * de hoje (card de nutrição). `'loading'` é estado próprio — "buscando" e
   * "não há plano" pedem frases diferentes, e `null` sozinho não distingue.
   */
  const [plan, setPlan] = useState<api.TrainingPlan | null | 'loading'>('loading');
  const [mealsToday, setMealsToday] = useState<api.MealRecord[] | null>(null);


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
    ]);
  }, []);

  useEffect(() => {
    void carregarCards();
  }, [carregarCards]);

  /*
   Os dias anteriores, para a assinatura ter contra o que se comparar. Oito
   dias: sete de média mais o de hoje, que ela descarta. Só carrega se o bloco
   estiver ligado, como as tendências, senão quem o desligou paga a consulta
   de qualquer jeito.
  */
  const [historico, setHistorico] = useState<api.DailySummary[]>([]);
  /*
   Minutos de treino e esporte concluídos hoje.

   O indicador de atividade lia só passos, e musculação quase não produz passo:
   quem fechava uma hora de treino via "pouco movimento, 40% da meta de passos"
   na home (Leonardo, 25/08/2026). É a mesma conta que a meta de água já fazia
   por baixo, agora também à vista.
  */
  const [minutosDeTreino, setMinutosDeTreino] = useState(0);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      const [execucoes, sessoes] = await Promise.all([
        api.fetchExecutionHistory(2).catch(() => []),
        api.fetchSportSessions(2).catch(() => []),
      ]);
      if (!vivo) return;
      // Sessão vinculada a um treino não conta duas vezes o mesmo esforço.
      const vinculadas = new Set(sessoes.map((s) => s.workoutExecutionId).filter(Boolean));
      const minutos =
        execucoes
          .filter((e) => e.status === 'FINISHED' && new Date(e.startedAt) >= inicio)
          .filter((e) => !vinculadas.has(e.id))
          .reduce((soma, e) => soma + (e.durationSec ?? 0) / 60, 0) +
        sessoes
          .filter((s) => new Date(s.startedAt) >= inicio)
          .reduce((soma, s) => soma + s.durationS / 60, 0);
      setMinutosDeTreino(Math.round(minutos));
    })();
    return () => {
      vivo = false;
    };
  }, []);
  const querAssinatura = blocosDaHome.some((b) => b.chave === 'assinatura' && b.ligado);
  useEffect(() => {
    if (!querAssinatura) return;
    let vivo = true;
    void api
      .fetchDailyHistory(8)
      .then((dias) => vivo && setHistorico(dias))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [querAssinatura]);

  useEffect(() => {
    void refreshAmbient();
  }, [refreshAmbient]);

  // O layout escolhido decide o que a home monta, então é a primeira coisa a
  // ler: sem ele, a tela pisca com a ordem de fábrica antes de se corrigir.
  useEffect(() => {
    void carregarLayout();
  }, [carregarLayout]);

  // A hora entra na dependência: virou a hora, o insight é outro.
  useEffect(() => {
    void refreshInsight(hour);
  }, [refreshInsight, hour]);

  // Puxar para atualizar substitui o "atualizar" que morava no bloco de
  // estado: recarrega o insight à força, os dois cards de dados e o ambiente.
  // O clima entra aqui porque ele é o único dado da tela preso à POSIÇÃO — e
  // quem viajou puxa a tela justamente para ver o lugar onde está agora.
  const [refreshing, setRefreshing] = useState(false);
  const aoAtualizar = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refreshInsight(hour, { force: true }),
      carregarCards(),
      refreshAmbient(),
    ]);
    setRefreshing(false);
  }, [refreshInsight, hour, carregarCards, refreshAmbient]);

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
                ? 'Pulseira conectada. A primeira leitura entra sozinha, mantenha-a no pulso, firme e com o sensor encostado na pele.'
                : 'Sem leitura não há score, o resto do app continua acessível pelo menu.'}
            </Body>

            {/*
              A lista de etapas ENTRA NO LUGAR da linha de estado durante a
              sincronização — é a primeira meia hora de uso de quem acabou de
              parear, e é onde a espera precisa se explicar sozinha. Fora dela,
              a linha compacta basta.
            */}
            {sincronizando || syncError ? (
              <YStack marginTop="$lg">
                <Card>
                  <SyncProgress />
                </Card>
              </YStack>
            ) : (
              <BandStatusLine marginTop="$lg" />
            )}

            {/*
              A home é onde a pessoa está quando percebe que "não funciona".
              Se o motivo for permissão negada, é aqui que o caminho de volta
              precisa aparecer — e não só na tela de conexão, que quem já
              pareou não visita mais.
            */}
            {permissaoNegadaEm(connectionReason) ? (
              <YStack marginTop="$lg">
                <PermissionGate
                  permissao={permissaoNegadaEm(connectionReason)!}
                  onTentarDeNovo={() => {
                    if (typeof pairedDeviceId === 'string') void connect(pairedDeviceId);
                  }}
                />
              </YStack>
            ) : null}

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
                        : 'Connect') as never)
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

  // A meta calórica, montada como em Refeições (anamnese + perfil + rotina).
  const [metaKcal, setMetaKcal] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const [anamnese, perfil, rotina] = await Promise.all([
          api.fetchAnamnesis().catch(() => null),
          api.fetchProfile().catch(() => null),
          api.fetchLifestyle().catch(() => null),
        ]);
        const resp = (anamnese?.answers ?? {}) as Record<string, unknown>;
        const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
        const meta = calorieGoal({
          weightKg: num(resp.weightKg),
          heightCm: num(resp.heightCm),
          ageYears: perfil ? ageFromBirthDate(perfil.birthDate, new Date()) : null,
          sex: perfil?.sex ?? null,
          goalAnswer: typeof resp.goal === 'string' ? resp.goal : (useWorkoutStore.getState().plan?.goal ?? rotina?.goal ?? null),
          trainDaysPerWeek: rotina?.trainDays?.length ?? null,
        });
        if (vivo) setMetaKcal(meta?.goal ?? null);
      } catch {
        if (vivo) setMetaKcal(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);
  const aguaHoje = useHabitsStore((st) => st.today.waterMl);
  const aguaMeta = useHabitsStore((st) => st.goalMl);

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

  /*
   A assinatura do dia: os cinco eixos de hoje contra a média dos anteriores.
   O "hoje" vem do estado AO VIVO (a pulseira acabou de medir), não da linha de
   hoje do servidor, que só se fecha no fim do dia. Os dias anteriores vêm do
   servidor. As duas fontes passam pela mesma régua em `domain/assinatura.ts`.
  */
  const agora = new Date();
  const dataDeHoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  const eixosDeHoje = assinaturaDoDia({
    hoje: {
      sleep_score: sleep?.score ?? null,
      energy_score: energy.score,
      hrv_ms: latest.hrvMs ?? null,
      steps: activity.steps ?? null,
      stress_score: stressAtual,
    },
    dias: historico,
    metaDePassos: activity.goal,
    dataDeHoje,
  });

  /*
   Os cinco indicadores do dia (fundadora, 22/08/2026) no lugar do carrossel:
   água, atividade, alimentação, sono e estresse, cada um com seta e frase.
   As réguas são as de ratings.ts; a direção e a frase vêm do domínio.
   */
  const kcalMin = mealsToday?.reduce((soma, r) => soma + r.kcalMin, 0) ?? 0;
  const kcalMax = mealsToday?.reduce((soma, r) => soma + r.kcalMax, 0) ?? 0;
  const bordaParaMenu = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dx > 12 && Math.abs(g.dy) < Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dx > 48) useUiStore.getState().openSidebar();
      },
    })).current;

  return (
    <View style={{ flex: 1 }}>
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
        {/*
          A data em cima, a saudação com o nome embaixo. Era o contrário, com o
          nome sozinho no lugar do título, e nome não é informação para quem já
          sabe quem é: o dia é. Ordem trazida da proposta visual aprovada pela
          fundadora (24/08/2026).
        */}
        <YStack flex={1}>
          <Label marginBottom="$sm">{dataPorExtenso()}</Label>
          <SectionTitle>{saudacaoCom(user.name)}</SectionTitle>
        </YStack>

        {/* O canto do nome: ambiente em cima, relógio embaixo. A linha do
            ambiente é contexto em texto corrido — os números grandes da tela
            são os anéis. O relógio (com a carga em texto, sem segundo ícone)
            é porta para a tela do dispositivo. */}
        <YStack alignItems="flex-end" gap="$sm" paddingBottom={4}>
          {ambient ? (
            <Data
              // Palavra além da cor no calor extremo, como antes: só a cor
              // exclui quem não separa as cores. Token nos DOIS ramos: com
              // `undefined` o padrão do `styled` não vale — ele é ANULADO, e o
              // `Text` do React Native cai no preto, invisível no tema escuro.
              color={ambient.heatStress ? '$destructive' : '$mutedForeground'}
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
              <Icon name="watch" size={20} color={colors.textMuted} strokeWidth={1.5} />
              <Data>{batteryPct != null ? `${batteryPct}%` : '–'}</Data>
            </XStack>
          </Pressable>
        </YStack>
      </XStack>

      {/*
        O miolo da home é montado pela ORDEM que a pessoa escolheu, em
        `store/home.store.ts`. Cada bloco carrega o próprio dado e só monta se
        estiver ligado, então quem desliga tendências não paga a consulta de
        112 dias que elas custam.
      */}
      <YStack paddingTop="$xxl" gap="$xxl">
        {blocosDaHome.map((bloco) => {
          if (!bloco.ligado) return null;
          switch (bloco.chave) {
            case 'resumo':
              return (
                <Pressable
                  key={bloco.chave}
                  onPress={() => abrir('Health')}
                  accessibilityRole="button"
                  accessibilityLabel="Resumo de saúde"
                >
                  <YStack gap="$sm">
                    <Label>resumo de saúde</Label>
                    <SectionTitle>{energy.title}</SectionTitle>
                    <Body>{energy.description}</Body>
                  </YStack>
                </Pressable>
              );

            case 'assinatura':
              return (
                <AssinaturaDoDia
                  key={bloco.chave}
                  eixos={eixosDeHoje}
                  energia={energy.score}
                  avaliacao={rotuloDoScore(energy.score)}
                  diasNaMedia={diasComparaveis(historico, dataDeHoje, activity.goal)}
                  largura={larguraGrafico}
                  onAbrir={abrir}
                />
              );

            case 'aneis':
              /*
               Os três anéis, de volta como OPÇÃO. Saíram do padrão em 22/08 e
               um testador os pediu no dia seguinte: com a home configurável,
               não é preciso escolher entre as duas pessoas.
              */
              return (
                <HomeRings
                  key={bloco.chave}
                  items={[
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
                  ]}
                />
              );

            case 'indicadores':
              return (
                <IndicatorList
                  key={bloco.chave}
                  itens={indicadoresDaHome({
                    hora: hour,
                    agua: { ml: aguaHoje, metaMl: aguaMeta },
                    passos: { hoje: activity.steps ?? null, meta: activity.goal },
                    refeicoes: { quantidade: mealsToday?.length ?? 0, kcalMin, kcalMax, metaKcal },
                    sono: sleep,
                    stress: stressAtual,
                    minutosDeTreino,
                  })}
                  onAbrir={abrir}
                />
              );

            case 'semana':
              return <BlocoSemana key={bloco.chave} onAbrir={abrir} />;

            case 'metas':
              return <BlocoMetas key={bloco.chave} onAbrir={abrir} />;

            case 'hrv':
              return serieHrv.length >= 2 ? (
                <Card
                  key={bloco.chave}
                  onPress={() => abrir('Hrv')}
                  accessibilityLabel="Variabilidade cardíaca, abrir detalhe"
                >
                  <Label marginBottom="$md">variabilidade (hrv)</Label>
                  <LineChart
                    data={serieHrv.map((p) => p.value)}
                    width={larguraGrafico}
                    height={120}
                    markLast
                    band={{ from: mediaHrv * 0.85, to: mediaHrv * 1.15 }}
                    thresholds={[{ value: mediaHrv, label: 'sua média' }]}
                    xLabels={rotulosDoPeriodo(serieHrv)}
                    id="hrv-home"
                  />
                </Card>
              ) : null;

            case 'tendencias':
              return <BlocoTendencias key={bloco.chave} onAbrir={abrir} />;

            case 'conquistas':
              return <BlocoConquistas key={bloco.chave} />;

            case 'atalhos':
              return <HomeBanners key={bloco.chave} aoAbrir={abrir} />;

            default:
              return null;
          }
        })}

        {/*
          O caminho para a personalização, na própria home.
          Estava só no menu lateral, em Aparência, e um testador pediu de volta
          algo que já dava para ligar ali (Leonardo, 23/08). Opção que não se
          encontra não existe. Discreto de propósito: é ajuste, não conteúdo.
        */}
        <Pressable
          onPress={() => abrir('HomeLayout')}
          accessibilityRole="button"
          accessibilityLabel="Personalizar a home"
          style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
        >
          <XStack alignItems="center" gap="$sm">
            <Icon name="grid" size={14} color={colors.textMuted} strokeWidth={1.5} />
            <Data>Personalizar a home</Data>
          </XStack>
        </Pressable>
      </YStack>

    </ScrollView>
    {/*
      Arrastar da borda esquerda abre o menu — o gesto de "voltar" do iPhone,
      que na home não tem para onde voltar (pedido de testador, ago/2026). Uma
      faixa fina por cima da borda; o resto da tela continua rolando normal.
    */}
    <View
      {...bordaParaMenu.panHandlers}
      style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 24 }}
      accessibilityElementsHidden
    />
    </View>
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
          <Icon name="help" size={20} color={colors.textMuted} />
        </Pressable>

        <Pressable
          onPress={() => (navigation as any).push('Alerts' as never)}
          hitSlop={13}
          accessibilityRole="button"
          accessibilityLabel="Avisos"
        >
          <Icon name="bell" size={20} color={colors.textMuted} />
        </Pressable>

        <XStack alignItems="center" gap="$sm">
          {conectado ? <LiveDot /> : null}
          <Label>{conectado ? rotuloAoVivo : 'Sem conexão'}</Label>
        </XStack>
      </XStack>
    </XStack>
  );
}

/** "segunda, 24 ago" — o dia por extenso, curto, em minúsculas. */
function dataPorExtenso(agora = new Date()): string {
  const dia = agora.toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '');
  const mes = agora.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return `${dia}, ${agora.getDate()} ${mes}`;
}

/**
 * "Boa tarde, Silvia". Só o primeiro nome, e sem vírgula pendurada quando o
 * cadastro não tem nome nenhum: "Boa tarde, Silvia Souza de Oliveira" quebra em
 * três linhas e soa como cadastro, e "Boa tarde, " soa como defeito.
 */
function saudacaoCom(nome: string | null | undefined): string {
  const primeiro = (nome ?? '').trim().split(/\s+/)[0];
  return primeiro ? `${greeting()}, ${primeiro}` : greeting();
}
