import { useNavigation } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { Body, Button, Data, Label, Title } from '../components/ui';
import {
  nextQuestion,
  progressOf,
  summarize,
  WEEKDAYS,
  type Lifestyle,
  type Option,
  type Question,
} from '../domain/onboarding';
import { useLifestyleStore } from '../store/lifestyle.store';
import { useUserStore } from '../store/user.store';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

/**
 * Onboarding — uma pergunta por tela.
 *
 * Uma por tela e não um formulário rolável, porque as perguntas se RAMIFICAM:
 * o que vem depois depende do que acabou de ser respondido, e não há como
 * mostrar tudo de uma vez sem exibir perguntas que não se aplicam. O grafo mora
 * em `domain/onboarding.ts` e é testado sem montar componente nenhum; esta tela
 * só desenha o que ele devolve.
 *
 * O progresso é declarado como ESTIMATIVA. Quem não pratica atividade responde
 * quatro perguntas a menos, e uma barra que promete dez e entrega seis parece
 * defeito — assumir a incerteza custa menos que a surpresa.
 */
export function OnboardingScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const answers = useLifestyleStore((s) => s.answers);
  const loaded = useLifestyleStore((s) => s.loaded);
  const load = useLifestyleStore((s) => s.load);
  const answer = useLifestyleStore((s) => s.answer);
  const undo = useLifestyleStore((s) => s.undo);
  const finish = useLifestyleStore((s) => s.finish);
  const user = useUserStore((s) => s.user);

  const [text, setText] = useState('');
  const [multi, setMulti] = useState<string[]>([]);
  const [days, setDays] = useState<number[]>([]);
  /** Perguntas já respondidas, na ordem, para o botão voltar. */
  const [trail, setTrail] = useState<(keyof Lifestyle)[]>([]);

  useEffect(() => {
    void load();
  }, [load]);

  const question = loaded ? nextQuestion(answers) : null;
  const { answered, estimatedTotal } = progressOf(answers);

  // Campos de composição zeram a cada pergunta: sem isso, o texto digitado na
  // ocupação reapareceria na próxima pergunta de texto.
  useEffect(() => {
    setText('');
    setMulti([]);
    setDays([]);
  }, [question?.id]);

  const commit = (id: keyof Lifestyle, value: unknown) => {
    setTrail((t) => [...t, id]);
    answer(id, value);
  };

  const back = () => {
    const last = trail[trail.length - 1];
    if (!last) return navigation.goBack();
    setTrail((t) => t.slice(0, -1));
    undo(last);
  };

  if (!loaded) {
    return (
      <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center">
        <Body>Carregando…</Body>
      </YStack>
    );
  }

  // Fluxo concluído: o resumo devolve o que foi entendido, para a pessoa
  // conferir em vez de confiar. É o único momento em que ela consegue perceber
  // que respondeu algo errado.
  if (!question) {
    const lines = summarize(answers);
    return (
      <YStack flex={1} backgroundColor="$background">
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: space.screen, paddingTop: insets.top + space.xxxl }}
          showsVerticalScrollIndicator={false}
        >
          <Label marginBottom="$md">pronto</Label>
          <Title>É isso, {user.name.split(' ')[0]}?</Title>

          <YStack marginTop="$xxl" gap="$lg">
            {lines.map((line) => (
              <Body key={line} fontSize={15} lineHeight={23} color="$foreground">
                {line}
              </Body>
            ))}
          </YStack>

          <Data marginTop="$xxl" maxWidth="94%">
            A partir de agora as sugestões da tela inicial levam isto em conta. Dá para mudar quando quiser em
            Configurações.
          </Data>

          <YStack marginTop="$xxl">
            <Button
              title="Começar a usar"
              onPress={() => {
                void finish();
                navigation.reset({ index: 0, routes: [{ name: 'Main' as never }] });
              }}
              icon={<Icon name="arrowRight" size={16} color={colors.ink} />}
            />
          </YStack>

          <SkipLink label="Corrigir a última resposta" onPress={back} />
        </ScrollView>
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$background">
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal={space.screen}
        paddingTop={insets.top + space.md}
        paddingBottom="$lg"
      >
        <Pressable onPress={back} hitSlop={16} accessibilityRole="button" accessibilityLabel="Voltar">
          <Icon name="back" size={20} color={colors.textMuted} />
        </Pressable>
        <Data>
          {answered + 1} de aproximadamente {estimatedTotal}
        </Data>
      </XStack>

      <YStack height={2} backgroundColor="$track" marginHorizontal={space.screen}>
        <YStack
          height={2}
          backgroundColor="$primary"
          width={`${Math.min(1, answered / estimatedTotal) * 100}%`}
        />
      </YStack>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space.screen,
          paddingTop: space.xxxl,
          paddingBottom: insets.bottom + space.xxxl,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Title fontSize={26} lineHeight={32}>{question.title}</Title>
        {question.hint ? <Body marginTop="$md" maxWidth="94%">{question.hint}</Body> : null}

        {question.kind === 'text' ? (
          <YStack marginTop="$xxl" gap="$xxl">
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Ex.: enfermeira, motorista, professora…"
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.accent}
              autoCapitalize="sentences"
              autoFocus
              style={{
                fontSize: 20,
                fontWeight: '300',
                color: colors.text,
                paddingBottom: space.md,
                borderBottomWidth: 1,
                borderBottomColor: colors.hairlineStrong,
              }}
              onSubmitEditing={() => text.trim().length >= 2 && commit(question.id, text.trim())}
              returnKeyType="done"
            />
            <Button
              title="Continuar"
              onPress={() => commit(question.id, text.trim())}
              disabled={text.trim().length < 2}
            />
          </YStack>
        ) : null}

        {question.kind === 'single' || question.kind === 'hours' ? (
          <YStack marginTop="$xxl">
            {question.options?.map((option) => (
              <Choice key={String(option.value)} option={option} onPress={() => commit(question.id, option.value)} />
            ))}
          </YStack>
        ) : null}

        {question.kind === 'multi' ? (
          <>
            <XStack flexWrap="wrap" gap="$sm" marginTop="$xxl">
              {question.options?.map((option) => {
                const value = String(option.value);
                const on = multi.includes(value);
                return (
                  <Pressable
                    key={value}
                    onPress={() => setMulti((m) => (on ? m.filter((v) => v !== value) : [...m, value]))}
                    style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <YStack
                      paddingVertical="$md"
                      paddingHorizontal="$lg"
                      borderRadius={8}
                      borderWidth={1}
                      borderColor={on ? '$primary' : '$borderStrong'}
                      backgroundColor={on ? '$primarySoft' : 'transparent'}
                    >
                      <Text fontSize={14} color={on ? '$foreground' : '$mutedForeground'}>
                        {option.label}
                      </Text>
                    </YStack>
                  </Pressable>
                );
              })}
            </XStack>
            <ContinueButton disabled={multi.length === 0} onPress={() => commit(question.id, multi)} />
          </>
        ) : null}

        {question.kind === 'weekdays' ? (
          <>
            <XStack gap="$sm" marginTop="$xxl">
              {WEEKDAYS.map((label, index) => {
                const on = days.includes(index);
                return (
                  <Pressable
                    key={label}
                    onPress={() => setDays((d) => (on ? d.filter((v) => v !== index) : [...d, index]))}
                    style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.5 }]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={label}
                  >
                    <YStack
                      paddingVertical="$lg"
                      alignItems="center"
                      borderRadius={8}
                      borderWidth={1}
                      borderColor={on ? '$primary' : '$borderStrong'}
                      backgroundColor={on ? '$primarySoft' : 'transparent'}
                    >
                      <Text fontSize={12} color={on ? '$foreground' : '$mutedForeground'}>
                        {label}
                      </Text>
                    </YStack>
                  </Pressable>
                );
              })}
            </XStack>
            <ContinueButton disabled={days.length === 0} onPress={() => commit(question.id, days)} />
          </>
        ) : null}

        {question.optional ? (
          <SkipLink label="Prefiro não dizer" onPress={() => commit(question.id, null)} />
        ) : null}
      </ScrollView>
    </YStack>
  );
}

