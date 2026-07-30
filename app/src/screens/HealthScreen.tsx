import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect } from 'react';
import { RefreshControl } from 'react-native';

import { LineChart } from '../components/charts/LineChart';
import { DetailScreen } from '../components/DetailScreen';
import { Hypnogram } from '../components/charts/Hypnogram';
import { Icon, type IconName } from '../components/Icon';
import { Note } from '../components/Card';
import { Card, Data, HeroCard, Label, Metric, MetricSm, RatingText, SectionTitle } from '../components/ui';
import { calcBioAge } from '../domain/bioAge';
import { calcBodyBattery } from '../domain/bodyBattery';
import {
  rateActivity,
  rateBioAge,
  rateHeartRate,
  rateHrv,
  ratePressure,
  rateSleep,
  rateSpo2,
  rateStress,
  ratingTextColor,
  type Rating,
} from '../domain/ratings';
import * as api from '../services/api.service';
import { deepSleepPct, useBiometricStore } from '../store/biometric.store';
import { useUserStore } from '../store/user.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Saúde — a visão geral de tudo que a pulseira mede.
 *
 * Existe porque as nove métricas moravam soltas no menu lateral, uma entrada
 * cada. Isso obriga a abrir e fechar o painel nove vezes para saber como o
 * corpo está hoje, e nunca mostra as métricas LADO A LADO — que é justamente
 * onde elas informam: oxigênio baixo com estresse alto conta uma história que
 * nenhum dos dois conta sozinho.
 *
 * A ordem das peças não é alfabética nem por importância clínica. É por
 * ACIONABILIDADE: sono e recuperação vêm primeiro porque decidem o que fazer
 * hoje; idade biológica vem por último porque é tendência de meses e não muda
 * nada da próxima hora.
 *
 * Cada card leva à tela de detalhe que já existia — esta não substitui
 * nenhuma delas, só para de exigir o menu para chegar lá.
 */
