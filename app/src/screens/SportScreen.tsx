import { Text } from '@tamagui/core';
import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';

import { Note, Row, Section } from '../components/Card';
import { DetailScreen, usePullRefresh } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { Body, Button, Data, Display, Label, MetricSm } from '../components/ui';
import {
  SPORTS,
  kcalFor,
  paceMinPerKm,
  sportClock,
  trackDistanceM,
  type GeoPoint,
  type Sport,
} from '../domain/sport';
import { File, Paths } from 'expo-file-system';

import {
  aoTocarNaIlha,
  atualizarIlhaDeEsporte,
  consumirAcoesDaIlha,
  encerrarIlhaDeEsporte,
  iniciarIlhaDeEsporte,
} from '../../modules/widgetbridge';
import * as api from '../services/api.service';
import { SportShare } from '../components/SportShare';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Sport record — escolhe a modalidade, inicia, e o cronômetro corre com
 * batimento ao vivo da pulseira, distância por GPS e caloria estimada.
 *
 * O tempo é EPOCH, nunca contador: `startedAt` + pausas acumuladas, como todo
 * timer do app. A trilha de GPS fica no aparelho e morre com a sessão — para o
 * servidor sobem só os agregados.
 */

/** Peso para a conta de MET enquanto o cadastro não tem balança: referência adulta. */
const PESO_PADRAO_KG = 70;

type Sessao = {
  sport: Sport;
  startedAt: number;
  /** Pausas acumuladas em ms. */
  pausedMs: number;
  /** Instante em que a pausa corrente começou; null = correndo. */
  pausedSince: number | null;
  points: GeoPoint[];
  hrSamples: number[];
};

const elapsedOf = (s: Sessao, now: number): number =>
  (s.pausedSince ?? now) - s.startedAt - s.pausedMs;

