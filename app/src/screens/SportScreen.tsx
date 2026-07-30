import { Text } from '@tamagui/core';
import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable } from 'react-native';
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
import * as api from '../services/api.service';
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
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
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
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sessao]);

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
  };

  const alternarPausa = () => {
    const stamp = Date.now();
    setNow(stamp);
    setSessao((s) => {
      if (!s) return s;
      if (s.pausedSince === null) return { ...s, pausedSince: stamp };
      return { ...s, pausedMs: s.pausedMs + (stamp - s.pausedSince), pausedSince: null };
    });
  };

  const encerrar = async () => {
    if (!sessao) return;
    watcher.current?.remove();
    watcher.current = null;

    const stamp = Date.now();
    const elapsed = elapsedOf(sessao, stamp);
    const dist = sessao.sport.gps ? Math.round(trackDistanceM(sessao.points)) : null;
    const kcal = kcalFor(sessao.sport.met, PESO_PADRAO_KG, elapsed);
    const hr = sessao.hrSamples;

    setSessao(null);
    if (elapsed < 60_000) return; // sessão de segundos foi engano, não treino

    setSalvando(true);
    try {
      const registro = await api.saveSportSession({
        sport: sessao.sport.kind,
        startedAt: new Date(sessao.startedAt).toISOString(),
        durationS: Math.round(elapsed / 1000),
        distanceM: dist && dist > 0 ? dist : null,
        kcal,
        avgHr: hr.length ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length) : null,
        maxHr: hr.length ? Math.max(...hr) : null,
      });
      setHistorico((atual) => [registro, ...(atual ?? [])]);
    } catch {
      setAviso('A sessão terminou mas não subiu para o servidor. Ela reaparece ao sincronizar.');
    } finally {
      setSalvando(false);
    }
  };

  // Desmontar a tela NÃO encerra o watcher se há sessão? Encerra: sessão de
  // esporte é de tela aberta nesta versão — honesto e documentado no aviso.
  useEffect(() => () => watcher.current?.remove(), []);

  if (sessao) {
    const elapsed = elapsedOf(sessao, now);
    const dist = trackDistanceM(sessao.points);
    const kcal = kcalFor(sessao.sport.met, PESO_PADRAO_KG, elapsed);
    const pace = paceMinPerKm(dist, elapsed);
    const pausado = sessao.pausedSince !== null;
    const ultimo = sessao.points[sessao.points.length - 1];

    return (
      <DetailScreen title={sessao.sport.label}>
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
            onPress={() => void encerrar()}
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
      <DetailScreen title={preparando.label}>
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
        onPress={() => navigation.navigate('Plan' as never)}
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
              gap="$xs"
            >
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
            <Row key={s.id} last={i === Math.min(historico.length, 10) - 1}>
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