export function HealthScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();

  const latest = useBiometricStore((s) => s.latest);
  const sleep = useBiometricStore((s) => s.sleep);
  const activity = useBiometricStore((s) => s.activity);
  const stressHistory = useBiometricStore((s) => s.stressHistory);
  const hrHistory = useBiometricStore((s) => s.hrHistory);
  const hrvHistory = useBiometricStore((s) => s.hrvHistory);
  const spo2History = useBiometricStore((s) => s.spo2History);
  const pressureHistory = useBiometricStore((s) => s.pressureHistory);
  const stepsByHour = useBiometricStore((s) => s.stepsByHour);
  const connection = useBiometricStore((s) => s.connection);
  const syncHistory = useBiometricStore((s) => s.syncHistory);
  const [syncing, setSyncing] = React.useState(false);

  const user = useUserStore((s) => s.user);
  const age = useUserStore((s) => s.age());

  /*
   Puxar para atualizar relê a MEMÓRIA DO APARELHO, não a rede.

   É o gesto que a pessoa já espera, e aqui ele significa "pergunte de novo à
   pulseira" — que é o único jeito de preencher a curva do dia depois de o app
   ter ficado fechado. Sem pulseira conectada o gesto não faz nada, de
   propósito: girar a roda sem ter o que buscar promete atualização que não vem.
  */
  const puxar = React.useCallback(async () => {
    if (connection !== 'connected') return;
    setSyncing(true);
    try {
      await syncHistory();
    } finally {
      setSyncing(false);
    }
  }, [connection, syncHistory]);

  useEffect(() => {
    if (connection === 'connected') void syncHistory();
  }, [connection, syncHistory]);

  /*
   Quantos dos últimos 30 dias têm medição — é o conteúdo do card "histórico".
   Ele mostrava um traço fixo e parecia quebrado: traço é a linguagem de "sem
   medição", e aqui HAVIA medição; só faltava alguém contá-la.
  */
  const [diasMedidos, setDiasMedidos] = React.useState<number | null>(null);
  useEffect(() => {
    api
      .fetchDailyHistory(30)
      .then((dias) => setDiasMedidos(dias.filter((d) => d.readings > 0).length))
      .catch(() => setDiasMedidos(null));
  }, []);

  const bio = latest
    ? calcBioAge({
        realAge: age,
        sex: user.sex,
        hrvMs: latest.hrvMs,
        restingHr: latest.heartRate,
        spo2Pct: latest.spo2Pct,
        deepSleepPct: sleep ? deepSleepPct(sleep) : null,
        tempRangeC: null,
      })
    : null;

  const pressao = latest ? ratePressure(latest.bpSystolic, latest.bpDiastolic) : null;

  /*
   A bateria do corpo é CALCULADA, não lida.

   Não existe nada equivalente nos 33 cabeçalhos do SDK — o número que o app do
   fabricante mostra é conta dele. A nossa parte do sono medido e integra a
   carga de estresse ao longo do dia, e devolve `null` sem noite: sem ponto de
   partida, qualquer curva seria invenção.
  */
  const bateria = calcBodyBattery(sleep, stressHistory);

  /*
   Sem NENHUMA medição a tela não desenha nove cards vazios.

   Nove traços empilhados parecem defeito do app, não ausência de dado — e num
   produto de saúde a diferença entre "não mediu" e "está quebrado" é a única
   coisa que a pessoa não consegue descobrir olhando.
  */
  const semDado = !latest && !sleep;

  return (
    <DetailScreen
      title="Saúde"
      refreshControl={
        <RefreshControl refreshing={syncing} onRefresh={puxar} tintColor={colors.textMuted} />
      }
    >
      {semDado ? (
        <Note
          title="Nada medido ainda"
          body={
            connection === 'connected'
              ? 'A pulseira está conectada e as primeiras medições levam alguns minutos. Esta tela se preenche sozinha.'
              : 'Conecte a pulseira para começar a medir. Nada aqui é estimado: cada número vem de uma medição sua.'
          }
        />
      ) : (
        <>
          {/*
            A peça de destaque é o SONO, e não a idade biológica.

            Sono é o que a pessoa pode mudar hoje à noite; idade biológica é
            tendência de meses. Um card grande para o número que não muda seria
            bonito e inútil.
          */}
          <HeroCard onPress={() => (navigation as any).push('Sleep' as never)} accessibilityLabel="Sono">
            <Label>sono</Label>
            <RatingText style={{ color: ratingTextColor(avaliacaoSono(sleep).state, colors) }}>
              {avaliacaoSono(sleep).label}
            </RatingText>
            <Data>{avaliacaoSono(sleep).detail}</Data>

            {/*
              Continuidade ao lado da duração, não no lugar dela.

              Duas noites com os mesmos 90 minutos de profundo não valem o
              mesmo: um bloco de 90 restaura mais que seis de 15, e o total
              sozinho não distingue as duas.
            */}
            {sleep?.deepContinuity != null ? (
              <XStack alignItems="baseline" gap="$xs" marginTop="$md">
                <MetricSm>{sleep.deepContinuity}</MetricSm>
                <Data>de 100 · continuidade do sono profundo</Data>
              </XStack>
            ) : null}

            {/*
              O hipnograma, e não uma sparkline.

              A ORDEM das fases é o que o sono tem de informativo — profundo
              concentrado no começo, REM alongando até a manhã. Uma linha
              subindo e descendo perderia justamente isso, que é o que
              distingue uma noite restauradora de outra do mesmo tamanho.
            */}
            {sleep && sleep.segments.length > 0 ? (
              <Medido>
                {(largura) => <Hypnogram segments={sleep.segments} width={largura} height={96} />}
              </Medido>
            ) : null}
          </HeroCard>

          {bateria ? (
            <YStack marginTop="$xxl">
              <Card
                onPress={() => (navigation as any).push('Battery' as never)}
                accessibilityLabel="Bateria do corpo"
              >
                <Label>bateria do corpo</Label>
                <XStack alignItems="baseline" gap="$xs">
                  <Metric>{bateria.current}</Metric>
                  <Data>de 100</Data>
                </XStack>
                {/*
                  Acordou com / gastou, lado a lado. É o par que dá sentido ao
                  número: 60 depois de acordar com 95 conta uma história
                  diferente de 60 depois de acordar com 65.
                */}
                <XStack gap="$xl" marginTop="$sm">
                  <YStack>
                    <Data>acordou com</Data>
                    <MetricSm>{bateria.morning}</MetricSm>
                  </YStack>
                  <YStack>
                    <Data>gasto no dia</Data>
                    <MetricSm>{bateria.used}</MetricSm>
                  </YStack>
                </XStack>
                {bateria.curve.length > 1 ? (
                  <Medido>
                    {(largura) => (
                      <LineChart
                        data={bateria.curve.map((p) => p.level)}
                        width={largura}
                        height={64}
                        domain={[0, 100]}
                      />
                    )}
                  </Medido>
                ) : (
                  <BateriaTrilho fracao={bateria.current / 100} />
                )}
              </Card>
            </YStack>
          ) : null}

          <SectionTitle marginTop="$xxl" marginBottom="$md">
            Agora
          </SectionTitle>
          <Grade>
            <Celula
              label="HRV"
              icone="pulse"
              serie={hrvHistory}
              rating={latest ? rateHrv(latest.hrvMs) : null}
              onPress={() => (navigation as any).push('Hrv' as never)}
            />
            <Celula
              label="coração"
              icone="heart"
              serie={hrHistory}
              rating={latest ? rateHeartRate(latest.heartRate) : null}
              onPress={() => (navigation as any).push('Hrv' as never)}
            />
            <Celula
              label="oxigênio"
              icone="drop"
              serie={spo2History.map((p) => p.value)}
              rating={latest ? rateSpo2(latest.spo2Pct) : null}
              onPress={() => (navigation as any).push('Oxygen' as never)}
            />
            <Celula
              label="estresse"
              icone="gauge"
              serie={stressHistory.map((p) => p.value)}
              rating={latest ? rateStress(latest.stressScore) : null}
              onPress={() => (navigation as any).push('Stress' as never)}
            />
            <Celula
              label="pressão"
              icone="wave"
              serie={pressureHistory.map((p) => p.systolic)}
              rating={pressao}
              onPress={() => (navigation as any).push('Pressure' as never)}
            />
            <Celula
              label="atividade"
              icone="steps"
              serie={stepsByHour}
              rating={rateActivity(activity)}
              onPress={() => (navigation as any).push('Activity' as never)}
            />
          </Grade>

          <SectionTitle marginTop="$xxl" marginBottom="$md">
            Tendência
          </SectionTitle>
          <Grade>
            <Celula
              label="idade biológica"
              icone="age"
              rating={bio ? rateBioAge(bio.delta) : null}
              onPress={() => (navigation as any).push('BioAge' as never)}
            />
            <Celula
              label="histórico"
              icone="calendar"
              rating={
                diasMedidos != null && diasMedidos > 0
                  ? {
                      available: true,
                      label: `${diasMedidos} ${diasMedidos === 1 ? 'dia' : 'dias'}`,
                      detail: 'com medição em 30',
                      fraction: diasMedidos / 30,
                      state: 'normal',
                    }
                  : null
              }
              vazio="30 dias"
              onPress={() => (navigation as any).push('History' as never)}
            />
          </Grade>
        </>
      )}

    </DetailScreen>
  );
}

