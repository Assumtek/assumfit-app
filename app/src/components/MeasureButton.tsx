import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import type { MeasurableKind } from '../services/ble';
import { noiteSustentaODia } from '../domain/bodyBattery';
import { isoHoje } from '../domain/water';
import { buscarNoiteAgora, useBiometricStore } from '../store/biometric.store';
import { Body, Pill } from './ui';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';

/**
 * A pílula do botão.
 *
 * Era `Glass` — a camada de vidro nativo. Com o novo sistema visual, ação usa
 * superfície com contorno: o vidro ficou reservado para o painel lateral e a
 * barra, que flutuam sobre o conteúdo. Um botão em linha não flutua.
 */

/**
 * "Medir agora" — o mesmo botão em toda tela de saúde.
 *
 * A pulseira transmite batimento sozinha, mas SpO₂, pressão, estresse e HRV só
 * existem quando alguém pede. Antes isso acontecia uma vez, ao conectar, e não
 * havia como repetir: olhar um número, desconfiar dele e querer medir de novo é
 * exatamente o que a pessoa tenta fazer numa tela dessas.
 *
 * Componente único, e não um botão por tela, porque o estado de "medindo" é do
 * APARELHO, não da tela: é um sensor óptico só, e duas medições simultâneas
 * disputariam o mesmo hardware. Com o estado no store, abrir outra tela durante
 * uma medição mostra o mesmo andamento em vez de oferecer um segundo disparo.
 */
export function MeasureButton({ kind, label }: { kind: MeasurableKind; label?: string }) {
  const { colors } = useTheme();

  const measuring = useBiometricStore((s) => s.measuring);
  const measureError = useBiometricStore((s) => s.measureError);
  const measureNow = useBiometricStore((s) => s.measureNow);
  const cancelMeasure = useBiometricStore((s) => s.cancelMeasure);
  const measureStartedAt = useBiometricStore((s) => s.measureStartedAt);
  const connection = useBiometricStore((s) => s.connection);
  const bandActivity = useBiometricStore((s) => s.bandActivity);

  /*
   A medição AUTOMÁTICA (a varredura pós-conexão) ocupa o mesmo sensor que a
   pedida no botão. Sem contá-la, o botão oferecia um disparo que ia falhar —
   e a tela dizia traço enquanto a pulseira já media exatamente esta grandeza.
   */
  const automatica = bandActivity?.kind === 'measure' ? bandActivity.what : null;
  const desteBotao = measuring === kind || automatica === kind;
  const ocupado = measuring !== null || automatica !== null;
  const conectado = connection === 'connected';

  /*
   Um tique por segundo só enquanto ESTA tela mede. O tempo em si vem de
   `measureStartedAt` no store (epoch), então perder um tique não perde
   contagem — o próximo redesenho traz o valor certo.
  */
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!desteBotao || !measureStartedAt) return;
    setAgora(Date.now());
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [desteBotao, measureStartedAt]);
  const segundos = measureStartedAt ? Math.floor((agora - measureStartedAt) / 1000) : 0;

  return (
    <YStack marginTop="$lg">
      <Pressable
        onPress={() => void measureNow(kind)}
        // Desabilitado enquanto QUALQUER medição roda, não só a desta tela.
        disabled={ocupado || !conectado}
        accessibilityRole="button"
        accessibilityState={{ disabled: ocupado || !conectado, busy: desteBotao }}
        accessibilityLabel={desteBotao ? 'Medindo, aguarde' : (label ?? 'Medir agora')}
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      >
        <Pill variant="control" muted={!conectado}>
          {desteBotao ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Icon name="pulse" size={16} color={conectado ? colors.text : colors.textMuted} />
          )}
          <Body color={conectado ? '$foreground' : '$mutedForeground'}>
            {desteBotao ? 'Medindo…' : (label ?? 'Medir agora')}
          </Body>
        </Pill>
      </Pressable>

      {/*
        A explicação fica ABAIXO do botão, em texto secundário.

        Sem isto o toque não produzia efeito visível quando a pulseira estava
        desconectada, e a pessoa não tinha como saber por quê — foi o que
        aconteceu comigo hoje mais de uma vez, em outros caminhos silenciosos.
      */}
      {!conectado ? (
        <Body marginTop="$sm">Conecte a pulseira para medir.</Body>
      ) : desteBotao ? (
        <YStack marginTop="$sm" gap="$sm" alignItems="flex-start">
          {/*
            O SEGUNDO conta na tela. Sem ele, "Medindo…" parado por um minuto é
            indistinguível de travado — e era exatamente essa a dúvida: o botão
            girava e ninguém sabia se algo acontecia.
          */}
          <Body>
            {segundos > 0 ? `Medindo há ${segundos}s. ` : ''}
            Mantenha a pulseira firme no pulso e o braço parado.
          </Body>
          {/* A saída existe a partir de 10s: antes disso, desistir é quase
              sempre impaciência, e o sensor mal começou. */}
          {segundos >= 10 ? (
            <Pressable
              onPress={() => void cancelMeasure()}
              accessibilityRole="button"
              accessibilityLabel="Parar a medição"
              hitSlop={8}
              style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
            >
              <Body color="$mutedForeground">Parar medição</Body>
            </Pressable>
          ) : null}
        </YStack>
      ) : measureError ? (
        <Body marginTop="$sm">{measureError}</Body>
      ) : null}
    </YStack>
  );
}

