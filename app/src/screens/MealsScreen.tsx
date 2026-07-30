import { XStack, YStack } from '@tamagui/stacks';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { Note, Row, Section } from '../components/Card';
import { DetailScreen, usePullRefresh } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { Body, Button, Data, Display, Label } from '../components/ui';
import * as api from '../services/api.service';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Refeições — foto do prato, calorias na tela.
 *
 * O desenho é o do MUVX: a visão identifica os alimentos e estima gramas; a
 * caloria vem da tabela TACO sobre esses gramas, e o que o modelo chuta é só
 * reserva. Por isso o número aparece como FAIXA — precisão de prato fotografado
 * é ilusão, e faixa honesta vale mais que número exato inventado.
 *
 * A foto não é armazenada: sobe, é analisada e descartada.
 */
export function MealsScreen() {
  const { colors } = useTheme();
  const [meals, setMeals] = useState<api.MealRecord[] | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setMeals(await api.fetchMeals(7));
    } catch {
      setMeals([]);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const refresh = usePullRefresh(carregar);

  const analisar = async (deCamera: boolean) => {
    setAviso(null);

    // A câmera exige pedido EXPLÍCITO — `launchCameraAsync` não pergunta
    // sozinho e estoura MissingCameraPermissionException. A galeria não passa
    // por aqui: o seletor do iOS 14+ roda fora do app e dispensa permissão.
    if (deCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setAviso('Sem acesso à câmera. Conceda em Ajustes → AssumFit, ou use uma foto da galeria.');
        return;
      }
    }

    const opcoes: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      base64: true,
      // Qualidade baixa de propósito: o modelo identifica prato em imagem
      // modesta igual, e o corpo da requisição tem teto de 2 MB.
      quality: 0.35,
      allowsEditing: false,
    };
    let foto: ImagePicker.ImagePickerAsset | undefined;
    try {
      const resultado = deCamera
        ? await ImagePicker.launchCameraAsync(opcoes)
        : await ImagePicker.launchImageLibraryAsync(opcoes);
      foto = resultado.assets?.[0];
    } catch {
      setAviso('Não deu para abrir a câmera. Tente pela galeria.');
      return;
    }
    if (!foto?.base64) return;

    setAnalisando(true);
    try {
      const { record, analysis } = await api.analyzeMeal({ imageBase64: foto.base64 });
      if (!analysis.is_food) {
        setAviso('Não deu para identificar comida nesta foto. Tente outro ângulo, com mais luz.');
      } else if (record) {
        setMeals((atual) => [record, ...(atual ?? [])]);
      }
    } catch {
      setAviso('A análise falhou. Confira a conexão e tente de novo.');
    } finally {
      setAnalisando(false);
    }
  };

  const remover = async (id: string) => {
    setMeals((atual) => (atual ?? []).filter((m) => m.id !== id));
    await api.deleteMeal(id).catch(() => carregar());
  };

  const hoje = new Date().toDateString();
  const deHoje = (meals ?? []).filter((m) => new Date(m.at).toDateString() === hoje);
  const kcalMin = deHoje.reduce((s, m) => s + m.kcalMin, 0);
  const kcalMax = deHoje.reduce((s, m) => s + m.kcalMax, 0);

  return (
    <DetailScreen title="Refeições" refreshControl={refresh}>
      <YStack marginTop="$md" marginBottom="$lg">
        <Label>hoje</Label>
        <XStack alignItems="baseline" gap="$sm">
          <Display>{deHoje.length ? `${kcalMin}–${kcalMax}` : '—'}</Display>
          <Data>kcal</Data>
        </XStack>
        <Data marginTop="$xs" color="$mutedForeground">
          {deHoje.length
            ? `${deHoje.length} ${deHoje.length === 1 ? 'refeição registrada' : 'refeições registradas'}`
            : 'nenhuma refeição registrada hoje'}
        </Data>
      </YStack>

      <XStack gap="$md" marginBottom="$xl">
        <YStack flex={1}>
          <Button
            title={analisando ? 'Analisando…' : 'Fotografar prato'}
            onPress={() => void analisar(true)}
            disabled={analisando}
          />
        </YStack>
        <YStack flex={1}>
          <Button
            title="Da galeria"
            variant="secondary"
            onPress={() => void analisar(false)}
            disabled={analisando}
          />
        </YStack>
      </XStack>

      {analisando ? (
        <XStack alignItems="center" gap="$md" marginBottom="$lg">
          <ActivityIndicator size="small" color={colors.accent} />
          <Data>identificando os alimentos e consultando a tabela nutricional…</Data>
        </XStack>
      ) : null}

      {aviso ? <Note title="Não deu desta vez" body={aviso} /> : null}

      {meals === null ? (
        <YStack paddingVertical="$xl">
          <ActivityIndicator size="small" color={colors.textMuted} />
        </YStack>
      ) : meals.length === 0 && !aviso ? (
        <Note
          title="Como funciona"
          body="Fotografe o prato e o AssumFit identifica os alimentos, estima as porções e calcula a faixa de calorias pela tabela nutricional oficial (TACO). A foto é analisada e descartada — não fica guardada em lugar nenhum."
        />
      ) : (
        meals.map((meal) => (
          <YStack key={meal.id} marginBottom="$lg">
            <Section
              label={`${quando(meal.at)} · ${meal.kcalMin}–${meal.kcalMax} kcal`}
            >
              {(meal.foods as api.MealFood[]).map((food, i) => (
                <Row key={`${meal.id}-${i}`} last={i === meal.foods.length - 1}>
                  <YStack flex={1} minWidth={0} gap={2}>
                    <Body color="$foreground" numberOfLines={1}>
                      {food.name}
                      {food.uncertain ? ' (?)' : ''}
                    </Body>
                    <Data numberOfLines={1}>
                      {food.portion || (food.grams ? `${Math.round(food.grams)} g` : '')}
                      {food.matched ? ' · TACO' : ''}
                    </Data>
                  </YStack>
                  <Data color="$foreground" flexShrink={0}>
                    {food.kcal_min}–{food.kcal_max} kcal
                  </Data>
                </Row>
              ))}
            </Section>
            <Pressable
              onPress={() => void remover(meal.id)}
              accessibilityRole="button"
              accessibilityLabel="Remover refeição"
              style={({ pressed }) => [{ alignSelf: 'flex-end', paddingVertical: 6 }, pressed && { opacity: 0.5 }]}
            >
              <XStack alignItems="center" gap="$xs">
                <Icon name="x" size={12} color={colors.textMuted} />
                <Data>remover</Data>
              </XStack>
            </Pressable>
          </YStack>
        ))
      )}
    </DetailScreen>
  );
}

/** "hoje 12:40", "ter 19:15" — o suficiente para achar a refeição na lista. */
function quando(iso: string): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `hoje ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} ${hora}`;
}
