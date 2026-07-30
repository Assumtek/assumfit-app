import { useNavigation } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/Icon';
import { VoiceInput } from '../../components/VoiceInput';
import { Body, Button, Card, Data, Label, SectionTitle } from '../../components/ui';
import {
  answerInterview,
  editInterviewAnswer,
  finalizeInterview,
  startInterview,
  type InterviewState,
  type InterviewTurn,
} from '../../services/api.service';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Anamnese conversacional — fluxo portado do MUVX, peça por peça.
 *
 * As três decisões que fazem a conversa parecer conversa, e de onde vêm:
 *
 * 1. **A pessoa começa RESPONDENDO.** A primeira pergunta é aberta — "me conta
 *    um pouco de você" — e os chips de opção só aparecem depois da primeira
 *    resposta. Quem começou falando responde o PAR-Q como continuação da
 *    conversa, não como formulário.
 * 2. **As opções vivem NO CHAT**, como um cartão depois da pergunta — e o
 *    rodapé é SEMPRE campo de texto. Quem prefere digitar "sim" a tocar no chip
 *    pode; o servidor casa o texto com a opção sem exigir caixa nem acento.
 * 3. **"Pensando" antes de cada fala.** O estado chega do servidor de uma vez;
 *    revelar a pergunta na hora entregaria os chips antes da pergunta. O
 *    indicador segura ~900 ms, revela a fala com efeito de digitação, e só
 *    então as opções entram.
 *
 * O ditado tem botão próprio (VoiceInput): grava, transcreve na AWS e o texto
 * entra no campo para revisão — nunca é enviado sem a pessoa ver.
 */
