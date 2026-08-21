import { XStack, YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import { TextInput } from 'react-native';

import { isValidBirthDate, maskBirthDate, toIsoBirthDate } from '../domain/birthDate';
import { useTheme } from '../theme/ThemeProvider';
import { Body, Button, Data, SectionTitle } from './ui';
import { Sheet } from './ui/Dialog';

/**
 * Um intervalo de datas escolhido à mão — "de tal dia a tal dia".
 *
 * Pedido de um testador (ago/2026): filtrar o progresso por um período que não
 * seja 7/30/90 dias. Duas datas DIGITADAS, com a mesma máscara e validação da
 * data de nascimento, em vez de um calendário novo: o vocabulário já existe no
 * app, e digitar duas datas é mais rápido do que rolar dois meses.
 */
export function RangeSheet({
  open,
  onClose,
  onApply,
  inicial,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (janela: { from: string; to: string }) => void;
  inicial?: { from: string; to: string } | null;
}) {
  const { colors } = useTheme();
  const br = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '');
  const [de, setDe] = useState(br(inicial?.from));
  const [ate, setAte] = useState(br(inicial?.to));

  const deIso = isValidBirthDate(de) ? toIsoBirthDate(de) : null;
  const ateIso = isValidBirthDate(ate) ? toIsoBirthDate(ate) : null;
  const invertido = !!deIso && !!ateIso && ateIso < deIso;
  const pronto = !!deIso && !!ateIso && !invertido;

  const campo = (valor: string, setar: (v: string) => void, rotulo: string) => (
    <YStack flex={1} gap="$xs">
      <Data>{rotulo}</Data>
      <TextInput
        value={valor}
        onChangeText={(t) => setar(maskBirthDate(t))}
        placeholder="DD/MM/AAAA"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        maxLength={10}
        accessibilityLabel={rotulo}
        style={{
          fontSize: 18,
          fontVariant: ['tabular-nums'],
          color: colors.text,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.hairlineStrong,
        }}
      />
    </YStack>
  );

  return (
    <Sheet open={open} onClose={onClose}>
      <YStack gap="$xs">
        <SectionTitle fontSize={18}>Período personalizado</SectionTitle>
        <Body>Os dois dias entram no período.</Body>
      </YStack>
      <XStack gap="$lg">
        {campo(de, setDe, 'de')}
        {campo(ate, setAte, 'até')}
      </XStack>
      {invertido ? <Data color="$destructive">O fim precisa vir depois do começo.</Data> : null}
      <Button
        title="Aplicar período"
        disabled={!pronto}
        onPress={() => {
          if (deIso && ateIso) onApply({ from: deIso, to: ateIso });
          onClose();
        }}
      />
    </Sheet>
  );
}
