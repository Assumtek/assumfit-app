import { useNavigation } from '@react-navigation/native';
import { styled, Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Image, Pressable } from 'react-native';

import { Row, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { Field } from '../components/Field';
import { Icon } from '../components/Icon';
import { Body, Button, Data, Title } from '../components/ui';
import { formatDateBR, maskBirthDate, toIsoBirthDate } from '../domain/birthDate';
import { useUserStore } from '../store/user.store';
import { useTheme } from '../theme/ThemeProvider';

const PURPOSE_LABEL: Record<string, string> = {
  biometric_processing: 'Dado biométrico',
  international_transfer: 'Transferência internacional',
  marketing: 'Comunicações de produto',
};

const SEX_LABEL = { f: 'Feminino', m: 'Masculino' } as const;

/**
 * Perfil.
 *
 * Mostra a conta e o que ela autorizou. A lista de consentimentos não é
 * burocracia enfiada numa tela de cadastro: com dado biométrico a base legal é
 * consentimento específico (LGPD Art. 11), e a pessoa tem que conseguir ver o
 * que aceitou e quando, sem pedir a ninguém.
 *
 * Nome, nascimento e sexo são editáveis porque alimentam as faixas de
 * referência da idade biológica — um erro de digitação no cadastro faria o app
 * comparar contra a população errada pelo resto da assinatura. E-mail e senha
 * ficam fora: são credencial, e trocar credencial pede confirmação de senha,
 * que é fluxo próprio.
 */
export function ProfileScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const profile = useUserStore((s) => s.profile);
  const user = useUserStore((s) => s.user);
  const age = useUserStore((s) => s.age());
  const loading = useUserStore((s) => s.loading);
  const load = useUserStore((s) => s.load);
  const save = useUserStore((s) => s.save);
  const avatarUri = useUserStore((s) => s.avatarUri);
  const setAvatar = useUserStore((s) => s.setAvatar);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [birthDate, setBirthDate] = useState(formatDateBR(profile?.birthDate));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const beginEdit = () => {
    setName(user.name);
    setBirthDate(formatDateBR(profile?.birthDate));
    setError(null);
    setEditing(true);
  };

  const commit = async () => {
    // Valida antes de mandar: o servidor recusaria de qualquer forma, e uma ida
    // à rede para descobrir que a data não parseia é ida desperdiçada.
    if (name.trim().length < 2) return setError('Nome muito curto');
    const iso = toIsoBirthDate(birthDate);
    if (!iso) return setError('Data no formato DD/MM/AAAA');

    const ok = await save({ name: name.trim(), birthDate: iso });
    /*
     Sem culpar a conexão: `save` devolve booleano e não entrega o erro, então
     aqui não há como saber a causa. Afirmar "confira a conexão" quando o mais
     provável é sessão expirada manda a pessoa consertar o que não quebrou —
     ver `domain/apiErrors.ts`. Quando o store passar a propagar o erro, esta
     linha vira `mensagemDaFalha`.
    */
    if (!ok) return setError('Não foi possível salvar. Tente de novo.');
    setEditing(false);
  };

  const escolherFoto = async () => {
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    const uri = resultado.assets?.[0]?.uri;
    if (uri) await setAvatar(uri);
  };

  const rows = [
    { label: 'Nome', value: user.name },
    { label: 'E-mail', value: profile?.email ?? '—' },
    { label: 'Nascimento', value: profile ? formatDateBR(profile.birthDate) : '—' },
    { label: 'Idade', value: `${age} anos` },
    { label: 'Sexo biológico', value: SEX_LABEL[user.sex] },
  ];

  return (
    <DetailScreen title="Perfil">
      <XStack marginBottom="$xxl" gap="$lg" alignItems="center">
        {/*
          A foto abre o seletor no toque — sem botão "trocar foto": a própria
          imagem é o lugar onde todo mundo tenta tocar primeiro.
        */}
        <Pressable
          onPress={() => void escolherFoto()}
          accessibilityRole="button"
          accessibilityLabel={avatarUri ? 'Trocar foto de perfil' : 'Adicionar foto de perfil'}
        >
          {avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={{ width: 64, height: 64, borderRadius: 32 }}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <YStack
              width={64}
              height={64}
              borderRadius={32}
              borderWidth={1}
              borderColor="$borderStrong"
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize={22} color="$mutedForeground">
                {user.name.trim().charAt(0).toUpperCase()}
              </Text>
            </YStack>
          )}
        </Pressable>
        <YStack flex={1} gap="$sm">
          <Title>{user.name}</Title>
          <Data>
            {profile ? `assinante desde ${formatDateBR(profile.createdAt)}` : 'perfil local — sem conexão'}
          </Data>
        </YStack>
      </XStack>

      {editing ? (
        <Section label="Editar cadastro" divider={false}>
          <Field label="Nome" value={name} onChangeText={setName} autoCapitalize="words" />
          <Field
            label="Nascimento"
            value={birthDate}
            onChangeText={(texto) => setBirthDate(maskBirthDate(texto))}
            placeholder="DD/MM/AAAA"
            keyboardType="numbers-and-punctuation"
          />
          {error ? <Data color="$destructive" marginTop="$sm">{error}</Data> : null}

          <XStack alignItems="center" gap="$xl" marginTop="$xl">
            <Button title="Salvar" onPress={commit} loading={loading} size="md" />
            <Pressable
              style={({ pressed }) => [{ paddingVertical: 8 }, pressed && { opacity: 0.5 }]}
              onPress={() => setEditing(false)}
              accessibilityRole="button"
            >
              <Text fontSize={15} color="$foreground">Cancelar</Text>
            </Pressable>
          </XStack>
        </Section>
      ) : (
        <Section label="Cadastro" divider={false}>
          {rows.map((row, i) => (
            <Row key={row.label} last={i === rows.length - 1}>
              <RowLabel>{row.label}</RowLabel>
              <RowValue>{row.value}</RowValue>
            </Row>
          ))}
          <Pressable
            style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
            onPress={beginEdit}
            accessibilityRole="button"
          >
            <XStack alignItems="center" justifyContent="space-between" paddingTop="$lg">
              <Text fontSize={15} color="$foreground">Editar cadastro</Text>
              <Icon name="arrowRight" size={16} color={colors.textMuted} />
            </XStack>
          </Pressable>
        </Section>
      )}

      {/*
        Não há seção de assinatura, e a ausência é deliberada.

        Ela mostrava situação, data e MENSALIDADE em reais — de uma assinatura
        que nada no produto cria: a linha só nasce no seed, que não roda em
        produção. Todo usuário real lia "Nenhuma assinatura registrada nesta
        conta", e a revisão da App Store leu uma tela que fala de mensalidade
        como sinal de conteúdo pago sem compra dentro do app (2.1(b), ago/2026).
        Volta quando existir cobrança de verdade para descrever.
      */}
      <Section label="Consentimentos">
        {profile && profile.consents.length > 0 ? (
          profile.consents.map((consent, i) => (
            <Row key={consent.purpose} last={i === profile.consents.length - 1}>
              <YStack flex={1} gap="$xs">
                <RowLabel>{PURPOSE_LABEL[consent.purpose] ?? consent.purpose}</RowLabel>
                <Data>
                  versão {consent.version} · {formatDateBR(consent.grantedAt)}
                </Data>
              </YStack>
              {/* $foreground, não acento: texto em #877BF0 mede ~2,8:1 no tema
                  claro — o estado "ativo" se distingue por peso, não por cor. */}
              <RowValue color="$foreground" fontWeight="700">ativo</RowValue>
            </Row>
          ))
        ) : (
          <Body>Nenhum consentimento ativo registrado.</Body>
        )}
      </Section>

      <Pressable
        style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
        onPress={() => (navigation as any).push('Settings' as never)}
        accessibilityRole="button"
      >
        <XStack
          alignItems="center"
          justifyContent="space-between"
          marginTop="$xxl"
          paddingVertical="$lg"
          borderTopWidth={1}
          borderTopColor="$border"
        >
          <Text fontSize={15} color="$foreground">Configurações do app</Text>
          <Icon name="arrowRight" size={16} color={colors.textMuted} />
        </XStack>
      </Pressable>
    </DetailScreen>
  );
}

/**
 * `1994-03-12` (com ou sem hora) → `12/03/1994`.
 *
 * Pelo texto, nunca por `new Date()`: o ISO do servidor vem à meia-noite UTC, e
 * o construtor a converteria para o fuso local — nascimento viraria véspera.
 */

/**
 * O par rótulo/valor de uma linha de cadastro.
 *
 * `flex: 1` no rótulo empurra o valor para a direita: `Row` só alinha na
 * vertical, quem distribui é o conteúdo.
 */
const RowLabel = styled(Body, { flex: 1 });
const RowValue = styled(Data, { fontSize: 13, color: '$foreground' });
