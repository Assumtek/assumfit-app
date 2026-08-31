import { useNavigation, useRoute } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/Icon';
import { VoiceInput } from '../../components/VoiceInput';
import { Body, BodyLarge, Button, Data, Label, MetricSm } from '../../components/ui';
import { ehConfirmacao } from '../../domain/confirmacao';
import { useWorkoutStore } from '../../store/workout.store';
import { applyAdjustment, chatWithAgent, fetchChatHistory, type ChatTurn } from '../../services/api.service';
import { darkPalette } from '../../theme/palette';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Personal — conversa com o agente sobre o plano ativo.
 *
 * É a alternativa a regerar. Regerar descarta o plano inteiro e devolve outro;
 * aqui a pessoa pergunta ("posso trocar o agachamento?", "achei pesado demais")
 * e o agente responde sobre o que já existe.
 *
 * ## O histórico vive AQUI, não no servidor
 *
 * Cada turno leva a conversa junto. Guardá-la do outro lado criaria uma segunda
 * base de texto livre sobre saúde — com retenção, consentimento e vazamento
 * próprios — para resolver algo que o aparelho já resolve. Fechar o app limpa a
 * conversa, e isso é uma característica, não uma limitação.
 *
 * ## O bloqueio clínico chega como TEXTO
 *
 * Quem está na faixa de encaminhamento recebe uma resposta explicando, não um
 * erro. O servidor decide isso antes de chamar o modelo, e a tela não precisa
 * saber a regra — só precisa não transformar a resposta em "algo deu errado".
 */
