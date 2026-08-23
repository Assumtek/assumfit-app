/*
 DIREÇÃO — tela de Dispositivo (refeita em 22/08/2026, sorteio de estrutura 4ebeabc6)

 THESIS: a tela responde a UMA pergunta — "o que a pulseira já entregou hoje, e
 o que falta?" — e recusa o formulário de propriedades (modelo, identificador,
 estado) como abertura; isso desce para o fim, onde se consulta.
 OWN-WORLD: o sistema do AssumFit, fixo — tinta, acento roxo só no dado e na
 única ação primária, faixa de instrumento com hairline, seções separadas por
 linha, peso 300 no número grande. Sem cartão por linha.
 STORY: a pessoa abre porque um número não apareceu. Vê na faixa quantas
 grandezas chegaram, bate em Sincronizar, acompanha o razão marcar cada
 chegada com a hora, e sai sabendo o que ficou faltando e por quê.
 FIRST VIEWPORT: faixa de instrumento (bateria · última leitura · chegou hoje
 N de 7), linha de estado, botão primário Sincronizar, e o razão começando.
 FORM: livro-razão por grandeza — candidato 4 da lista ordenada; o experimento
 de medição combinada sai (decisão da fundadora).
 FINISH: unreviewed and undocumented is unfinished; this build ends with the
 finish review, the verdict, and DESIGN.md.
*/
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { YStack } from '@tamagui/stacks';

import { BandStatusLine } from '../components/BandStatus';
import { BandVibration } from '../components/BandVibration';
import { Note, Row, Section, ActionRow } from '../components/List';
import { DetailScreen } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { SedentaryReminder } from '../components/SedentaryReminder';
import { SyncProgress } from '../components/SyncProgress';
import { Body, Button, Data } from '../components/ui';
import { Readout, ReadoutCluster } from '../components/ui/Readout';
import { chegaramHoje, entregasDaPulseira, faltamHoje, ORDEM_DO_RAZAO } from '../domain/bandLedger';
import { horaLocal } from '../domain/sleep';
import { ble } from '../services/ble';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';

