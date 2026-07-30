import { useNavigation } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Checkbox, Field } from '../components/Field';
import { Icon } from '../components/Icon';
import { Body, Data, Label } from '../components/ui';
import { useAuthStore } from '../store/auth.store';
import { useTheme } from '../theme/ThemeProvider';

/** aaaa-mm-dd, e uma data que existe de verdade. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validBirthDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const age = (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
  return age >= 16 && age <= 110;
}

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

  const dateOk = birthDate.length === 0 || validBirthDate(birthDate);
  const canSubmit =
    name.trim().length >= 2 &&
    email.includes('@') &&
    password.length >= 10 &&
    validBirthDate(birthDate) &&
    sex !== null &&
    consentBiometric &&
    consentTransfer;

  const submit = async () => {
    if (!canSubmit || loading || !sex) return;
    await signUp({ name: name.trim(), email: email.trim().toLowerCase(), password, birthDate, sex });
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

        <Text
          fontSize={30}
          fontWeight="700"
          letterSpacing={-1}
          color="$foreground"
          marginBottom="$xxl"
        >
          Criar conta
        </Text>

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
          onChangeText={setBirthDate}
          placeholder="1990-05-12"
          keyboardType="numbers-and-punctuation"
          error={dateOk ? undefined : 'Use o formato aaaa-mm-dd'}
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
                <Text fontSize={16} color={sex === value ? '$foreground' : '$faint'}>
                  {label}
                </Text>
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
          <Data marginTop="$md" lineHeight={17}>
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
            paddingVertical={14}
            paddingHorizontal="$xl"
            borderRadius={999}
            backgroundColor={!canSubmit || loading ? '$control' : '$primary'}
          >
            <Text
              fontSize={15}
              fontWeight="700"
              color={!canSubmit || loading ? '$faint' : '$primaryForeground'}
            >
              {loading ? 'Criando' : 'Criar conta'}
            </Text>
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