export function PersonalScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const rolagem = useRef<ScrollView>(null);

  const [turnos, setTurnos] = useState<ChatTurn[]>([]);
  const [carregandoConversa, setCarregandoConversa] = useState(true);
  /*
   A conversa abre de onde parou.

   Ela vivia só nesta tela: fechar o app apagava tudo e a pessoa repetia
   contexto que já tinha dado (fundadora, 24/08/2026). Agora ela mora no
   servidor, e o que a tela faz é buscá-la. Falha de rede não trava a tela:
   fica a conversa vazia, e a próxima mensagem funciona igual.
  */
  useEffect(() => {
    let vivo = true;
    fetchChatHistory()
      .then((anteriores) => vivo && setTurnos(anteriores))
      .catch(() => undefined)
      .finally(() => vivo && setCarregandoConversa(false));
    return () => {
      vivo = false;
    };
  }, []);

  /*
   Texto inicial vindo do check-in ("hoje tenho só 30 minutos"): a caixa já
   nasce com a frase, e a pessoa só confirma ou edita. Pedido de um testador
   (22/08): falar com o personal NA HORA de começar, para ajustar o de hoje.
  */
  const route = useRoute();
  const inicial = (route.params as { mensagemInicial?: string } | undefined)?.mensagemInicial ?? '';
  const [texto, setTexto] = useState(inicial);
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /*
   A proposta pendente — o que o botão de confirmar aplica.

   Guardamos só o ID: o diff mora no servidor. Mandar as operações de volta
   daqui abriria caminho para escrever no plano por fora das travas clínicas.

   Some a cada mensagem nova: quem perguntou outra coisa sem confirmar a
   anterior não deveria ver um botão que aplica algo que já saiu de vista.
  */
  const [proposta, setProposta] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [aplicado, setAplicado] = useState<string | null>(null);

  const enviar = async () => {
    const pergunta = texto.trim();
    if (!pergunta || pensando) return;

    /*
     "Sim" digitado vale como o toque em Aplicar.

     O agente pergunta "Confirma?" e a pessoa responde do jeito que se responde
     a uma pergunta: escrevendo. Antes isso ia ao modelo, que repropunha a mesma
     coisa, e o plano continuava igual: "não trocou", "não está trocando", "a
     troca de treino ainda não funciona bem" (Leonardo, 25/08/2026).

     Continua sendo ato explícito, porque a pessoa está respondendo a uma
     proposta que acabou de ler. A fala dela entra na conversa antes de aplicar,
     para o histórico contar o que aconteceu. Negativa nunca passa por aqui, e
     quem garante isso é `domain/confirmacao.ts`, com teste.
    */
    if (proposta && ehConfirmacao(pergunta)) {
      setTurnos([...turnos, { role: 'user', content: pergunta }]);
      setTexto('');
      await aplicar();
      return;
    }

    // Otimista: a fala da pessoa aparece na hora. Esperar a resposta do modelo
    // para mostrar o que ela acabou de escrever faz o app parecer travado por
    // vários segundos.
    const comPergunta: ChatTurn[] = [...turnos, { role: 'user', content: pergunta }];
    setTurnos(comPergunta);
    setTexto('');
    setErro(null);
    setProposta(null);
    setAplicado(null);
    setPensando(true);

    try {
      const r = await chatWithAgent(pergunta);
      // A resposta entra DIGITANDO, como num chat de verdade (fundadora,
      // 23/08): a bolha cresce caractere a caractere e a proposta de ajuste
      // só aparece quando o texto terminou de chegar à tela.
      setPensando(false);
      await digitar(r.reply, (parcial) => setTurnos([...comPergunta, { role: 'assistant', content: parcial }]));
      setProposta(r.adjustmentId);
    } catch {
      setErro('Não foi possível falar com o agente agora. Tente de novo em instantes.');
    } finally {
      setPensando(false);
    }
  };

  /**
   * Aplica a proposta confirmada.
   *
   * Falha de revalidação NÃO é erro: o servidor devolve `failReason` quando o
   * plano mudou desde a sugestão, e isso é informação, não defeito. Vira texto
   * na conversa em vez de um vermelho de "algo deu errado".
   */
  const aplicar = async () => {
    if (!proposta || aplicando) return;
    setAplicando(true);
    setErro(null);
    try {
      const r = await applyAdjustment(proposta);
      if (r.failReason) {
        setAplicado(r.failReason);
      } else {
        setAplicado(
          r.applied === 1 ? 'Pronto: 1 mudança aplicada no seu plano.' : `Pronto, ${r.applied} mudanças aplicadas no seu plano.`);
        /*
         O plano é RELIDO depois de aplicar.

         O servidor gravava e o app seguia com o plano velho em memória: a ficha
         mostrava o treino de antes, e a pessoa concluía, com razão, que a
         confirmação não tinha valido. "Eu validei a mudança pra hoje mas não
         refletiu na ficha" (Bruno, 28/08/2026) — e o banco mostra a proposta
         dele como aplicada, no mesmo minuto da captura. A mudança estava lá; a
         tela é que não sabia.

         Sem bloquear a conversa: quem acabou de confirmar quer ler a resposta,
         não esperar uma releitura de plano.
        */
        void useWorkoutStore.getState().refresh();
      }
      setProposta(null);
    } catch {
      setErro('Não foi possível aplicar agora. Tente de novo em instantes.');
    } finally {
      setAplicando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <YStack flex={1} backgroundColor="$background" paddingTop={insets.top + 12}>
        {/*
          Cabeçalho com VOLTAR.

          A tela não usa `DetailScreen` porque precisa do rodapé fixo de digitação
          e do `KeyboardAvoidingView` por fora — e por isso não herdou o voltar
          que aquela dá de graça. Sem ele, a única saída era o gesto de arrastar
          da borda, que não existe em Android e não é óbvio em iOS.
        */}
        <XStack alignItems="center" gap="$md" paddingHorizontal="$xl" paddingBottom="$md">
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
          >
            <Icon name="back" size={20} color={colors.textMuted} />
          </Pressable>
          <YStack flex={1}>
            <Label>personal</Label>
            <MetricSm fontWeight="700" color="$foreground" letterSpacing={-0.5}>
              Fale sobre seu treino
            </MetricSm>
          </YStack>
        </XStack>

        <ScrollView
          ref={rolagem}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 12 }}
          onContentSizeChange={() => rolagem.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {turnos.length === 0 ? <Sugestoes onEscolher={setTexto} /> : null}

          {turnos.map((turno, i) => (
            <Balao key={i} turno={turno} />
          ))}

          {pensando ? <Digitando /> : null}

          {/*
            Confirmar é o passo que faltava no produto inteiro.

            Antes, o agente propunha, a pessoa dizia "sim" — e nada acontecia,
            porque o caminho de aplicar não existia. O "sim" digitado continua
            valendo como conversa, mas quem muda a prescrição é este toque: um
            ato explícito, com o texto do que muda logo acima dele.
          */}
          {proposta && !pensando ? (
            <YStack marginTop="$lg" gap="$sm">
              <Button
                title={aplicando ? 'Aplicando…' : 'Aplicar no meu plano'}
                onPress={() => void aplicar()}
                disabled={aplicando}
                loading={aplicando}
                icon={<Icon name="check" size={16} color={darkPalette.ink} />}
              />
              <Data>Seu plano só muda depois deste toque.</Data>
            </YStack>
          ) : null}

          {aplicado ? <Data marginTop="$lg">{aplicado}</Data> : null}
          {erro ? <Data color="$destructive">{erro}</Data> : null}
        </ScrollView>

        <XStack
          alignItems="flex-end"
          gap="$sm"
          paddingHorizontal="$xl"
          paddingTop="$md"
          paddingBottom={insets.bottom + 12}
          borderTopWidth={1}
          borderTopColor="$border"
        >
          <YStack
            flex={1}
            borderRadius={16}
            borderWidth={1}
            borderColor="$borderStrong"
            paddingHorizontal="$lg"
            paddingVertical={Platform.OS === 'ios' ? 12 : 4}
          >
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Ex.: posso trocar o agachamento?"
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.accent}
              multiline
              style={{ fontSize: 16, color: colors.text, maxHeight: 120 }}
            />
          </YStack>

          {/* Ditado: o texto transcrito ENTRA NO CAMPO, não é enviado direto —
              a pessoa revisa antes, como no MUVX. */}
          <VoiceInput
            onTranscript={(t) => setTexto((atual) => (atual ? `${atual} ${t}` : t))}
          />

          <Pressable
            onPress={() => void enviar()}
            disabled={!texto.trim() || pensando}
            accessibilityRole="button"
            accessibilityLabel="Enviar"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          >
            <YStack
              width={44}
              height={44}
              borderRadius={24}
              alignItems="center"
              justifyContent="center"
              backgroundColor="$primary"
              opacity={!texto.trim() || pensando ? 0.4 : 1}
            >
              <Icon name="arrowRight" size={20} color={colors.ink} />
            </YStack>
          </Pressable>
        </XStack>
      </YStack>
    </KeyboardAvoidingView>
  );
}

