import { useNavigation } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useMemo, useState } from 'react';
import { TextInput } from 'react-native';

import { Note } from '../../components/Card';
import { DetailScreen } from '../../components/DetailScreen';
import { Icon } from '../../components/Icon';
import { Body, Button, Card, Data, HeroCard, SectionTitle } from '../../components/ui';
import {
  impliesReferral,
  nextQuestion,
  remainingCount,
  setAt,
  valueAt,
  type Anamnesis,
  type Option,
  type Question,
} from '../../domain/anamnesis';
import {
  fetchAnamnesis,
  fetchWorkoutConsent,
  saveAnamnesis,
} from '../../services/api.service';
import { useTheme } from '../../theme/ThemeProvider';
import { WorkoutConsentGate } from './WorkoutConsentGate';

/**
 * Anamnese de saúde, uma pergunta por vez.
 *
 * Mesmo formato do onboarding: o grafo é dado, a tela só renderiza a pergunta
 * que ele devolve. O que muda é o peso — aqui uma resposta perdida vira treino
 * prescrito para quem não deveria treinar sozinho, e por isso as perguntas
 * clínicas não têm "pular".
 *
 * A tela avisa quando as respostas já implicam encaminhamento, em vez de deixar
 * a pessoa chegar ao fim esperando um treino. A decisão continua sendo do
 * servidor; este aviso só antecipa a má notícia.
 */
export function AnamnesisScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();

  const [answers, setAnswers] = useState<Anamnesis>({});
  const [loaded, setLoaded] = useState(false);
  const [consented, setConsented] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    Promise.all([fetchWorkoutConsent(), fetchAnamnesis()])
      .then(([granted, found]) => {
        setConsented(granted);
        if (found) setAnswers(found.answers as Anamnesis);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  const question = useMemo(() => nextQuestion(answers), [answers]);
  const remaining = useMemo(() => remainingCount(answers), [answers]);
  const referral = impliesReferral(answers);

  // O rascunho pertence à pergunta, não à tela: sem isto, a resposta de texto
  // de uma pergunta reaparece na próxima.
  useEffect(() => setDraft(''), [question?.id]);

  const answer = (value: unknown) => setAnswers((prev) => setAt(prev, question!.id, value));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveAnamnesis(answers as Record<string, unknown>);
      navigation.replace('Generating');
    } catch {
      setError('Não foi possível salvar suas respostas. Tente de novo.');
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <DetailScreen title="Saúde">
        <Text fontSize={16} color="$mutedForeground">
          Carregando…
        </Text>
      </DetailScreen>
    );
  }

  /*
   Consentimento antes da primeira pergunta.

   Vem primeiro porque a pergunta seguinte JÁ É o dado sensível: "algum médico
   já disse que você tem um problema no coração?" não pode aparecer antes de a
   pessoa saber o que vai ser feito com a resposta.
  */
  if (!consented) {
    return (
      <DetailScreen title="Saúde">
        <WorkoutConsentGate
          onGranted={() => setConsented(true)}
          onDecline={() => navigation.goBack()}
        />
      </DetailScreen>
    );
  }

  // ---- Fim do grafo ------------------------------------------------------
  if (!question) {
    return (
      <DetailScreen title="Saúde">
        <YStack gap="$xl" paddingTop="$lg">
          <HeroCard eyebrow={referral ? 'atenção' : 'tudo pronto'}>
            <Text fontSize={22} fontWeight="800" color="$foreground" letterSpacing={-0.5}>
              {referral ? 'Vamos com cuidado aqui' : 'Podemos montar seu treino'}
            </Text>
            <Body color="$mutedForeground">
              {referral
                ? 'Pelo que você respondeu, o caminho seguro passa por um profissional antes de treinar por conta. Podemos seguir, mas é possível que a resposta seja um encaminhamento em vez de um treino.'
                : 'Com essas respostas dá para montar um treino que respeita o seu histórico e a sua rotina.'}
            </Body>
          </HeroCard>

          {error ? (
            <Body color="$destructive">
              {error}
            </Body>
          ) : null}

          <Button
            title={saving ? 'Salvando…' : 'Montar meu treino'}
            icon={<Icon name="arrowRight" size={16} color={colors.ink} />}
            loading={saving}
            onPress={submit}
          />

          <Note
            title="por que perguntamos tudo isso"
            body={
              'Cada resposta muda o treino: uma condição do coração define o que fica fora, ' +
              'peso e altura mudam a escolha de exercício, e o tempo disponível decide o volume. ' +
              'Nada aqui é cadastro, se um campo não mudasse nada, ele não estaria na lista.'
            }
          />
        </YStack>
      </DetailScreen>
    );
  }

  const progress = remaining > 0 ? 1 / (remaining + 1) : 1;

  return (
    <DetailScreen title="Saúde">
      <YStack gap="$lg" paddingTop="$sm">
        <YStack height={4} backgroundColor="$track" borderRadius={1} overflow="hidden">
          <YStack height={4} backgroundColor="$primary" width={`${Math.min(1, progress) * 100}%`} />
        </YStack>
        <Data color="$mutedForeground">
          {remaining === 1 ? 'última pergunta' : `faltam ${remaining} perguntas`}
        </Data>

        {question.clinical ? (
          <Text
            fontSize={12}
            fontWeight="700"
            letterSpacing={1.5}
            color="$primary"
            textTransform="uppercase"
          >
            segurança
          </Text>
        ) : null}

        <YStack gap="$sm">
          <Text fontSize={22} fontWeight="800" color="$foreground" letterSpacing={-0.5}>
            {question.title}
          </Text>
          {question.hint ? (
            <Body color="$mutedForeground">
              {question.hint}
            </Body>
          ) : null}
        </YStack>

        <YStack gap="$md" paddingTop="$sm">
          {question.kind === 'yesno' || question.kind === 'single' ? (
            <SingleChoice options={question.options ?? []} onPick={answer} />
          ) : null}

          {question.kind === 'multi' ? (
            <MultiChoice
              options={question.options ?? []}
              value={(valueAt(answers, question.id) as string[]) ?? []}
              onChange={answer}
            />
          ) : null}

          {question.kind === 'number' || question.kind === 'text' ? (
            <FreeInput
              question={question}
              value={draft}
              onChange={setDraft}
              onSubmit={() =>
                answer(question.kind === 'number' ? Number(draft.replace(',', '.')) : draft.trim())
              }
            />
          ) : null}
        </YStack>

        {question.optional ? (
          <Button
            title="Pular"
            variant="ghost"
            onPress={() => answer(question.kind === 'multi' ? [] : '')}
          />
        ) : null}
      </YStack>
    </DetailScreen>
  );
}

