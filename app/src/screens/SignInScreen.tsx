import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Field } from '../components/Field';
import { Icon } from '../components/Icon';
import { LogoType } from '../components/Logo';
import { Body, Headline, SectionTitle } from '../components/ui';
import { useAuthStore } from '../store/auth.store';
import { useTheme } from '../theme/ThemeProvider';

export function SignInScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const signIn = useAuthStore((s) => s.signIn);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const disabled = loading || !email || !password;

  const submit = async () => {
    if (loading) return;
    await signIn(email.trim().toLowerCase(), password);
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
          paddingTop: insets.top + 48,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LogoType height={20} />
        <Headline
          fontWeight="700"
          letterSpacing={-1.2}
          color="$foreground"
          marginTop="$xxxl"
          marginBottom="$xxl"
        >
          Entrar
        </Headline>

        <YStack marginTop="$md">
          <Field
            label="E-mail"
            value={email}
            onChangeText={(t) => {
              clearError();
              setEmail(t);
            }}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="voce@exemplo.com"
          />
          <Field
            label="Senha"
            value={password}
            onChangeText={(t) => {
              clearError();
              setPassword(t);
            }}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={submit}
            returnKeyType="go"
          />
        </YStack>

        {error ? (
          <Body color="$destructive" marginBottom="$lg">
            {error}
          </Body>
        ) : null}

        <Pressable
          style={({ pressed }) => [{ alignSelf: 'flex-start' }, pressed && { opacity: 0.5 }]}
          onPress={submit}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
        >
          <XStack
            alignItems="center"
            gap="$md"
            paddingVertical={16}
            paddingHorizontal="$xl"
            marginTop="$md"
            borderRadius={999}
            backgroundColor={disabled ? '$control' : '$primary'}
          >
            <SectionTitle
              color={disabled ? '$faint' : '$primaryForeground'}
            >
              {loading ? 'Entrando' : 'Entrar'}
            </SectionTitle>
            <Icon name="arrowRight" size={16} color={disabled ? colors.textFaint : colors.ink} />
          </XStack>
        </Pressable>

        <Pressable
          style={({ pressed }) => [{ marginTop: 32, paddingVertical: 12 }, pressed && { opacity: 0.5 }]}
          onPress={() => navigation.navigate('SignUp' as never)}
          accessibilityRole="button"
        >
          <Body>Ainda não tem conta? Criar conta</Body>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