export function DeviceScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const connection = useBiometricStore((s) => s.connection);
  const syncHistory = useBiometricStore((s) => s.syncHistory);
  const sincronizando = useBiometricStore((s) => s.syncing);
  const syncError = useBiometricStore((s) => s.syncError);
  const bandActivity = useBiometricStore((s) => s.bandActivity);
  const battery = useBiometricStore((s) => s.batteryPct);
  const latest = useBiometricStore((s) => s.latest);
  const lastSyncAt = useBiometricStore((s) => s.lastSyncAt);
  const disconnect = useBiometricStore((s) => s.disconnect);
  const connect = useBiometricStore((s) => s.connect);
  const connectError = useBiometricStore((s) => s.connectError);
  const connectionReason = useBiometricStore((s) => s.connectionReason);
  const pairedDeviceId = useBiometricStore((s) => s.pairedDeviceId);

  // As séries que o razão lê. Seletores separados: a tela só re-renderiza
  // quando uma delas muda, não a cada leitura ao vivo.
  const hrHistory = useBiometricStore((s) => s.hrHistory);
  const hrvHistory = useBiometricStore((s) => s.hrvHistory);
  const stressHistory = useBiometricStore((s) => s.stressHistory);
  const spo2History = useBiometricStore((s) => s.spo2History);
  const pressureHistory = useBiometricStore((s) => s.pressureHistory);
  const stepsToday = useBiometricStore((s) => s.activity.steps);
  const sleep = useBiometricStore((s) => s.sleep);

  const razao = React.useMemo(
    () =>
      entregasDaPulseira({
        hrHistory,
        hrvHistory,
        stressHistory,
        spo2History,
        pressureHistory,
        stepsToday,
        sleep,
        syncedAt: lastSyncAt,
      }),
    [hrHistory, hrvHistory, stressHistory, spo2History, pressureHistory, stepsToday, sleep, lastSyncAt]);
  const chegaram = chegaramHoje(razao);
  const faltam = faltamHoje(razao);

  const onDisconnect = async () => {
    await disconnect();
    navigation.reset({ index: 0, routes: [{ name: 'Connect' as never }] });
  };

  const [localizando, setLocalizando] = React.useState(false);
  // Estado local além do `connection === 'connecting'`: a REDESCOBERTA (scan
  // até a pulseira aparecer) acontece antes de o rádio dizer "connecting", e
  // o botão não pode parecer parado nesses segundos.
  const [reconectando, setReconectando] = React.useState(false);
  const reconectar = async () => {
    if (!pairedDeviceId) return;
    setReconectando(true);
    try {
      await connect(pairedDeviceId);
    } finally {
      setReconectando(false);
    }
  };
  const localizar = async () => {
    setLocalizando(true);
    try {
      await ble.findDevice?.();
    } finally {
      // Segura o rótulo "Vibrando…" o tempo da vibração — o retorno do SDK
      // chega antes de o motor parar, e o botão voltando na hora parece falha.
      setTimeout(() => setLocalizando(false), 2500);
    }
  };

  /*
   Calibração de uso. Uma pulseira não calibrada aceita o comando de medir,
   mede, e conclui sem valor (`error.code == -4` no SDK); `bandErrors.ts`
   traduz para "precisa ser calibrada", e esta é a linha que aquela mensagem
   promete. Leva até dois minutos, e o rótulo diz isso ANTES.
  */
  const [calibrando, setCalibrando] = React.useState(false);
  const [calibracao, setCalibracao] = React.useState<string | null>(null);
  const calibrar = async () => {
    setCalibrando(true);
    setCalibracao(null);
    try {
      const ok = await ble.wearCalibration?.();
      setCalibracao(
        ok
          ? 'Calibração concluída. As medições sob demanda devem voltar a devolver valor.'
          : 'A calibração não concluiu. Vista a pulseira firme, fique parado e tente de novo.');
    } catch {
      setCalibracao('A calibração não concluiu. Vista a pulseira firme, fique parado e tente de novo.');
    } finally {
      setCalibrando(false);
    }
  };

  /*
   Quem entrou por "Explorar sem pulseira" chega aqui SEM aparelho — e a tela
   de aparelho pareado mentiria um Staranb desconectado.
  */
  if (!pairedDeviceId && connection !== 'connected') {
    return (
      <DetailScreen title="Dispositivo">
        <Note
          title="Nenhuma pulseira pareada"
          body="Você está usando o app sem a pulseira. Quando ela chegar, conecte aqui, as medições começam sozinhas e preenchem as telas."
        />
        <YStack marginTop="$xl">
          <Button title="Conectar pulseira" onPress={() => navigation.navigate('Connect' as never)} />
        </YStack>
      </DetailScreen>
    );
  }

  const conectada = connection === 'connected';
  const conectando = connection === 'connecting';
  const etapaViva = bandActivity?.kind === 'sync' ? bandActivity.step : null;
  const indiceVivo = etapaViva ? ORDEM_DO_RAZAO.findIndex((o) => o.step === etapaViva) : -1;

  return (
    <DetailScreen title="Dispositivo">
      {/*
        A faixa de instrumento: três mostradores, uma linha. É o mesmo
        vocabulário do treino (Readout), e responde de relance à pergunta que
        trouxe a pessoa aqui. "Chegou hoje" é o dado desta tela; bateria e
        última leitura são o contexto dele.
      */}
      <ReadoutCluster>
        <Readout valor={battery != null ? String(battery) : '–'} unidade={battery != null ? '%' : undefined} rotulo="bateria" />
        <Readout valor={`${chegaram}`} unidade={`de ${razao.length}`} rotulo="chegou hoje" />
        <Readout valor={lastSyncAt ? horaLocal(lastSyncAt) : '–'} rotulo="sincronizado" />
      </ReadoutCluster>

      <YStack marginTop="$lg" gap="$lg" paddingBottom="$sm">
        <BandStatusLine />

        {conectada ? (
          <>
            {/*
              A ÚNICA ação primária da tela. Sincronizar é o verbo desta tela;
              o resto é ferramenta.
            */}
            <Button
              title={sincronizando ? 'Lendo a pulseira…' : 'Sincronizar agora'}
              icon={<Icon name="refresh" size={16} color={colors.ink} />}
              onPress={() => void syncHistory(true)}
              disabled={sincronizando}
              loading={sincronizando}
            />
            {syncError ? (
              // Hairline, não cartão: a tela inteira é linha, e o erro não é
              // uma peça de destaque — é uma linha de estado com explicação.
              <YStack borderTopWidth={1} borderBottomWidth={1} borderColor="$border" paddingVertical="$md">
                <SyncProgress />
              </YStack>
            ) : null}
          </>
        ) : (
          /*
           Reconectar SEM cerimônia: o aparelho já está pareado — cair de volta
           na tela de pareamento inicial trata uma queda de sinal como decisão
           nova. Um toque aqui, e o app volta a tentar sozinho a cada retorno ao
           primeiro plano (ver App.tsx).
          */
          <>
            <Button
              title={reconectando || conectando ? 'Reconectando…' : 'Reconectar'}
              onPress={() => void reconectar()}
              disabled={reconectando || conectando || !pairedDeviceId}
              loading={reconectando || conectando}
            />
            {(connectError || connectionReason) && !reconectando && !conectando ? (
              <Note
                title="Não deu para reconectar"
                body={
                  connectionReason ??
                  'Confira se a pulseira está por perto e carregada, e se o Bluetooth do iPhone está ligado, aí tente de novo.'
                }
              />
            ) : !reconectando && !conectando ? (
              <Note
                title="Sem conexão com a pulseira"
                body="O que já chegou continua abaixo e em todas as telas. Medição nova, bateria e localizar voltam quando reconectar."
              />
            ) : null}
          </>
        )}
      </YStack>

      {/*
        O RAZÃO. Cada grandeza que a pulseira entrega, com a hora em que a
        última chegou hoje — ou o traço. Durante a sincronização, a linha que
        está sendo lida gira e as anteriores ganham o tique; terminada, as
        horas ficam. É o progresso que antes sumia quando a leitura acabava.
      */}
      <Section label="O que chegou hoje">
        {razao.map((e, i) => {
          const viva = sincronizando && e.step === etapaViva;
          const lida = sincronizando && indiceVivo >= 0 && i < indiceVivo;
          return (
            <Row key={e.step} last={i === razao.length - 1}>
              <YStack width={20} height={20} alignItems="center" justifyContent="center" marginRight="$md">
                {viva ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : lida || e.lastAt != null || e.resumo ? (
                  <YStack width={8} height={8} borderRadius={4} backgroundColor={e.lastAt != null || e.resumo ? '$primary' : '$mutedForeground'} />
                ) : (
                  <YStack width={8} height={8} borderRadius={4} borderWidth={1} borderColor="$border" />
                )}
              </YStack>
              <YStack flex={1} gap={4}>
                <Body color={e.lastAt != null || e.resumo || viva ? '$foreground' : '$mutedForeground'}>{e.label}</Body>
                {e.resumo ? <Data>{e.resumo}</Data> : null}
              </YStack>
              <Body color={e.lastAt != null ? '$foreground' : '$mutedForeground'} fontVariant={['tabular-nums']}>
                {viva ? 'lendo…' : e.lastAt != null ? horaLocal(e.lastAt) : e.resumo ? 'hoje' : 'sem medição'}
              </Body>
            </Row>
          );
        })}
        {sincronizando ? (
          <Body marginTop="$lg">
            A pulseira mede sozinha o dia todo e guarda tudo por dentro. Trazer cada grandeza leva cerca de um
            minuto, pode manter a tela aberta.
          </Body>
        ) : faltam.length > 0 && conectada ? (
          <Body marginTop="$lg">{explicacaoDoQueFalta(faltam)}</Body>
        ) : null}
      </Section>

      {conectada ? (
        <Section label="Ferramentas">
          <ActionRow
            icon="target"
            title="Localizar pulseira"
            subtitle={localizando ? 'Vibrando…' : 'Vibra por alguns segundos.'}
            onPress={() => void localizar()}
            disabled={localizando}
          />
          <ActionRow
            icon="watch"
            title="Calibrar uso da pulseira"
            subtitle={
              calibrando
                ? 'Calibrando… fique parado, com a pulseira vestida (até 2 min).'
                : (calibracao ?? 'Se a medição sob demanda volta vazia, a pulseira pede isto.')
            }
            busy={calibrando}
            onPress={() => void calibrar()}
            last
          />
        </Section>
      ) : null}

      {/* Mora aqui porque o filtro é lido da pulseira e escrito nela. */}
      {conectada ? <BandVibration /> : null}

      <SedentaryReminder />

      {/*
        As propriedades, por ÚLTIMO: é o que se consulta, não o que se lê. O
        identificador é o real do pareamento — nunca um MAC inventado.
      */}
      <Section label="Pulseira">
        <Row>
          <Body flex={1}>Modelo</Body>
          <Body color="$foreground">AssumFit Watch</Body>
        </Row>
        <Row>
          <Body flex={1}>Identificador</Body>
          <Body color="$foreground">{pairedDeviceId ?? '–'}</Body>
        </Row>
        <Row>
          <Body flex={1}>Estado</Body>
          <Body color="$foreground">{conectada ? 'Conectada' : conectando ? 'Reconectando…' : 'Desconectada'}</Body>
        </Row>
        <Row last>
          <Body flex={1}>Origem dos dados</Body>
          <Body color="$foreground">{latest?.source === 'mock' ? 'Simulado' : 'Sensor'}</Body>
        </Row>
      </Section>

      {latest?.source === 'mock' ? (
        <Note
          title="Wearable simulado"
          body="O app está lendo de um gerador de dados. Suba o Metro com EXPO_PUBLIC_BLE=real para usar a pulseira."
        />
      ) : null}

      <Pressable
        style={({ pressed }) => [{ paddingVertical: 24 }, pressed && { opacity: 0.5 }]}
        onPress={onDisconnect}
        accessibilityRole="button"
      >
        <Body color="$destructive">Desconectar dispositivo</Body>
      </Pressable>
    </DetailScreen>
  );
}

/**
 * Por que cada grandeza pode faltar — dito só para as que faltam. A versão
 * anterior era uma frase fixa que citava HRV com HRV já na tela (revisão de
 * acabamento, 22/08); citar o que está acima com outra verdade é o jeito mais
 * rápido de perder a confiança de quem lê.
 */
function explicacaoDoQueFalta(faltam: string[]): string {
  const motivos: Record<string, string> = {
    'Variabilidade cardíaca': 'depende das janelas agendadas no firmware',
    Estresse: 'depende das janelas agendadas no firmware',
    Oxigenação: 'depende das janelas agendadas no firmware',
    Pressão: 'só chega quando você mede',
    'Sono da noite': 'chega depois da noite dormida com a pulseira',
    Batimentos: 'chega com a primeira leitura ao vivo',
    Passos: 'chega com a primeira leitura ao vivo',
  };
  const partes = faltam.map((f) => `${f.toLowerCase()} ${motivos[f] ?? 'ainda não foi medido'}`);
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join('; ')}; e ${partes[partes.length - 1]}`;
  return `Sem medição é o esperado aqui: ${lista}.`;
}