/**
 * Trilho da bateria.
 *
 * Barra e não anel: bateria é uma grandeza que se lê como "quanto sobrou de um
 * total", e a barra é a forma que já carrega esse significado sem legenda. O
 * acento é do dado, como manda o sistema — o trilho vazio fica no cinza da
 * borda.
 */
function BateriaTrilho({ fracao }: { fracao: number }) {
  return (
    <YStack height={4} borderRadius={2} backgroundColor="$border" marginTop="$md" overflow="hidden">
      <YStack
        height={4}
        borderRadius={2}
        backgroundColor="$primary"
        width={`${Math.max(2, Math.min(100, fracao * 100))}%`}
      />
    </YStack>
  );
}

/**
 * Duas colunas, com quebra.
 *
 * Grid de verdade em vez de lista porque é a comparação LADO A LADO que
 * justifica a tela existir. Empilhado em coluna única, ela vira o menu lateral
 * outra vez, só que rolando.
 */
function Grade({ children }: { children: React.ReactNode }) {
  return (
    <XStack flexWrap="wrap" gap="$md">
      {children}
    </XStack>
  );
}

/**
 * Uma métrica no grid.
 *
 * A regra de ouro em miniatura: o destaque é a AVALIAÇÃO em linguagem humana e
 * o número técnico é sub-label. Sem medição mostra traço — nunca zero, que
 * afirmaria uma medição ruim onde não houve medição nenhuma.
 */
