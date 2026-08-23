import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Checkbox, Field } from '../components/Field';
import { Icon } from '../components/Icon';
import { Body, BodyLarge, Data, Headline, Label, SectionTitle } from '../components/ui';
import { isValidBirthDate, maskBirthDate, toIsoBirthDate } from '../domain/birthDate';
import { useAuthStore } from '../store/auth.store';
import { useTheme } from '../theme/ThemeProvider';

/** aaaa-mm-dd, e uma data que existe de verdade. */


export function SignUpScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const signUp = useAuthStore((s) => s.signUp);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<'f' | 'm' | null>(null);
  const [consentBiometric, setConsentBiometric] = useState(false);
  const [consentTransfer, setConsentTransfer] = useState(false);

  const dateOk = birthDate.length === 0 || isValidBirthDate(birthDate);
  const canSubmit =
    name.trim().length >= 2 &&
    email.includes('@') &&
    password.length >= 10 &&
    isValidBirthDate(birthDate) &&
    sex !== null &&
    consentBiometric &&
    consentTransfer;

  const submit = async () => {
    if (!canSubmit || loading || !sex) return;
    await signUp({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      // A tela fala português; o servidor fala ISO. A tradução mora aqui, na
      // borda, e não no que a pessoa digita.
      birthDate: toIsoBirthDate(birthDate)!,
      sex,
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.ink }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: 48,
          paddingTop: insets.top + 16,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={16}
          style={{ width: 24, marginBottom: 24 }}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Icon name="back" size={20} color={colors.textMuted} />
        </Pressable>

        <Headline
          fontWeight="700"
          letterSpacing={-1}
          color="$foreground"
          marginBottom="$xxl"
        >
          Criar conta
        </Headline>

        <Field
          label="Nome"
          value={name}
          onChangeText={(t) => {
            clearError();
            setName(t);
          }}
          autoComplete="name"
          autoCapitalize="words"
        />
        <Field
          label="E-mail"
          value={email}
          onChangeText={(t) => {
            clearError();
            setEmail(t);
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Field
          label="Senha"
          value={password}
          onChangeText={(t) => {
            clearError();
            setPassword(t);
          }}
          secureTextEntry
          autoComplete="new-password"
          hint="Mínimo de 10 caracteres"
        />
        <Field
          label="Data de nascimento"
          value={birthDate}
          onChangeText={(t) => setBirthDate(maskBirthDate(t))}
          placeholder="12/05/1990"
          keyboardType="number-pad"
          error={dateOk ? undefined : 'Use o formato dia/mês/ano'}
          hint="Define a faixa etária de referência da sua idade biológica"
        />

        <YStack marginBottom="$xl" gap="$md">
          <Label>Sexo biológico</Label>
          <XStack gap="$xxl" paddingVertical="$sm">
            {(
              [
                ['f', 'Feminino'],
                ['m', 'Masculino'],
              ] as const
            ).map(([value, label]) => (
              <Pressable key={value} onPress={() => setSex(value)} hitSlop={8} accessibilityRole="radio">
                <BodyLarge color={sex === value ? '$foreground' : '$faint'}>
                  {label}
                </BodyLarge>
              </Pressable>
            ))}
          </XStack>
          <Data>As referências de HRV e frequência cardíaca diferem entre os dois</Data>
        </YStack>

        <YStack
          marginTop="$md"
          marginBottom="$xl"
          paddingTop="$xl"
          borderTopWidth={1}
          borderTopColor="$border"
        >
          <Label marginBottom="$sm">Consentimento</Label>
          <Checkbox
            required
            checked={consentBiometric}
            onToggle={() => setConsentBiometric((v) => !v)}
            title="Tratamento de dado biométrico"
            body="Autorizo o AssumFit a coletar e processar meus dados de frequência cardíaca, HRV, oxigenação, temperatura, sono e atividade para gerar as análises do app. Dado biométrico é dado pessoal sensível."
          />
          <Checkbox
            required
            checked={consentTransfer}
            onToggle={() => setConsentTransfer((v) => !v)}
            title="Transferência internacional"
            body="Autorizo o armazenamento desses dados em servidores fora do Brasil, onde a infraestrutura do produto é operada."
          />
          <Data marginTop="$md" lineHeight={18}>
            Você pode revogar a qualquer momento em Dispositivo → Conta. A revogação apaga seus
            dados, não apenas interrompe a coleta.
          </Data>
        </YStack>

        {error ? (
          <Body color="$destructive" marginBottom="$lg">
            {error}
          </Body>
        ) : null}

        <Pressable
          style={({ pressed }) => [{ alignSelf: 'flex-start' }, pressed && { opacity: 0.5 }]}
          onPress={submit}
          disabled={!canSubmit || loading}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit || loading }}
        >
          <XStack
            alignItems="center"
            gap="$md"
            paddingVertical={16}
            paddingHorizontal="$xl"
            borderRadius={999}
            backgroundColor={!canSubmit || loading ? '$control' : '$primary'}
          >
            <SectionTitle
              color={!canSubmit || loading ? '$faint' : '$primaryForeground'}
            >
              {loading ? 'Criando' : 'Criar conta'}
            </SectionTitle>
            <Icon
              name="arrowRight"
              size={16}
              color={!canSubmit || loading ? colors.textFaint : colors.ink}
            />
          </XStack>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
