import { XStack, YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import { Pressable, TextInput } from 'react-native';

import * as api from '../services/api.service';
import { useTheme } from '../theme/ThemeProvider';
import { Body, Button, Data, Label } from './ui';

/**
 * Buscar um alimento na TACO e definir a porção.
 *
 * Nasceu dentro do detalhe da refeição, como o "adicionar alimento" de um
 * registro que a foto tinha criado. Virou componente quando o registro SEM
 * foto passou a existir (Henrique, 08/09/2026): os dois fazem exatamente a
 * mesma coisa, e manter duas cópias do mesmo formulário é como elas começam a
 * divergir.
 *
 * Dois passos, na mesma caixa: escolher o alimento, depois dizer quantos
 * gramas. O segundo passo mostra o nome escolhido e a caloria por 100 g, para
 * a pessoa conferir que escolheu o que queria antes de pensar na quantidade.
 */

export type AlimentoEscolhido = { food: api.TacoFood; gramas: number };

export function SeletorDeAlimento({
  titulo,
  rotuloDaAcao,
  ocupado = false,
  onEscolher,
  onCancelar,
}: {
  titulo: string;
  rotuloDaAcao: string;
  ocupado?: boolean;
  onEscolher: (escolha: AlimentoEscolhido) => void;
  onCancelar: () => void;
}) {
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<api.TacoFood[]>([]);
  const [escolhido, setEscolhido] = useState<api.TacoFood | null>(null);
  const [gramas, setGramas] = useState('');

  const buscar = (texto: string) => {
    setQ(texto);
    if (texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    api
      .searchFoods(texto.trim())
      .then(setResultados)
      .catch(() => setResultados([]));
  };

  const g = Number(gramas.replace(',', '.'));

  return (
    <YStack
      marginTop="$md"
      padding="$md"
      gap="$sm"
      borderWidth={1}
      borderColor="$borderStrong"
      borderRadius={12}
    >
      {!escolhido ? (
        <>
          <Label>{titulo}</Label>
          <TextInput
            value={q}
            onChangeText={buscar}
            placeholder="Busque na tabela (ex.: frango)"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            autoFocus
            style={{ fontSize: 16, color: colors.text, paddingVertical: 8 }}
          />
          {resultados.map((f) => (
            <Pressable
              key={f.description}
              onPress={() => {
                setEscolhido(f);
                setGramas('');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Body color="$foreground" flex={1} numberOfLines={1}>
                {f.description}
              </Body>
              <Data flexShrink={0}>{f.kcal_per_100g} kcal/100g</Data>
            </Pressable>
          ))}
          {q.trim().length >= 2 && resultados.length === 0 ? (
            <Data color="$mutedForeground">nada na tabela com esse nome</Data>
          ) : null}
          <Button title="Cancelar" variant="ghost" onPress={onCancelar} />
        </>
      ) : (
        <>
          <Label>Definir a porção</Label>
          <Body color="$foreground">{escolhido.description}</Body>
          <Data color="$mutedForeground">
            {escolhido.kcal_per_100g} kcal por 100 g (tabela TACO)
          </Data>
          <TextInput
            value={gramas}
            onChangeText={setGramas}
            placeholder="Quantidade (gramas)"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            keyboardType="number-pad"
            autoFocus
            style={{ fontSize: 16, color: colors.text, paddingVertical: 8 }}
          />
          <XStack gap="$md" marginTop="$xs">
            <YStack flex={1}>
              <Button
                title={ocupado ? `${rotuloDaAcao}…` : rotuloDaAcao}
                onPress={() => onEscolher({ food: escolhido, gramas: g })}
                disabled={ocupado || !(g > 0)}
              />
            </YStack>
            <YStack flex={1}>
              <Button
                title="Trocar alimento"
                variant="ghost"
                onPress={() => {
                  setEscolhido(null);
                  setGramas('');
                }}
              />
            </YStack>
          </XStack>
        </>
      )}
    </YStack>
  );
}