export function SportScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const latest = useBiometricStore((s) => s.latest);

  const [sessao, setSessao] = useState<Sessao | null>(null);
  /** Modalidade escolhida, ainda não iniciada — a tela intermediária. */
  const [preparando, setPreparando] = useState<Sport | null>(null);
  const [posicao, setPosicao] = useState<{ lat: number; lon: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [historico, setHistorico] = useState<api.SportSession[] | null>(null);
  /** A sessão recém-terminada — a tela de conclusão estilo Strava. */
  const [resumo, setResumo] = useState<{
    sport: Sport;
    elapsed: number;
    dist: number | null;
    kcal: number;
    avgHr: number | null;
    maxHr: number | null;
    points: GeoPoint[];
  } | null>(null);
  const [compartilhando, setCompartilhando] = useState(false);
  /** Sessão antiga aberta do histórico, com o percurso local se existir. */
  const [detalhe, setDetalhe] = useState<{ sessao: api.SportSession; points: GeoPoint[] | null } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  /** Encerramento pedido pelo botão da ilha — o instante do toque. */
  const [pedidoDeEncerrar, setPedidoDeEncerrar] = useState<number | null>(null);
  const watcher = useRef<Location.LocationSubscription | null>(null);

  /*
   Preparação: pede a localização JÁ na tela intermediária — o mapa centrado
   em você é a confirmação visual de que o GPS pegou, antes de o cronômetro
   existir. Negada, a tela diz o que se perde e o iniciar continua valendo.
  */
  const preparar = async (sport: Sport) => {
    setAviso(null);
    setPosicao(null);
    setPreparando(sport);
    if (!sport.gps) return;
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      setAviso('Sem acesso à localização, a distância e o mapa ficam de fora — o resto funciona.');
      return;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(
      () => null,
    );
    if (pos) setPosicao({ lat: pos.coords.latitude, lon: pos.coords.longitude });
  };

  const carregar = useCallback(async () => {
    try {
      setHistorico(await api.fetchSportSessions(30));
    } catch {
      setHistorico([]);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);
  const refresh = usePullRefresh(carregar);

  useEffect(() => {
    if (!sessao || sessao.pausedSince !== null) return;
    let tique = 0;
    const id = setInterval(() => {
      setNow(Date.now());
      // A cada ~10 s a ilha recebe distância e batimento novos; o tempo ela
      // conta sozinha. Mais frequente só gastaria o orçamento de updates.
      tique += 1;
      if (tique % 10 === 0) {
        setSessao((s) => {
          if (s && s.pausedSince === null) {
            atualizarIlhaDeEsporte({
              startedAtMs: s.startedAt + s.pausedMs,
              distanceKm: s.sport.gps ? trackDistanceM(s.points) / 1000 : null,
              bpm: latest?.heartRate ? Math.round(latest.heartRate) : null,
            });
          }
          return s;
        });
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.pausedSince === null && sessao !== null]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  // O batimento ao vivo entra como amostra a cada leitura nova da pulseira.
  useEffect(() => {
    if (!sessao || sessao.pausedSince !== null || !latest?.heartRate) return;
    setSessao((s) => (s ? { ...s, hrSamples: [...s.hrSamples, Math.round(latest.heartRate)] } : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.recordedAt]);

  const iniciar = async (sport: Sport) => {
    setAviso(null);
    if (sport.gps) {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status === 'granted') {
        watcher.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 5 },
          (pos) => {
            setSessao((s) =>
              s && s.pausedSince === null
                ? {
                    ...s,
                    points: [
                      ...s.points,
                      { lat: pos.coords.latitude, lon: pos.coords.longitude, at: pos.timestamp },
                    ],
                  }
                : s,
            );
          },
        );
      } else {
        setAviso('Sem acesso à localização a distância não é medida — o resto funciona.');
      }
    }
    const stamp = Date.now();
    setNow(stamp);
    setPreparando(null);
    setSessao({ sport, startedAt: stamp, pausedMs: 0, pausedSince: null, points: [], hrSamples: [] });
    // A Dynamic Island conta o tempo sozinha a partir do início — o app só
    // manda distância/batimento de vez em quando.
    iniciarIlhaDeEsporte(sport.label, stamp);
  };

  const alternarPausa = () => {
    const stamp = Date.now();
    setNow(stamp);
    setSessao((s) => {
      if (!s) return s;
      const proximo =
        s.pausedSince === null
          ? { ...s, pausedSince: stamp }
          : { ...s, pausedMs: s.pausedMs + (stamp - s.pausedSince), pausedSince: null };
      // O `startedAt` que a ilha recebe já desconta as pausas: o timer nativo
      // não conhece pausa, então o início "anda" junto com elas.
      atualizarIlhaDeEsporte({
        startedAtMs: proximo.startedAt + proximo.pausedMs,
        pausedAtMs: proximo.pausedSince,
        distanceKm: proximo.sport.gps ? trackDistanceM(proximo.points) / 1000 : null,
        bpm: latest?.heartRate ? Math.round(latest.heartRate) : null,
      });
      return proximo;
    });
  };

  const encerrar = async (emMs?: number) => {
    if (!sessao) return;
    watcher.current?.remove();
    watcher.current = null;

    // Encerrado pelo botão da ilha, o fim é O TOQUE, não a hora em que o app
    // voltou à frente — entre os dois podem ter passado minutos parados.
    const stamp = emMs ?? Date.now();
    const elapsed = elapsedOf(sessao, stamp);
    const dist = sessao.sport.gps ? Math.round(trackDistanceM(sessao.points)) : null;
    const kcal = kcalFor(sessao.sport.met, PESO_PADRAO_KG, elapsed);
    const hr = sessao.hrSamples;

    setSessao(null);
    encerrarIlhaDeEsporte();
    if (elapsed < 60_000) return; // sessão de segundos foi engano, não treino

    const avgHr = hr.length ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length) : null;
    const maxHr = hr.length ? Math.max(...hr) : null;
    setResumo({ sport: sessao.sport, elapsed, dist, kcal, avgHr, maxHr, points: sessao.points });

    setSalvando(true);
    try {
      const registro = await api.saveSportSession({
        sport: sessao.sport.kind,
        startedAt: new Date(sessao.startedAt).toISOString(),
        durationS: Math.round(elapsed / 1000),
        distanceM: dist && dist > 0 ? dist : null,
        kcal,
        avgHr,
        maxHr,
      });
      setHistorico((atual) => [registro, ...(atual ?? [])]);
      // O percurso fica NO APARELHO, chaveado pelo id do registro — é o que
      // permite reabrir o mapinha do histórico sem a rota nunca ter subido.
      if (sessao.points.length > 1) {
        try {
          new File(Paths.document, `percurso-${registro.id}.json`).write(JSON.stringify(sessao.points));
        } catch {
          // Sem espaço em disco o histórico fica sem mapa — nunca sem registro.
        }
      }
    } catch {
      setAviso('A sessão terminou mas não subiu para o servidor. Ela reaparece ao sincronizar.');
    } finally {
      setSalvando(false);
    }
  };

  /*
   Encerrar de propósito é raro; encerrar por toque acidental no X, comum —
   e derruba um treino inteiro. O modal cobra a confirmação que o gesto
   irreversível merece; sessões com menos de um minuto morrem sem cerimônia.
  */
  const confirmarEncerrar = () => {
    if (!sessao) return;
    if (elapsedOf(sessao, Date.now()) < 60_000) {
      void encerrar();
      return;
    }
    Alert.alert('Encerrar a sessão?', 'Ela vai para o histórico com o que foi medido até aqui.', [
      { text: 'Continuar', style: 'cancel' },
      { text: 'Encerrar', style: 'destructive', onPress: () => void encerrar() },
    ]);
  };

  /*
   Os botões DA ilha não chamam o app: o toque roda no nativo (que ajusta a
   própria ilha na hora, mesmo com o JS suspenso) e fica gravado numa fila.
   Aqui a fila é drenada — na campainha do evento e na volta ao primeiro
   plano — e aplicada com o instante REAL de cada toque. Nada aqui reenvia
   estado à ilha: o nativo já a atualizou, e reenviar viraria eco.

   Pausas entram todas num fold só; o encerrar sai por um EFEITO de propósito:
   quando ele rodar, o estado já contém as pausas anteriores da mesma leva, e
   o tempo parado entre a pausa e o toque de encerrar não conta como treino.
  */
  const drenarAcoesDaIlha = useCallback(() => {
    const acoes = consumirAcoesDaIlha();
    if (!acoes.length) return;
    setSessao((s) => {
      let atual = s;
      for (const acao of acoes) {
        if (!atual) break;
        if (acao.action === 'pause' && atual.pausedSince === null) {
          atual = { ...atual, pausedSince: acao.atMs };
        } else if (acao.action === 'resume' && atual.pausedSince !== null) {
          atual = { ...atual, pausedMs: atual.pausedMs + (acao.atMs - atual.pausedSince), pausedSince: null };
        }
      }
      return atual;
    });
    const fim = acoes.find((a) => a.action === 'end');
    if (fim) setPedidoDeEncerrar(fim.atMs);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (pedidoDeEncerrar === null) return;
    setPedidoDeEncerrar(null);
    if (sessao) void encerrar(pedidoDeEncerrar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoDeEncerrar]);

  useEffect(() => {
    if (!sessao) return;
    drenarAcoesDaIlha();
    const campainha = aoTocarNaIlha(drenarAcoesDaIlha);
    const volta = AppState.addEventListener('change', (st) => {
      if (st === 'active') drenarAcoesDaIlha();
    });
    return () => {
      campainha();
      volta.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao !== null]);

  const abrirDetalhe = async (s: api.SportSession) => {
    let points: GeoPoint[] | null = null;
    try {
      const f = new File(Paths.document, `percurso-${s.id}.json`);
      if (f.exists) points = JSON.parse(await f.text()) as GeoPoint[];
    } catch {
      points = null;
    }
    setDetalhe({ sessao: s, points });
  };

  // Desmontar a tela NÃO encerra o watcher se há sessão? Encerra: sessão de
  // esporte é de tela aberta nesta versão — honesto e documentado no aviso.
  // A ilha cai junto — órfã, ela contaria um treino que já não existe. O
  // guard poupa a ilha de OUTRA sessão (foco) quando saímos sem sessão aqui.
  const haSessao = useRef(false);
  haSessao.current = sessao !== null;
  useEffect(
    () => () => {
      watcher.current?.remove();
      if (haSessao.current) encerrarIlhaDeEsporte();
    },
    [],
  );

  /*
   A conclusão estilo Strava: o percurso desenhado por inteiro, ajustado ao
   quadro, e os números da sessão embaixo — os que MEDIMOS de verdade.
  */
  if (resumo && compartilhando) {
    return (
      <DetailScreen title="Compartilhar" onBack={() => setCompartilhando(false)}>
        <SportShare
          sport={resumo.sport}
          elapsed={resumo.elapsed}
          dist={resumo.dist}
          kcal={resumo.kcal}
          avgHr={resumo.avgHr}
          points={resumo.points}
          onClose={() => setCompartilhando(false)}
        />
      </DetailScreen>
    );
  }

  if (resumo) {
    return (
      <DetailScreen title="Sessão concluída" onBack={() => setResumo(null)}>
        <MapaDePercurso points={resumo.points} accent={colors.accent} />
        <YStack marginTop="$lg" marginBottom="$md">
          <Label>{resumo.sport.label}</Label>
          <Display fontSize={56} lineHeight={62} letterSpacing={-2}>
            {sportClock(resumo.elapsed)}
          </Display>
        </YStack>
        <XStack justifyContent="space-between" paddingHorizontal="$sm" marginBottom="$xl">
          <Medida
            valor={resumo.dist ? (resumo.dist / 1000).toFixed(2).replace('.', ',') : '—'}
            unidade="km"
            rotulo={resumo.dist ? paceMinPerKm(resumo.dist, resumo.elapsed) ?? 'distância' : 'sem GPS'}
          />
          <Medida valor={`~${resumo.kcal}`} unidade="kcal" rotulo="estimadas" />
          <Medida
            valor={resumo.avgHr ? String(resumo.avgHr) : '—'}
            unidade="bpm"
            rotulo={resumo.maxHr ? `máx ${resumo.maxHr}` : 'médio'}
          />
        </XStack>
        {salvando ? <Data marginBottom="$md">salvando no histórico…</Data> : null}
        {aviso ? <Data color="$destructive" marginBottom="$md">{aviso}</Data> : null}
        <YStack gap="$md">
          <Button title="Compartilhar" onPress={() => setCompartilhando(true)} />
          <Button title="Concluir" variant="secondary" onPress={() => { setResumo(null); setCompartilhando(false); }} />
        </YStack>
      </DetailScreen>
    );
  }

  /* Uma sessão antiga, reaberta do histórico — com o percurso se este aparelho o guardou. */
  if (detalhe) {
    const d = detalhe.sessao;
    return (
      <DetailScreen title={rotulo(d.sport)} onBack={() => setDetalhe(null)}>
        {detalhe.points && detalhe.points.length > 1 ? (
          <MapaDePercurso points={detalhe.points} accent={colors.accent} />
        ) : (
          <Data marginTop="$md">
            Sem mapa para esta sessão — o percurso fica só no aparelho em que foi gravado.
          </Data>
        )}
        <YStack marginTop="$lg" marginBottom="$md">
          <Label>{quando(d.startedAt)}</Label>
          <Display fontSize={56} lineHeight={62} letterSpacing={-2}>
            {sportClock(d.durationS * 1000)}
          </Display>
        </YStack>
        <XStack justifyContent="space-between" paddingHorizontal="$sm" marginBottom="$xl">
          <Medida
            valor={d.distanceM ? (d.distanceM / 1000).toFixed(2).replace('.', ',') : '—'}
            unidade="km"
            rotulo={d.distanceM ? paceMinPerKm(d.distanceM, d.durationS * 1000) ?? 'distância' : 'sem GPS'}
          />
          <Medida valor={`~${d.kcal}`} unidade="kcal" rotulo="estimadas" />
          <Medida
            valor={d.avgHr ? String(d.avgHr) : '—'}
            unidade="bpm"
            rotulo={d.maxHr ? `máx ${d.maxHr}` : 'médio'}
          />
        </XStack>
        <Button title="Voltar" variant="secondary" onPress={() => setDetalhe(null)} />
      </DetailScreen>
    );
  }

  if (sessao) {
    const elapsed = elapsedOf(sessao, now);
    const dist = trackDistanceM(sessao.points);
    const kcal = kcalFor(sessao.sport.met, PESO_PADRAO_KG, elapsed);
    const pace = paceMinPerKm(dist, elapsed);
    const pausado = sessao.pausedSince !== null;
    const ultimo = sessao.points[sessao.points.length - 1];

    // Com sessão correndo, a seta não NAVEGA: ela pede a mesma confirmação
    // do X — sair da tela mataria a sessão sem cerimônia.
    return (
      <DetailScreen title={sessao.sport.label} onBack={confirmarEncerrar}>
        {/* O percurso desenhado ao vivo — o mapa é o instrumento da modalidade
            com GPS, como o anel é o do foco. */}
        {sessao.sport.gps && (ultimo || posicao) ? (
          <YStack height={210} borderRadius={16} overflow="hidden" marginTop="$md">
            <MapView
              style={{ flex: 1 }}
              showsUserLocation
              followsUserLocation={!pausado}
              region={{
                latitude: ultimo?.lat ?? posicao!.lat,
                longitude: ultimo?.lon ?? posicao!.lon,
                latitudeDelta: 0.004,
                longitudeDelta: 0.004,
              }}
            >
              {sessao.points.length > 1 ? (
                <Polyline
                  coordinates={sessao.points.map((p) => ({ latitude: p.lat, longitude: p.lon }))}
                  strokeColor={colors.accent}
                  strokeWidth={4}
                />
              ) : null}
            </MapView>
          </YStack>
        ) : null}

        <YStack alignItems="center" paddingVertical={sessao.sport.gps ? '$lg' : '$xxl'}>
          <Label>{pausado ? 'PAUSADO' : 'EM ANDAMENTO'}</Label>
          <Display fontSize={sessao.sport.gps ? 56 : 72} lineHeight={sessao.sport.gps ? 62 : 80} letterSpacing={-3} marginTop="$sm">
            {sportClock(elapsed)}
          </Display>
        </YStack>

        <XStack justifyContent="space-between" paddingHorizontal="$md" marginBottom="$xxl">
          <Medida
            valor={sessao.sport.gps ? (dist / 1000).toFixed(2).replace('.', ',') : '—'}
            unidade="km"
            rotulo={pace ?? 'distância'}
          />
          <Medida
            valor={latest?.heartRate ? String(Math.round(latest.heartRate)) : '—'}
            unidade="bpm"
            rotulo="ao vivo"
          />
          <Medida valor={`~${kcal}`} unidade="kcal" rotulo="estimadas" />
        </XStack>

        <XStack justifyContent="center" alignItems="center" gap="$xxl">
          <Pressable
            onPress={confirmarEncerrar}
            accessibilityRole="button"
            accessibilityLabel="Encerrar sessão"
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <YStack
              width={52}
              height={52}
              borderRadius={26}
              borderWidth={1}
              borderColor="$borderStrong"
              alignItems="center"
              justifyContent="center"
            >
              <Icon name="x" size={20} color={colors.textMuted} />
            </YStack>
          </Pressable>
          <Pressable
            onPress={alternarPausa}
            accessibilityRole="button"
            accessibilityLabel={pausado ? 'Retomar' : 'Pausar'}
            style={({ pressed }) => pressed && { opacity: 0.75 }}
          >
            <YStack
              width={72}
              height={72}
              borderRadius={36}
              backgroundColor="$primary"
              alignItems="center"
              justifyContent="center"
            >
              <Icon name={pausado ? 'play' : 'pause'} size={26} color={colors.ink} />
            </YStack>
          </Pressable>
          {/* Espelho do X para o layout equilibrar — sem função ainda. */}
          <YStack width={52} height={52} />
        </XStack>

        {aviso ? <Data marginTop="$xl">{aviso}</Data> : null}
        <Data marginTop="$xl" color="$mutedForeground">
          Mantenha a tela aberta durante a sessão — o GPS desta versão não corre em segundo
          plano. A trilha fica no aparelho; para o servidor sobem só os totais.
        </Data>
      </DetailScreen>
    );
  }

  /*
   A tela intermediária: o que vai ser medido, o mapa confirmando o GPS, e o
   iniciar como decisão consciente — tocar na modalidade por engano não pode
   disparar cronômetro.
  */
  if (preparando) {
    return (
      <DetailScreen title={preparando.label} onBack={() => setPreparando(null)}>
        {preparando.gps ? (
          <YStack height={260} borderRadius={16} overflow="hidden" marginTop="$md">
            {posicao ? (
              <MapView
                style={{ flex: 1 }}
                showsUserLocation
                region={{
                  latitude: posicao.lat,
                  longitude: posicao.lon,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
              />
            ) : (
              <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$card">
                <Data>{aviso ?? 'procurando o sinal de GPS…'}</Data>
              </YStack>
            )}
          </YStack>
        ) : null}

        <Section label="O que será medido">
          <Row>
            <Body flex={1} color="$foreground">Tempo</Body>
            <Data flexShrink={0}>cronômetro com pausa</Data>
          </Row>
          <Row>
            <Body flex={1} color="$foreground">Batimento</Body>
            <Data flexShrink={0}>ao vivo, da pulseira</Data>
          </Row>
          {preparando.gps ? (
            <Row>
              <Body flex={1} color="$foreground">Distância e ritmo</Body>
              <Data flexShrink={0}>GPS do celular</Data>
            </Row>
          ) : null}
          <Row last>
            <Body flex={1} color="$foreground">Calorias</Body>
            <Data flexShrink={0}>estimadas pela intensidade</Data>
          </Row>
        </Section>

        {aviso && posicao === null && !preparando.gps ? <Data marginTop="$md">{aviso}</Data> : null}

        <YStack marginTop="$xl" gap="$md">
          <Button
            title="Iniciar"
            onPress={() => void iniciar(preparando)}
            icon={<Icon name="play" size={16} color={colors.ink} />}
          />
          <Button title="Voltar" variant="ghost" onPress={() => setPreparando(null)} />
        </YStack>
      </DetailScreen>
    );
  }

  return (
    <DetailScreen title="Esporte" refreshControl={refresh}>
      <Body marginTop="$md" marginBottom="$lg" maxWidth="92%">
        Escolha a modalidade e inicie. Batimento ao vivo da pulseira, distância por GPS e
        caloria estimada pela intensidade.
      </Body>

      {/*
        Musculação é o carro-chefe e abre o MÓDULO de treino inteiro — plano
        gerado por IA, check-in, progresso. As demais modalidades são o
        cronômetro desta tela. Cartão largo e com acento: hierarquia, não
        decoração.
      */}
      <Pressable
        onPress={() => (navigation as any).push('Plan' as never)}
        accessibilityRole="button"
        accessibilityLabel="Abrir treino de musculação"
        style={({ pressed }) => [{ marginBottom: 12 }, pressed && { opacity: 0.7 }]}
      >
        <XStack
          borderRadius={16}
          borderWidth={1}
          borderColor="$primary"
          backgroundColor="$primarySoft"
          paddingVertical="$lg"
          paddingHorizontal="$lg"
          alignItems="center"
          gap="$md"
        >
          <Icon name="dumbbell" size={20} color={colors.accent} />
          <YStack flex={1} gap={2}>
            <Text fontSize={15} fontWeight="700" color="$foreground">
              Musculação
            </Text>
            <Data fontSize={11}>seu plano, check-in e progresso</Data>
          </YStack>
          <Icon name="arrowRight" size={16} color={colors.accent} />
        </XStack>
      </Pressable>

      <XStack flexWrap="wrap" gap="$md" marginBottom="$xxl">
        {SPORTS.map((sport) => (
          <Pressable
            key={sport.kind}
            onPress={() => void preparar(sport)}
            accessibilityRole="button"
            accessibilityLabel={`Preparar ${sport.label}`}
            style={({ pressed }) => [{ width: '30.5%' }, pressed && { opacity: 0.6 }]}
          >
            <YStack
              borderRadius={16}
              borderWidth={1}
              borderColor="$borderStrong"
              paddingVertical="$lg"
              alignItems="center"
              gap="$sm"
            >
              <Icon name={sport.icon as never} size={22} color={colors.textMuted} />
              <Text fontSize={14} color="$foreground">
                {sport.label}
              </Text>
              <Data fontSize={10}>{sport.gps ? 'com GPS' : 'sem GPS'}</Data>
            </YStack>
          </Pressable>
        ))}
      </XStack>

      {aviso ? <Note title="Aviso" body={aviso} /> : null}

      {historico && historico.length > 0 ? (
        <Section label="Últimas sessões">
          {historico.slice(0, 10).map((s, i) => (
            <Pressable key={s.id} onPress={() => void abrirDetalhe(s)} accessibilityRole="button">
            <Row last={i === Math.min(historico.length, 10) - 1}>
              <YStack flex={1} gap={2}>
                <Body color="$foreground">{rotulo(s.sport)}</Body>
                <Data>
                  {quando(s.startedAt)} · {sportClock(s.durationS * 1000)}
                  {s.distanceM ? ` · ${(s.distanceM / 1000).toFixed(2).replace('.', ',')} km` : ''}
                </Data>
              </YStack>
              <YStack alignItems="flex-end" gap={2} flexShrink={0}>
                <Data color="$foreground">~{s.kcal} kcal</Data>
                {s.avgHr ? <Data>{s.avgHr} bpm médio</Data> : null}
              </YStack>
            </Row>
            </Pressable>
          ))}
        </Section>
      ) : historico !== null && !salvando ? (
        <Note
          title="Nenhuma sessão ainda"
          body="A primeira sessão registrada aparece aqui, com duração, distância e batimento médio."
        />
      ) : null}
    </DetailScreen>
  );
}

/**
 * O percurso inteiro, enquadrado — o mapinha do Strava. A região sai do
 * bounding box dos pontos com folga de 30%, para a linha nunca encostar na
 * borda do cartão.
 */
function MapaDePercurso({ points, accent }: { points: GeoPoint[]; accent: string }) {
  if (points.length < 2) return null;
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  return (
    <YStack height={260} borderRadius={16} overflow="hidden" marginTop="$md">
      <MapView
        style={{ flex: 1 }}
        scrollEnabled={false}
        zoomEnabled={false}
        region={{
          latitude: (minLat + maxLat) / 2,
          longitude: (minLon + maxLon) / 2,
          latitudeDelta: Math.max(0.003, (maxLat - minLat) * 1.3),
          longitudeDelta: Math.max(0.003, (maxLon - minLon) * 1.3),
        }}
      >
        <Polyline
          coordinates={points.map((p) => ({ latitude: p.lat, longitude: p.lon }))}
          strokeColor={accent}
          strokeWidth={4}
        />
      </MapView>
    </YStack>
  );
}

function Medida({ valor, unidade, rotulo }: { valor: string; unidade: string; rotulo: string }) {
  return (
    <YStack alignItems="center" gap={2}>
      <XStack alignItems="baseline" gap={3}>
        <MetricSm fontSize={28}>{valor}</MetricSm>
        <Data>{unidade}</Data>
      </XStack>
      <Data fontSize={11}>{rotulo}</Data>
    </YStack>
  );
}

const rotulo = (kind: string) => SPORTS.find((s) => s.kind === kind)?.label ?? kind;

function quando(iso: string): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) {
    return `hoje ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