function SingleChoice({ options, onPick }: { options: Option[]; onPick: (v: unknown) => void }) {
  return (
    <YStack gap="$md">
      {options.map((option) => (
        <Card
          key={String(option.value)}
          onPress={() => onPick(option.value)}
          accessibilityLabel={option.label}
        >
          <SectionTitle color="$foreground">
            {option.label}
          </SectionTitle>
          {option.detail ? (
            <Body color="$mutedForeground">
              {option.detail}
            </Body>
          ) : null}
        </Card>
      ))}
    </YStack>
  );
}

/**
 * Escolha múltipla.
 *
 * "Nenhuma dessas" é exclusiva: marcar uma condição e "nenhuma" ao mesmo tempo
 * é uma contradição que o formulário não deveria permitir produzir.
 */
function MultiChoice({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { colors } = useTheme();
  const [picked, setPicked] = useState<string[]>(value);

  const toggle = (raw: unknown) => {
    const item = String(raw);
    if (item === 'nenhuma') return setPicked(['nenhuma']);
    const without = picked.filter((p) => p !== 'nenhuma');
    setPicked(without.includes(item) ? without.filter((p) => p !== item) : [...without, item]);
  };

  return (
    <YStack gap="$md">
      {options.map((option) => {
        const on = picked.includes(String(option.value));
        return (
          <Card key={String(option.value)} onPress={() => toggle(option.value)} selected={on}>
            <XStack alignItems="center" gap="$md">
              <SectionTitle color="$foreground" flex={1}>
                {option.label}
              </SectionTitle>
              <YStack
                width={24}
                height={24}
                borderRadius={8}
                alignItems="center"
                justifyContent="center"
                borderWidth={on ? 0 : 1}
                borderColor="$borderStrong"
                backgroundColor={on ? '$primary' : 'transparent'}
              >
                {on ? <Icon name="check" size={16} color={colors.ink} /> : null}
              </YStack>
            </XStack>
          </Card>
        );
      })}
      <Button
        title="Continuar"
        icon={<Icon name="arrowRight" size={16} color={colors.ink} />}
        onPress={() => onChange(picked)}
      />
    </YStack>
  );
}

function FreeInput({
  question,
  value,
  onChange,
  onSubmit,
}: {
  question: Question;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const { colors } = useTheme();
  const numeric = question.kind === 'number';

  return (
    <YStack gap="$lg">
      <Card>
        <XStack alignItems="flex-end" gap="$sm">
          <TextInput
            style={{
              color: colors.text,
              fontSize: numeric ? 40 : 16,
              fontWeight: numeric ? '300' : '400',
              flex: 1,
              paddingVertical: 8,
            }}
            value={value}
            onChangeText={onChange}
            keyboardType={numeric ? 'decimal-pad' : 'default'}
            multiline={!numeric}
            autoFocus
            placeholder={numeric ? '' : 'Escreva aqui'}
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={question.title}
          />
          {question.unit ? (
            <Text fontSize={16} color="$mutedForeground" marginBottom={12}>
              {question.unit}
            </Text>
          ) : null}
        </XStack>
      </Card>
      <Button
        title="Continuar"
        icon={<Icon name="arrowRight" size={16} color={colors.ink} />}
        disabled={numeric && !value}
        onPress={onSubmit}
      />
    </YStack>
  );
}