/**
 * Um balão de conversa.
 *
 * A fala da pessoa é preenchida com o acento; a do agente é superfície neutra.
 * Não é decoração: numa conversa longa, é o que permite achar a própria
 * pergunta rolando de olho, sem ler.
 */
function Balao({ turno }: { turno: ChatTurn }) {
  const meu = turno.role === 'user';
  return (
    <XStack justifyContent={meu ? 'flex-end' : 'flex-start'}>
      <YStack
        maxWidth="86%"
        paddingHorizontal="$lg"
        paddingVertical="$md"
        borderRadius={16}
        borderBottomRightRadius={meu ? 4 : 18}
        borderBottomLeftRadius={meu ? 18 : 4}
        backgroundColor={meu ? '$primary' : '$card'}
        borderWidth={meu ? 0 : 1}
        borderColor="$border"
      >
        <BodyLarge lineHeight={22} color={meu ? '$primaryForeground' : '$foreground'}>
          {turno.content}
        </BodyLarge>
      </YStack>
    </XStack>
  );
}

/**
 * Partidas de conversa.
 *
 * Um campo de texto vazio num chat com IA é a pior tela possível: ninguém sabe
 * o que ele aceita. As três sugestões são exemplos do que o agente REALMENTE
 * faz — ajustar o plano existente —, não perguntas gerais de saúde.
 */
const EXEMPLOS = [
  'Achei o treino de hoje pesado demais.',
  'Posso trocar o agachamento por outro exercício?',
  'Quero treinar só 3 dias por semana.',
];

function Sugestoes({ onEscolher }: { onEscolher: (texto: string) => void }) {
  return (
    <YStack gap="$sm" paddingTop="$md">
      <Body marginBottom="$xs">
        Ele conhece o seu plano ativo e a sua anamnese. Pergunte sobre o treino, mudanças passam
        pelas mesmas travas clínicas da geração.
      </Body>
      {EXEMPLOS.map((exemplo) => (
        <Pressable
          key={exemplo}
          onPress={() => onEscolher(exemplo)}
          accessibilityRole="button"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <XStack
            paddingHorizontal="$lg"
            paddingVertical="$md"
            borderRadius={16}
            borderWidth={1}
            borderColor="$border"
          >
            <Data color="$foreground">{exemplo}</Data>
          </XStack>
        </Pressable>
      ))}
    </YStack>
  );
}

/**
 * Revela o texto aos poucos: blocos de 2 a 3 caracteres a cada 12 ms, que é
 * rápido o bastante para não irritar e lento o bastante para parecer escrita.
 * Texto longo acelera, para a resposta inteira não passar de ~3 s.
 */
async function digitar(texto: string, aoAvancar: (parcial: string) => void): Promise<void> {
  const passo = Math.max(2, Math.ceil(texto.length / 250));
  for (let i = passo; i < texto.length; i += passo) {
    aoAvancar(texto.slice(0, i));
    await new Promise((r) => setTimeout(r, 12));
  }
  aoAvancar(texto);
}

/** Os três pontos que pulsam enquanto o personal pensa, no lugar do indicador giratório. */
function Digitando() {
  const pulso = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const laco = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0, duration: 450, useNativeDriver: true }),
      ]),
    );
    laco.start();
    return () => laco.stop();
  }, [pulso]);
  return (
    <XStack alignItems="center" gap={6} paddingVertical="$md" paddingHorizontal="$sm" accessibilityLabel="O personal está escrevendo">
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={{
            opacity: pulso.interpolate({ inputRange: [0, 0.5, 1], outputRange: i === 0 ? [0.3, 1, 0.3] : i === 1 ? [0.5, 0.3, 1] : [1, 0.5, 0.3] }),
          }}
        >
          <YStack width={8} height={8} borderRadius={4} backgroundColor="$mutedForeground" />
        </Animated.View>
      ))}
    </XStack>
  );
}