/** Saída discreta: "prefiro não dizer", "corrigir". Nunca compete com a ação. */
function SkipLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [{ paddingVertical: space.lg, marginTop: space.md }, pressed && { opacity: 0.5 }]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Data textDecorationLine="underline">{label}</Data>
    </Pressable>
  );
}

/**
 * Opção única. O toque JÁ avança — sem seleção seguida de "continuar".
 *
 * Dois toques por pergunta num fluxo de oito perguntas são oito toques a mais
 * sem nenhuma informação nova. Só escolha múltipla precisa de confirmação,
 * porque ali o app não tem como saber que a pessoa terminou.
 */
function Choice({ option, onPress }: { option: Option; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
      onPress={onPress}
      accessibilityRole="button"
    >
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingVertical="$lg"
        borderBottomWidth={1}
        borderBottomColor="$border"
      >
        <YStack flex={1} gap="$xs">
          <Text fontSize={16} letterSpacing={-0.2} color="$foreground">
            {option.label}
          </Text>
          {option.detail ? <Data>{option.detail}</Data> : null}
        </YStack>
        <Icon name="arrowRight" size={16} color={colors.textFaint} />
      </XStack>
    </Pressable>
  );
}

function ContinueButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  return (
    <YStack marginTop="$xxl">
      <Button title="Continuar" onPress={onPress} disabled={disabled} />
    </YStack>
  );
}