function Celula({
  label,
  icone,
  serie,
  rating,
  vazio = '—',
  onPress,
}: {
  label: string;
  icone: IconName;
  /** A série do dia, quando existe. Vira sparkline; ausente, o card fica sem. */
  serie?: number[];
  rating: Rating | null;
  vazio?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    // 48% e não 50%: o `gap` do grid entra na conta, e duas metades exatas
    // estouram a linha e quebram para uma coluna só.
    <YStack width="48%">
      <Card onPress={onPress} accessibilityLabel={label}>
        {/*
          O ícone é ACROMÁTICO, e isso não é economia de cor: o acento pertence
          ao dado, e aqui o dado é a sparkline. Ícone colorido competiria com a
          única coisa da célula que carrega informação.
        */}
        <XStack alignItems="center" gap="$xs">
          <Icon name={icone} size={13} color={colors.textMuted} />
          <Label>{label}</Label>
        </XStack>
        {rating ? (
          <>
            <RatingText
              numberOfLines={1}
              style={{ color: ratingTextColor(rating.state, colors) }}
            >
              {rating.label}
            </RatingText>
            <Data numberOfLines={1}>{rating.detail}</Data>
          </>
        ) : (
          <>
            <RatingText color="$mutedForeground">—</RatingText>
            <Data numberOfLines={1}>{vazio}</Data>
          </>
        )}

        {/*
          Sparkline sem eixo, sem rótulo e sem grade.

          Ela responde uma pergunta só — "está subindo ou descendo?" — e é a
          pergunta que o número sozinho não responde. Dois pontos é o mínimo
          para haver forma; abaixo disso o card fica sem, que é honesto.
        */}
        {serie && serie.length > 1 ? (
          <Medido>
            {(largura) => (
              <LineChart data={serie.slice(-40)} width={largura} height={34} area={false} />
            )}
          </Medido>
        ) : null}
      </Card>
    </YStack>
  );
}

/**
 * Dá ao filho a largura REAL disponível.
 *
 * Os gráficos são SVG e precisam de largura em número — não existe `width:
 * 100%` num `<Svg>`. Calcular à mão a partir da tela obriga a subtrair padding
 * de tela, de card e de grid, e qualquer mudança nesses três quebra o desenho
 * em silêncio. Medir não erra.
 */
function Medido({ children }: { children: (largura: number) => React.ReactNode }) {
  const [largura, setLargura] = React.useState(0);
  return (
    <YStack marginTop="$sm" onLayout={(e) => setLargura(e.nativeEvent.layout.width)}>
      {largura > 0 ? children(largura) : null}
    </YStack>
  );
}

/** Sono tem avaliação própria porque depende de duas grandezas, não de uma. */
function avaliacaoSono(sleep: { score: number; totalMin: number } | null): Rating {
  return rateSleep(sleep?.score ?? null, sleep?.totalMin ?? null);
}