export function AnamnesisConversationScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const rolagem = useRef<ScrollView>(null);

  const [estado, setEstado] = useState<InterviewState | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);

  /*
   Quantas falas do assistente já foram REVELADAS.

   O servidor devolve o estado inteiro de uma vez — pergunta nova inclusa. Sem
   este contador, a pergunta e os chips apareceriam no mesmo quadro, e o "estar
   digitando" não existiria. As falas além do contador ficam escondidas até o
   temporizador do efeito revelar.
  */
  const [reveladas, setReveladas] = useState(0);
  const [digitando, setDigitando] = useState(false);
  /** Falas que já rodaram o efeito de máquina — anima UMA vez, nunca de novo. */
  const animadas = useRef(new Set<number>());

  useEffect(() => {
    startInterview()
      .then((s) => {
        /*
         Conversa RETOMADA entra revelada por inteiro, sem animação.

         O efeito de digitação é para fala nova; redigitá-lo sobre dez mensagens
         antigas ao reabrir o app transformaria a retomada num replay.
        */
        const assistente = s.messages.filter((m) => m.role === 'ASSISTANT').length;
        const retomada = s.messages.some((m) => m.role === 'STUDENT');
        if (retomada) {
          s.messages.forEach((_, i) => animadas.current.add(i));
          setReveladas(assistente);
        }
        setEstado(s);
      })
      .catch(() => setErro('Não foi possível começar a anamnese. Confira a conexão.'));
  }, []);

  const totalAssistente = useMemo(
    () => (estado?.messages ?? []).filter((m) => m.role === 'ASSISTANT').length,
    [estado?.messages],
  );

  // Chegou fala nova: mostra "pensando" por um instante e então revela.
  useEffect(() => {
    if (totalAssistente > reveladas) {
      setDigitando(true);
      const id = setTimeout(() => {
        setReveladas(totalAssistente);
        setDigitando(false);
      }, 900);
      return () => clearTimeout(id);
    }
  }, [totalAssistente, reveladas]);

  const responder = async (valor: string) => {
    if (!estado || enviando || !valor.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      setEstado(await answerInterview(estado.id, valor));
      setTexto('');
    } catch (e) {
      // A mensagem do servidor diz QUAIS opções valem — é orientação, não erro
      // técnico, e trocá-la por texto genérico jogaria a orientação fora.
      const detalhe =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? null;
      setErro(detalhe ?? 'Não foi possível registrar sua resposta. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  const finalizar = async () => {
    if (!estado) return;
    setEnviando(true);
    try {
      await finalizeInterview(estado.id);
      navigation.navigate('Generating');
    } catch {
      setErro('Não foi possível concluir. Confira se todas as perguntas foram respondidas.');
    } finally {
      setEnviando(false);
    }
  };

  if (erro && !estado) {
    return (
      <YStack flex={1} backgroundColor="$background" padding="$xl" justifyContent="center">
        <Body>{erro}</Body>
      </YStack>
    );
  }

  if (!estado) {
    return (
      <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center">
        <ActivityIndicator color={colors.accent} />
      </YStack>
    );
  }

  if (revisando) {
    return (
      <Revisao
        estado={estado}
        onVoltar={() => setRevisando(false)}
        onEditar={async (questionId, valor) => {
          setEstado(await editInterviewAnswer(estado.id, questionId, valor));
        }}
        onConcluir={() => void finalizar()}
        ocupado={enviando}
      />
    );
  }

  const pendente = estado.pendingQuestion;
  const respondeuAlgo = estado.messages.some((m) => m.role === 'STUDENT');
  const processando = enviando || digitando || totalAssistente > reveladas;

  /*
   Só as falas já reveladas entram na lista — as do assistente além do contador
   ainda estão "sendo digitadas".
  */
  let ordinalAssistente = 0;
  const visiveis: { turno: InterviewTurn; indice: number; anima: boolean }[] = [];
  estado.messages.forEach((turno, indice) => {
    if (turno.role === 'ASSISTANT') {
      ordinalAssistente += 1;
      if (ordinalAssistente > reveladas) return;
    }
    visiveis.push({ turno, indice, anima: false });
  });
  // O efeito de máquina roda só na última fala do assistente, e uma vez só.
  const ultimaDoAssistente = [...visiveis].reverse().find((v) => v.turno.role === 'ASSISTANT');
  if (ultimaDoAssistente && !animadas.current.has(ultimaDoAssistente.indice)) {
    ultimaDoAssistente.anima = true;
  }

  /*
   As opções aparecem DEPOIS da abertura respondida, e nunca junto com o
   "pensando" — os chips chegando antes da pergunta era exatamente o defeito
   que o contador de reveladas existe para impedir.
  */
  const mostrarOpcoes =
    respondeuAlgo && !processando && pendente !== null && (pendente.options?.length ?? 0) > 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <YStack flex={1} backgroundColor="$background" paddingTop={insets.top + 12}>
        <XStack alignItems="center" gap="$md" paddingHorizontal="$xl" paddingBottom="$md">
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Icon name="back" size={20} color={colors.textMuted} />
          </Pressable>
          <YStack flex={1}>
            <Label>anamnese</Label>
            <Text fontSize={20} fontWeight="700" color="$foreground" letterSpacing={-0.4}>
              Sobre você
            </Text>
          </YStack>
          <Data>{Math.round(estado.progress * 100)}%</Data>
        </XStack>

        <YStack height={2} backgroundColor="$track" marginHorizontal="$xl">
          <YStack height={2} backgroundColor="$primary" width={`${estado.progress * 100}%`} />
        </YStack>

        <ScrollView
          ref={rolagem}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 20, gap: 12 }}
          onContentSizeChange={() => rolagem.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {visiveis.map(({ turno, indice, anima }) => (
            <Balao
              key={indice}
              turno={turno}
              anima={anima}
              aoTerminar={() => animadas.current.add(indice)}
            />
          ))}

          {/* As opções são um CARTÃO no fluxo, logo após a pergunta — não parte
              do rodapé. É o desenho do MUVX, e é o que deixa o rodapé sempre
              disponível para quem prefere digitar. */}
          {mostrarOpcoes ? (
            <XStack flexWrap="wrap" gap="$sm" paddingLeft="$sm">
              {pendente!.options!.map((opcao) => (
                <Pressable
                  key={opcao}
                  onPress={() => void responder(opcao)}
                  disabled={enviando}
                  accessibilityRole="button"
                  style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                >
                  <YStack
                    paddingVertical="$md"
                    paddingHorizontal="$lg"
                    borderRadius={999}
                    borderWidth={1}
                    borderColor="$primary"
                    backgroundColor="$primarySoft"
                  >
                    <Text fontSize={14} color="$foreground">
                      {opcao}
                    </Text>
                  </YStack>
                </Pressable>
              ))}
            </XStack>
          ) : null}

          {processando ? (
            <XStack alignItems="center" gap="$sm">
              <ActivityIndicator size="small" color={colors.textMuted} />
              <Data>{enviando ? 'anotando…' : 'pensando…'}</Data>
            </XStack>
          ) : null}

          {erro ? <Data color="$destructive">{erro}</Data> : null}
        </ScrollView>

        <YStack
          paddingHorizontal="$xl"
          paddingTop="$md"
          paddingBottom={insets.bottom + 12}
          borderTopWidth={1}
          borderTopColor="$border"
          gap="$sm"
        >
          {estado.readyToFinalize ? (
            <Button
              title="Revisar e enviar"
              icon={<Icon name="check" size={16} color={colors.ink} />}
              onPress={() => setRevisando(true)}
            />
          ) : (
            /*
             O campo de texto fica SEMPRE, mesmo com opções na tela.

             É a parte do desenho do MUVX que mais muda a sensação: os chips são
             atalho, não cerca. O servidor casa "não" com "Não" sem se importar
             com caixa ou acento, e responde dizendo as opções quando não
             entende.
            */
            <XStack alignItems="flex-end" gap="$sm">
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
                  placeholder="Escreva ou dite sua resposta…"
                  placeholderTextColor={colors.textFaint}
                  selectionColor={colors.accent}
                  multiline
                  editable={!enviando && pendente !== null}
                  keyboardType={pendente?.type === 'NUMBER' ? 'number-pad' : 'default'}
                  style={{ fontSize: 15, color: colors.text, maxHeight: 110 }}
                />
              </YStack>
              {/* Ditado por voz — o transcrito entra no campo para revisão,
                  nunca é enviado direto. Mesmo desenho do MUVX. */}
              <VoiceInput
                onTranscript={(t) => setTexto((atual) => (atual ? `${atual} ${t}` : t))}
              />
              <Pressable
                onPress={() => void responder(texto)}
                disabled={!texto.trim() || enviando}
                accessibilityRole="button"
                accessibilityLabel="Enviar"
              >
                <YStack
                  width={44}
                  height={44}
                  borderRadius={22}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor="$primary"
                  opacity={!texto.trim() || enviando ? 0.4 : 1}
                >
                  <Icon name="arrowRight" size={18} color={colors.ink} />
                </YStack>
              </Pressable>
            </XStack>
          )}

          {pendente && !pendente.isRequired && !estado.readyToFinalize ? (
            <Pressable onPress={() => void responder('—')} accessibilityRole="button">
              <Data textAlign="center" textDecorationLine="underline">
                Prefiro não dizer
              </Data>
            </Pressable>
          ) : null}
        </YStack>
      </YStack>
    </KeyboardAvoidingView>
  );
}

