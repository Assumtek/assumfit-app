import { useNavigation } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/Icon';
import { VoiceInput } from '../../components/VoiceInput';
import { Body, Data, Label } from '../../components/ui';
import { chatWithAgent, type ChatTurn } from '../../services/api.service';
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
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async () => {
    const pergunta = texto.trim();
    if (!pergunta || pensando) return;

    // Otimista: a fala da pessoa aparece na hora. Esperar a resposta do modelo
    // para mostrar o que ela acabou de escrever faz o app parecer travado por
    // vários segundos.
    const comPergunta: ChatTurn[] = [...turnos, { role: 'user', content: pergunta }];
    setTurnos(comPergunta);
    setTexto('');
    setErro(null);
    setPensando(true);

    try {
      const r = await chatWithAgent(pergunta, turnos);
      setTurnos([...comPergunta, { role: 'assistant', content: r.reply }]);
    } catch {
      setErro('Não foi possível falar com o agente agora. Tente de novo em instantes.');
    } finally {
      setPensando(false);
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
            <Text fontSize={22} fontWeight="700" color="$foreground" letterSpacing={-0.5}>
              Fale sobre seu treino
            </Text>
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

          {pensando ? (
            <XStack alignItems="center" gap="$sm" paddingVertical="$md">
              <ActivityIndicator size="small" color={colors.textMuted} />
              <Data>pensando…</Data>
            </XStack>
          ) : null}

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
            borderRadius={20}
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
              style={{ fontSize: 15, color: colors.text, maxHeight: 120 }}
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
              borderRadius={22}
              alignItems="center"
              justifyContent="center"
              backgroundColor="$primary"
              opacity={!texto.trim() || pensando ? 0.4 : 1}
            >
              <Icon name="arrowRight" size={18} color={colors.ink} />
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
        borderRadius={18}
        borderBottomRightRadius={meu ? 4 : 18}
        borderBottomLeftRadius={meu ? 18 : 4}
        backgroundColor={meu ? '$primary' : '$card'}
        borderWidth={meu ? 0 : 1}
        borderColor="$border"
      >
        <Text fontSize={15} lineHeight={22} color={meu ? '$primaryForeground' : '$foreground'}>
          {turno.content}
        </Text>
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
        Ele conhece o seu plano ativo e a sua anamnese. Pergunte sobre o treino — mudanças passam
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
