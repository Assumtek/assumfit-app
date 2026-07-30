import { XStack, YStack } from '@tamagui/stacks';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable } from 'react-native';

import { Note, Row, Section } from '../components/Card';
import { DetailScreen, usePullRefresh } from '../components/DetailScreen';
import { Body, Button, Data, Display, Label } from '../components/ui';
import { ageFromBirthDate, calorieGoal, toMeasure, type CalorieGoal } from '../domain/nutritionGoal';
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
 * A foto fica NO APARELHO, chaveada pelo id do registro — o mesmo desenho do
 * percurso de GPS. Para o servidor ela sobe, é analisada e morre; o que
 * persiste lá é o resultado. Remover o registro apaga a foto junto.
 *
 * A foto é REDIMENSIONADA antes de subir (lado maior 1280 px): câmera de
 * iPhone recente produz 24 MP, e o base64 disso estoura o teto do corpo da
 * requisição — foi assim que "fotografar" passava e a análise morria.
 */
export function MealsScreen() {
  const { colors } = useTheme();
  const [meals, setMeals] = useState<api.MealRecord[] | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Registro aberto — a sub-tela de detalhe com a foto grande. */
  const [detalhe, setDetalhe] = useState<api.MealRecord | null>(null);
  /** Meta diária — peso/altura/objetivo da anamnese; null = falta preencher. */
  const [meta, setMeta] = useState<CalorieGoal | null>(null);

  const carregar = useCallback(async () => {
    try {
      setMeals(await api.fetchMeals(7));
    } catch {
      setMeals([]);
    }
  }, []);

  // A meta nasce da anamnese (peso, altura, objetivo), do cadastro (idade,
  // sexo) e da rotina (dias de treino). Qualquer fonte ausente → sem meta,
  // com o convite honesto na tela — número inventado não entra.
  useEffect(() => {
    void (async () => {
      try {
        const [anamnese, perfil, rotina] = await Promise.all([
          api.fetchAnamnesis().catch(() => null),
          api.fetchProfile().catch(() => null),
          api.fetchLifestyle().catch(() => null),
        ]);
        const respostas = anamnese?.answers ?? {};
        setMeta(
          calorieGoal({
            weightKg: toMeasure(respostas.weightKg),
            heightCm: toMeasure(respostas.heightCm),
            ageYears: perfil ? ageFromBirthDate(perfil.birthDate, new Date()) : null,
            sex: perfil?.sex ?? null,
            goalAnswer: typeof respostas.goal === 'string' ? respostas.goal : null,
            trainDaysPerWeek: rotina?.trainDays?.length ?? null,
          }),
        );
      } catch {
        setMeta(null);
      }
    })();
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
      quality: 0.8,
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
    if (!foto?.uri) return;

    setAnalisando(true);
    try {
      // Encolher é obrigatório, não otimização: é o que garante que a foto
      // caiba no corpo da requisição. O JPEG que sai daqui é o MESMO que fica
      // guardado — o que você vê no histórico é o que a análise viu.
      const contexto = ImageManipulator.manipulate(foto.uri);
      if ((foto.width ?? 0) > 1280) contexto.resize({ width: 1280 });
      const renderizada = await contexto.renderAsync();
      const pronta = await renderizada.saveAsync({
        compress: 0.6,
        format: SaveFormat.JPEG,
        base64: true,
      });
      if (!pronta.base64) throw new Error('sem base64');

      const { record, analysis } = await api.analyzeMeal({ imageBase64: pronta.base64 });
      if (!analysis.is_food) {
        setAviso('Não deu para identificar comida nesta foto. Tente outro ângulo, com mais luz.');
      } else if (record) {
        try {
          new File(pronta.uri).copy(new File(Paths.document, `refeicao-${record.id}.jpg`));
        } catch {
          // Sem espaço em disco o histórico fica sem foto — nunca sem registro.
        }
        setMeals((atual) => [record, ...(atual ?? [])]);
      }
    } catch {
      setAviso('A análise falhou. Confira a conexão e tente de novo.');
    } finally {
      setAnalisando(false);
    }
  };

  const remover = (meal: api.MealRecord) => {
    Alert.alert('Remover esta refeição?', 'O registro e a foto saem do histórico.', [
      { text: 'Manter', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          setDetalhe(null);
          setMeals((atual) => (atual ?? []).filter((m) => m.id !== meal.id));
          try {
            const foto = new File(Paths.document, `refeicao-${meal.id}.jpg`);
            if (foto.exists) foto.delete();
          } catch {
            // Foto órfã no disco não justifica segurar a remoção do registro.
          }
          void api.deleteMeal(meal.id).catch(() => carregar());
        },
      },
    ]);
  };

  // ——— Sub-tela: o registro aberto, com a foto grande e a conta inteira. ———
  if (detalhe) {
    const fotoUri = fotoDe(detalhe.id);
    const m = macros(detalhe.foods as api.MealFood[]);
    return (
      <DetailScreen title="Refeição" onBack={() => setDetalhe(null)}>
        {fotoUri ? (
          <Image
            source={{ uri: fotoUri }}
            style={{ width: '100%', height: 280, borderRadius: 16, marginTop: 8 }}
            resizeMode="cover"
          />
        ) : (
          <Note
            title="Sem foto neste aparelho"
            body="A foto do prato fica só no aparelho em que foi tirada — este registro veio de outro, ou a foto foi apagada."
          />
        )}

        <YStack marginTop="$lg" marginBottom="$md">
          <Label>{quando(detalhe.at)}</Label>
          <XStack alignItems="baseline" gap="$sm">
            <Display>
              {detalhe.kcalMin}–{detalhe.kcalMax}
            </Display>
            <Data>kcal</Data>
          </XStack>
          {m ? (
            <Data marginTop="$xs" color="$mutedForeground">
              proteína {m.p} g · carboidrato {m.c} g · gordura {m.g} g
            </Data>
          ) : null}
        </YStack>

        <Section label="No prato">
          {(detalhe.foods as api.MealFood[]).map((food, i) => (
            <Row key={`${detalhe.id}-${i}`} last={i === detalhe.foods.length - 1}>
              <YStack flex={1} minWidth={0} gap={2}>
                <Body color="$foreground" numberOfLines={2}>
                  {food.name}
                  {food.uncertain ? ' (?)' : ''}
                </Body>
                <Data numberOfLines={1}>
                  {food.portion || ''}
                  {food.grams ? ` · ~${Math.round(food.grams)} g` : ''}
                </Data>
                {food.matched ? <Data numberOfLines={1}>TACO: {food.matched}</Data> : null}
              </YStack>
              <Data color="$foreground" flexShrink={0}>
                {food.kcal_min}–{food.kcal_max} kcal
              </Data>
            </Row>
          ))}
        </Section>

        <Data marginTop="$md" color="$mutedForeground">
          confiança da análise: {Math.round(detalhe.confidence * 100)}%
          {detalhe.notes ? ` · ${detalhe.notes}` : ''}
        </Data>
        <Data marginTop="$xs" color="$mutedForeground">
          (?) marca porção estimada com menos certeza. A caloria com "TACO" vem da tabela
          nutricional oficial sobre os gramas estimados; as demais são estimativa do modelo.
        </Data>

        <YStack marginTop="$xl">
          <Button title="Remover registro" variant="secondary" onPress={() => remover(detalhe)} />
        </YStack>
      </DetailScreen>
    );
  }

  const hoje = new Date().toDateString();
  const deHoje = (meals ?? []).filter((m) => new Date(m.at).toDateString() === hoje);
  const kcalMin = deHoje.reduce((s, m) => s + m.kcalMin, 0);
  const kcalMax = deHoje.reduce((s, m) => s + m.kcalMax, 0);
  const mHoje = macros(deHoje.flatMap((m) => m.foods as api.MealFood[]));

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
            ? `${deHoje.length} ${deHoje.length === 1 ? 'refeição' : 'refeições'}${
                mHoje ? ` · P ${mHoje.p} g · C ${mHoje.c} g · G ${mHoje.g} g` : ''
              }`
            : 'nenhuma refeição registrada hoje'}
        </Data>
        <Data marginTop="$xs" color="$mutedForeground">
          {meta ? metaLinha(meta, (kcalMin + kcalMax) / 2) : 'Responda peso, altura e objetivo na anamnese para ganhar uma meta diária.'}
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
          body="Fotografe o prato e o AssumFit identifica os alimentos, estima as porções e calcula a faixa de calorias pela tabela nutricional oficial (TACO). A foto fica guardada no seu aparelho, junto do registro — no servidor ela é analisada e descartada."
        />
      ) : meals.length > 0 ? (
        <Section label="Últimas refeições">
          {meals.map((meal, i) => {
            const fotoUri = fotoDe(meal.id);
            const alimentos = (meal.foods as api.MealFood[]).map((f) => f.name).join(' · ');
            return (
              <Row key={meal.id} last={i === meals.length - 1}>
                <Pressable
                  onPress={() => setDetalhe(meal)}
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir refeição de ${quando(meal.at)}`}
                  style={({ pressed }) => [
                    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  {fotoUri ? (
                    <Image
                      source={{ uri: fotoUri }}
                      style={{ width: 52, height: 52, borderRadius: 10 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <YStack
                      width={52}
                      height={52}
                      borderRadius={10}
                      backgroundColor="$card"
                      borderWidth={1}
                      borderColor="$border"
                    />
                  )}
                  <YStack flex={1} minWidth={0} gap={2}>
                    <Body color="$foreground" numberOfLines={1}>
                      {alimentos || 'Refeição'}
                    </Body>
                    <Data numberOfLines={1}>{quando(meal.at)}</Data>
                  </YStack>
                  <Data color="$foreground" flexShrink={0}>
                    {meal.kcalMin}–{meal.kcalMax} kcal
                  </Data>
                </Pressable>
              </Row>
            );
          })}
        </Section>
      ) : null}
    </DetailScreen>
  );
}

/** A foto local do registro, se existir NESTE aparelho. */
function fotoDe(id: string): string | null {
  try {
    const f = new File(Paths.document, `refeicao-${id}.jpg`);
    return f.exists ? f.uri : null;
  } catch {
    return null;
  }
}

/** Soma dos macros informados; null quando a análise não trouxe nenhum. */
function macros(foods: api.MealFood[]): { p: number; c: number; g: number } | null {
  let p = 0;
  let c = 0;
  let g = 0;
  let algum = false;
  for (const f of foods) {
    if (f.protein_g != null || f.carbs_g != null || f.fat_g != null) algum = true;
    p += f.protein_g ?? 0;
    c += f.carbs_g ?? 0;
    g += f.fat_g ?? 0;
  }
  return algum ? { p: Math.round(p), c: Math.round(c), g: Math.round(g) } : null;
}

/**
 * A meta como referência de partida, nunca prescrição: "~" na frente, e o que
 * falta (ou passou) dito em linguagem de dia a dia — sem tom de alarme, que
 * meta de calorias não é faixa clínica.
 */
function metaLinha(meta: CalorieGoal, consumidoMedio: number): string {
  const objetivo =
    meta.adjustment === 'deficit'
      ? 'para perder peso'
      : meta.adjustment === 'surplus'
        ? 'para ganhar massa'
        : 'para manter';
  const resto = Math.round(meta.goal - consumidoMedio);
  const situacao =
    consumidoMedio === 0
      ? ''
      : resto >= 0
        ? ` · restam ~${resto}`
        : ` · ~${-resto} acima`;
  return `meta ~${meta.goal} kcal ${objetivo}${situacao}`;
}

/** "hoje 12:40", "ter 19:15" — o suficiente para achar a refeição na lista. */
function quando(iso: string): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `hoje ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} ${hora}`;
}