/**
 * Efeito de máquina de escrever, uma vez por fala.
 *
 * O `aoTerminar` marca a fala como animada no pai — sem isso, qualquer
 * re-render redigitaria a mesma mensagem, que é o defeito clássico deste
 * efeito.
 */
function useDatilografia(texto: string, ativo: boolean, aoTerminar: () => void) {
  const [mostrado, setMostrado] = useState(ativo ? '' : texto);

  useEffect(() => {
    if (!ativo) {
      setMostrado(texto);
      return;
    }
    setMostrado('');
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setMostrado(texto.slice(0, i));
      if (i >= texto.length) {
        clearInterval(id);
        aoTerminar();
      }
    }, 16);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, ativo]);

  return mostrado;
}

function Balao({
  turno,
  anima,
  aoTerminar,
}: {
  turno: InterviewTurn;
  anima: boolean;
  aoTerminar: () => void;
}) {
  const doAssistente = turno.role === 'ASSISTANT';
  const conteudo = useDatilografia(turno.content, doAssistente && anima, aoTerminar);

  return (
    <XStack justifyContent={doAssistente ? 'flex-start' : 'flex-end'}>
      <YStack
        maxWidth="88%"
        paddingHorizontal="$lg"
        paddingVertical="$md"
        borderRadius={18}
        borderBottomLeftRadius={doAssistente ? 4 : 18}
        borderBottomRightRadius={doAssistente ? 18 : 4}
        backgroundColor={doAssistente ? '$card' : '$primary'}
        borderWidth={doAssistente ? 1 : 0}
        borderColor="$border"
      >
        <Text
          fontSize={15}
          lineHeight={22}
          color={doAssistente ? '$foreground' : '$primaryForeground'}
        >
          {doAssistente ? conteudo : turno.content}
        </Text>
      </YStack>
    </XStack>
  );
}

/**
 * Revisão antes de enviar.
 *
 * Ler o que foi entendido é a única chance de perceber um "sim" dado por
 * engano — e um "sim" errado no PAR-Q muda o plano inteiro.
 */