/**
 * "Buscar noite" — o par do `MeasureButton` para o sono.
 *
 * Sono não tem medição sob demanda: ele se mede DORMINDO. Um botão "medir
 * agora" numa tela de sono prometeria algo que o hardware não faz, então o que
 * cabe é reler o que a pulseira já gravou — útil de manhã, quando a noite
 * terminou mas o app ainda não perguntou.
 */
export function SyncSleepButton() {
  const { colors } = useTheme();
  const [buscando, setBuscando] = React.useState(false);
  const [resposta, setResposta] = React.useState<string | null>(null);
  const connectHealth = useBiometricStore((s) => s.connectHealth);
  const connection = useBiometricStore((s) => s.connection);

  const conectado = connection === 'connected';

  /**
   * Pulseira primeiro, app Saúde depois.
   *
   * O botão chamava só o app Saúde, e na pulseira do produto isso não busca
   * nada: quem estava com o sono parado tocava, esperava e recebia a mesma
   * noite de três dias atrás (Bruno, 24/08/2026). E ele DIZ o que encontrou,
   * porque a pergunta de quem toca é "a pulseira tem a minha noite ou não?".
   */
  const buscar = async () => {
    setBuscando(true);
    setResposta(null);
    try {
      if (conectado) {
        const r = await buscarNoiteAgora();
        if (r.estado === 'nova') {
          /*
           "Nova" quer dizer mais recente do que a que estava na tela, e isso
           NÃO é o mesmo que ser a noite de hoje. A captura do testador
           mostrava, na mesma dobra da tela, "Noite atualizada." e o aviso
           "esta não é a noite de hoje", com uma noite de três dias atrás
           (Bruno, 24/08/2026). O app se contradizendo é pior do que o app
           dizendo que não achou: a segunda coisa a pessoa consegue agir sobre.
          */
          setResposta(
            noiteSustentaODia(r.noite, isoHoje())
              ? 'Noite atualizada.'
              : `Veio a noite de ${noiteEmTexto(r.noite)}. A pulseira ainda não tem nenhuma depois dessa.`,
          );
          return;
        }
        if (r.estado === 'nao-respondeu') {
          setResposta(
            'A pulseira não respondeu à consulta de sono. Aproxime o pulso do celular e tente de novo: isto não quer dizer que a noite não exista, só que não conseguimos perguntar.',
          );
          return;
        }
        if (r.estado === 'sem-novidade') {
          setResposta(
            'Perguntamos e a pulseira não tem noite mais recente do que a que está aqui. Se você dormiu com ela, verifique se o monitoramento de sono está ligado no app do fabricante: o registro também leva algumas horas para fechar no aparelho.',
          );
          return;
        }
      }
      await connectHealth();
      setResposta(conectado ? null : 'Buscamos no app Saúde.');
    } finally {
      setBuscando(false);
    }
  };

  return (
    <YStack marginTop="$lg">
      <Pressable
        onPress={() => void buscar()}
        disabled={buscando}
        accessibilityRole="button"
        accessibilityState={{ disabled: buscando, busy: buscando }}
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      >
        <Pill>
          {buscando ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Icon name="moon" size={16} color={colors.text} />
          )}
          <Body color="$foreground">{buscando ? 'Buscando…' : 'Buscar noite'}</Body>
        </Pill>
      </Pressable>
      <Body marginTop="$sm">
        {resposta ??
          (conectado
            ? 'Busca o sono na pulseira e, se não houver, no app Saúde.'
            : 'Sem a pulseira conectada, busca apenas no app Saúde.')}
      </Body>
    </YStack>
  );
}


/**
 * "Buscar na pulseira" — para a grandeza que a pulseira mede SOZINHA.
 *
 * O HRV é o caso: a porta de histórico agendado desta pulseira é do anel do
 * fabricante ("Only Ring Support" no cabeçalho do SDK) e devolve vazio, e a
 * medição sob demanda nunca concluiu com valor nas tentativas de campo — todas
 * recusadas por sensor ocupado, o que só foi corrigido em 18/08. Enquanto isso
 * não se prova num aparelho, o caminho que FUNCIONA é reler a memória, que agora
 * varre até sete dias para trás.
 *
 * Fica ao lado do "medir agora" em vez de substituí-lo: remover o botão de
 * medição apagaria um recurso que talvez funcione, e manter só ele deixaria a
 * pessoa sem a única ação que com certeza traz dado.
 */
export function FetchFromBandButton({ label = 'Buscar na pulseira' }: { label?: string }) {
  const { colors } = useTheme();
  const syncHistory = useBiometricStore((s) => s.syncHistory);
  const sincronizando = useBiometricStore((s) => s.syncing);
  const connection = useBiometricStore((s) => s.connection);

  if (connection !== 'connected') return null;

  return (
    <YStack marginTop="$md">
      <Pressable
        onPress={() => void syncHistory(true)}
        disabled={sincronizando}
        accessibilityRole="button"
        accessibilityState={{ disabled: sincronizando, busy: sincronizando }}
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      >
        <Pill>
          {sincronizando ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Icon name="refresh" size={16} color={colors.text} />
          )}
          <Body color="$foreground">
            {sincronizando ? 'Lendo a pulseira…' : label}
          </Body>
        </Pill>
      </Pressable>
    </YStack>
  );
}

/** "21/08 para 22/08", como a pessoa fala de uma noite. */
function noiteEmTexto(noite: { date: string }): string {
  const [ano, mes, dia] = noite.date.split('-').map(Number);
  const deitou = new Date(ano, mes - 1, dia);
  const levantou = new Date(ano, mes - 1, dia + 1);
  const curto = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${curto(deitou)} para ${curto(levantou)}`;
}
