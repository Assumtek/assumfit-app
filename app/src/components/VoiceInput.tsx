import { YStack } from '@tamagui/stacks';
import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable } from 'react-native';

import * as api from '../services/api.service';
import { useTheme } from '../theme/ThemeProvider';
import { Data } from './ui';
import { Icon } from './Icon';

/**
 * O botão de ditar — o mesmo fluxo do MUVX: grava, sobe direto ao S3 por URL
 * pré-assinada, o AWS Transcribe converte, e o TEXTO entra no campo como se
 * tivesse sido digitado. Um toque começa, outro termina.
 *
 * O áudio não passa pelo nosso servidor e expira no bucket em um dia; o que
 * permanece é a transcrição, com o mesmo tratamento do texto digitado.
 */
export function VoiceInput({
  onTranscript,
  onError,
}: {
  onTranscript: (texto: string) => void;
  onError?: (mensagem: string) => void;
}) {
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  /*
   Nível do microfone e tempo decorrido — a prova de que está OUVINDO.

   Antes o botão só trocava a cor da borda enquanto gravava, e o retorno da
   fundadora foi exato: "não parece que está capturando minha fala". Cor estática
   não distingue "gravando" de "travado". O que convence é a barra reagindo à
   voz, porque ela só se mexe quando entra som.
  */
  const [nivel, setNivel] = useState(0);
  const [segundos, setSegundos] = useState(0);
  const [estado, setEstado] = useState<'idle' | 'gravando' | 'transcrevendo'>('idle');
  const cancelado = useRef(false);

  /*
   Falha NUNCA é silêncio. O `onError` era opcional e nenhuma das três telas
   que usam o ditado o passava — microfone negado virava "aperto e nada
   acontece". Sem handler da tela, o próprio componente avisa, em alerta
   nativo; o motivo sempre vai para o log.
   */
  const falha = (msg: string) => {
    setEstado('idle');
    console.warn('[ditado]', msg);
    if (onError) onError(msg);
    else Alert.alert('Ditado por voz', msg);
  };

  /*
   `metering` chega em dBFS: 0 é o máximo e -160 o silêncio. A faixa útil da voz
   fica entre -50 e -10, e é ela que vira 0..1 — mapear os 160 dB inteiros
   deixaria a barra praticamente parada.
  */
  useEffect(() => {
    if (estado !== 'gravando') {
      setNivel(0);
      setSegundos(0);
      return;
    }
    const inicio = Date.now();
    const t = setInterval(() => {
      setSegundos(Math.floor((Date.now() - inicio) / 1000));
      const db = recorder.getStatus?.()?.metering;
      if (typeof db === 'number' && Number.isFinite(db)) {
        setNivel(Math.max(0, Math.min(1, (db + 50) / 40)));
      }
    }, 120);
    return () => clearInterval(t);
  }, [estado, recorder]);

  const comecar = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setEstado('idle');
      console.warn('[ditado] microfone negado; canAskAgain =', String(perm.canAskAgain));
      /*
       Negada uma vez, o iOS não pergunta de novo — o único caminho é os
       Ajustes, e o alerta leva até lá. Aqui o alerta vale mesmo com `onError`
       da tela: é o único caso com uma AÇÃO fora do app.
      */
      Alert.alert(
        'Microfone sem permissão',
        'Para ditar, o AssumFit precisa do microfone. Conceda em Ajustes e tente de novo.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Abrir Ajustes', onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    try {
      /*
       A sessão de áudio do iOS precisa ser posta em modo de GRAVAÇÃO antes:
       sem `allowsRecording`, o `record()` falha com "Calling the 'record'
       function has failed" — foi exatamente o sintoma em produção de teste
       (ago/2026). Volta ao normal no fim, porque o modo de gravação muda a
       rota do som do sistema (campainha ao fone de ouvido, por exemplo).
      */
      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync({ isMeteringEnabled: true });
      recorder.record();
      cancelado.current = false;
      setEstado('gravando');
    } catch (err) {
      console.warn('[ditado] preparo falhou:', err instanceof Error ? err.message : String(err));
      falha('Não deu para começar a gravação.');
    }
  };

  const terminar = async () => {
    setEstado('transcrevendo');
    try {
      await recorder.stop();
      // Devolve a sessão ao modo normal assim que a captura termina — o modo
      // de gravação segue valendo para o app inteiro enquanto ninguém desfaz.
      void AudioModule.setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      const uri = recorder.uri;
      if (!uri) return falha('Gravação vazia.');

      const { uploadUrl, key } = await api.presignAudio('m4a');
      const blob = await (await fetch(uri)).blob();
      const up = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'audio/m4a' } });
      if (!up.ok) return falha('O envio do áudio falhou. Confira a conexão.');

      const { jobName } = await api.startTranscription(key, 'm4a');

      // Polling paciente: transcrição de um ditado leva ~5–20 s. O teto de 90 s
      // cobre áudio longo; passar dele é falha honesta, não espera infinita.
      const inicio = Date.now();
      while (Date.now() - inicio < 90_000) {
        if (cancelado.current) return;
        await new Promise((r) => setTimeout(r, 2500));
        const r = await api.getTranscription(jobName);
        if (r.status === 'DONE') {
          setEstado('idle');
          if (r.transcript) onTranscript(r.transcript);
          else onError?.('Não deu para entender o áudio. Tente falar mais perto do aparelho.');
          return;
        }
        if (r.status === 'FAILED') return falha('A transcrição falhou. Tente de novo.');
      }
      falha('A transcrição demorou demais. Tente um áudio mais curto.');
    } catch (err) {
      const status: number | undefined = (err as { response?: { status?: number } })?.response
        ?.status;
      console.warn('[ditado] transcrição falhou:', status ?? (err instanceof Error ? err.message : String(err)));
      // 503 é o servidor dizendo "não configurado" — culpa da infraestrutura,
      // não da conexão de quem grava, e a frase precisa apontar para o lado certo.
      falha(
        status === 503
          ? 'O ditado por voz está indisponível no servidor no momento.'
          : 'A transcrição falhou. Confira a conexão.',
      );
    }
  };

  if (estado === 'transcrevendo') {
    return (
      <YStack width={40} height={40} alignItems="center" justifyContent="center">
        <ActivityIndicator size="small" color={colors.accent} />
      </YStack>
    );
  }

  return (
    <Pressable
      onPress={() => void (estado === 'gravando' ? terminar() : comecar())}
      accessibilityRole="button"
      accessibilityLabel={estado === 'gravando' ? 'Parar gravação' : 'Ditar por voz'}
      style={({ pressed }) => pressed && { opacity: 0.6 }}
    >
      <YStack
        width={40}
        height={40}
        borderRadius={20}
        alignItems="center"
        justifyContent="center"
        borderWidth={1}
        borderColor={estado === 'gravando' ? '$destructive' : '$borderStrong'}
        backgroundColor={estado === 'gravando' ? '$destructiveSoft' : 'transparent'}
      >
        {/*
          O halo que respira com a voz.

          Fica ATRÁS do ícone e cresce com o nível do microfone. É o elemento que
          responde "está me ouvindo?" sem ninguém ter que ler nada — e some
          sozinho no silêncio, que é a informação honesta quando o microfone não
          está captando.
        */}
        {estado === 'gravando' ? (
          <YStack
            position="absolute"
            width={20 + nivel * 26}
            height={20 + nivel * 26}
            borderRadius={999}
            backgroundColor="$destructive"
            opacity={0.14 + nivel * 0.3}
          />
        ) : null}
        <Icon
          name="mic"
          size={17}
          color={estado === 'gravando' ? colors.alert : colors.textMuted}
        />
      </YStack>

      {/*
        O tempo decorrido, embaixo do botão. Complementa o halo em vez de
        repeti-lo: o halo prova que há SOM, o cronômetro prova que a gravação
        está CORRENDO — e um pode estar certo com o outro errado. Num ambiente
        silencioso o halo fica parado, e é o cronômetro que sustenta a confiança.
      */}
      {estado === 'gravando' ? (
        <Data marginTop="$xs" textAlign="center" color="$destructive">
          {String(Math.floor(segundos / 60)).padStart(2, '0')}:
          {String(segundos % 60).padStart(2, '0')}
        </Data>
      ) : null}
    </Pressable>
  );
}