function Revisao({
  estado,
  onVoltar,
  onEditar,
  onConcluir,
  ocupado,
}: {
  estado: InterviewState;
  onVoltar: () => void;
  onEditar: (questionId: string, valor: string) => Promise<void>;
  onConcluir: () => void;
  ocupado: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [editando, setEditando] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState('');

  return (
    <YStack flex={1} backgroundColor="$background" paddingTop={insets.top + 12}>
      <XStack alignItems="center" gap="$md" paddingHorizontal="$xl" paddingBottom="$md">
        <Pressable onPress={onVoltar} hitSlop={16} accessibilityRole="button" accessibilityLabel="Voltar">
          <Icon name="back" size={20} color={colors.textMuted} />
        </Pressable>
        <YStack flex={1}>
          <Label>revisão</Label>
          <Text fontSize={20} fontWeight="700" color="$foreground" letterSpacing={-0.4}>
            Confira antes de enviar
          </Text>
        </YStack>
      </XStack>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 10 }}
      >
        <SectionTitle marginBottom="$xs">Suas respostas</SectionTitle>

        {estado.filledFields.map((campo) => (
          <Card key={campo.questionId}>
            <Data>{campo.label}</Data>
            {editando === campo.questionId && campo.options ? (
              <XStack flexWrap="wrap" gap="$sm" marginTop="$sm">
                {campo.options.map((opcao) => (
                  <Pressable
                    key={opcao}
                    onPress={() => {
                      setEditando(null);
                      void onEditar(campo.questionId, opcao);
                    }}
                    accessibilityRole="button"
                  >
                    <YStack
                      paddingVertical="$sm"
                      paddingHorizontal="$md"
                      borderRadius={999}
                      borderWidth={1}
                      borderColor={opcao === campo.value ? '$primary' : '$borderStrong'}
                      backgroundColor={opcao === campo.value ? '$primarySoft' : 'transparent'}
                    >
                      <Text fontSize={13} color="$foreground">
                        {opcao}
                      </Text>
                    </YStack>
                  </Pressable>
                ))}
              </XStack>
            ) : editando === campo.questionId ? (
              /*
               Edição de TEXTO na própria revisão. Com as respostas da anamnese
               anterior entrando semeadas, é aqui que "mudei de remédio" se
               corrige — sem isso, campo de texto semeado era imutável e a
               única saída seria responder a entrevista inteira de novo.
              */
              <XStack alignItems="flex-end" gap="$sm" marginTop="$sm">
                <YStack
                  flex={1}
                  borderRadius={12}
                  borderWidth={1}
                  borderColor="$borderStrong"
                  paddingHorizontal="$md"
                  paddingVertical={8}
                >
                  <TextInput
                    value={textoEdicao}
                    onChangeText={setTextoEdicao}
                    autoFocus
                    multiline
                    selectionColor={colors.accent}
                    style={{ fontSize: 14, color: colors.text, maxHeight: 90 }}
                  />
                </YStack>
                <Pressable
                  onPress={() => {
                    setEditando(null);
                    void onEditar(campo.questionId, textoEdicao.trim() || '—');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Salvar correção"
                >
                  <YStack
                    width={38}
                    height={38}
                    borderRadius={19}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor="$primary"
                  >
                    <Icon name="check" size={16} color={colors.ink} />
                  </YStack>
                </Pressable>
              </XStack>
            ) : (
              <XStack alignItems="center" gap="$md" marginTop={2}>
                <Body flex={1} color="$foreground">
                  {campo.value}
                </Body>
                <Pressable
                  onPress={() => {
                    setEditando(campo.questionId);
                    if (!campo.options) setTextoEdicao(campo.value === '—' ? '' : campo.value);
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Corrigir ${campo.label}`}
                >
                  <Data color="$primary">corrigir</Data>
                </Pressable>
              </XStack>
            )}
          </Card>
        ))}

        {!estado.readyToFinalize ? (
          <Body marginTop="$md">
            Sua correção abriu uma pergunta nova. Volte à conversa para respondê-la.
          </Body>
        ) : null}
      </ScrollView>

      <YStack
        paddingHorizontal="$xl"
        paddingTop="$md"
        paddingBottom={insets.bottom + 12}
        borderTopWidth={1}
        borderTopColor="$border"
      >
        <Button
          title="Enviar e montar meu treino"
          loading={ocupado}
          disabled={!estado.readyToFinalize}
          icon={<Icon name="dumbbell" size={16} color={colors.ink} />}
          onPress={onConcluir}
        />
      </YStack>
    </YStack>
  );
}
