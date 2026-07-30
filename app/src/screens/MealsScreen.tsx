import { XStack, YStack } from '@tamagui/stacks';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, TextInput } from 'react-native';

import { Icon } from '../components/Icon';
import { VoiceInput } from '../components/VoiceInput';

import { Note, Row, Section } from '../components/Card';
import { DetailScreen, usePullRefresh } from '../components/DetailScreen';
import { Body, Button, Data, Display, HeroCard, Label } from '../components/ui';
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
  /** A sub-tela de captura — foto, galeria e descrição atrás de um botão só. */
  const [criando, setCriando] = useState(false);
  /** O que a pessoa diz que tem no prato — entra na análise com precedência. */
  const [descricao, setDescricao] = useState('');
  /** Alimento em edição no detalhe; index -1 = novo. */
  const [editando, setEditando] = useState<{ index: number; nome: string; gramas: string } | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [obsReanalise, setObsReanalise] = useState('');
  const [reanalisando, setReanalisando] = useState(false);
  const [avisoDetalhe, setAvisoDetalhe] = useState<string | null>(null);
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

      const { record, analysis } = await api.analyzeMeal({
        imageBase64: pronta.base64,
        description: descricao.trim() || undefined,
      });
      if (!analysis.is_food) {
        setAviso('Não deu para identificar comida nesta foto. Tente outro ângulo, com mais luz.');
      } else if (record) {
        try {
          new File(pronta.uri).copy(new File(Paths.document, `refeicao-${record.id}.jpg`));
        } catch {
          // Sem espaço em disco o histórico fica sem foto — nunca sem registro.
        }
        setMeals((atual) => [record, ...(atual ?? [])]);
        setDescricao('');
        // Da captura direto para o registro criado: é ali que se confere o
        // resultado e se corrige na hora o que a análise errou.
        setCriando(false);
        setDetalhe(record);
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

  /** Registro atualizado volta para a lista E para o detalhe aberto. */
  const aplicarRegistro = (record: api.MealRecord) => {
    setMeals((atual) => (atual ?? []).map((m) => (m.id === record.id ? record : m)));
    setDetalhe(record);
  };

  /*
   A calibração que nenhum modelo dispensa: renomear, ajustar gramas, remover
   e acrescentar. O recálculo é da TACO, no servidor — item editado sobe com
   kcal zerada de propósito, para a tabela decidir; item intocado carrega os
   números que já tinha.
  */
  const salvarEdicao = async () => {
    if (!detalhe || !editando) return;
    const nome = editando.nome.trim();
    if (!nome) return;
    const g = Number(editando.gramas.replace(',', '.'));
    const editado = {
      name: nome,
      grams: Number.isFinite(g) && g > 0 ? g : null,
      kcal_min: 0,
      kcal_max: 0,
      uncertain: false,
    };
    const atuais = detalhe.foods as api.MealFood[];
    const foods =
      editando.index < 0
        ? [...atuais, editado]
        : atuais.map((f, i) => (i === editando.index ? { ...editado, portion: f.portion } : f));

    setAvisoDetalhe(null);
    setSalvandoEdicao(true);
    try {
      aplicarRegistro(await api.updateMealFoods(detalhe.id, foods));
      setEditando(null);
    } catch {
      setAvisoDetalhe('Não deu para salvar a edição. Confira a conexão e tente de novo.');
    } finally {
      setSalvandoEdicao(false);
    }
  };

  /** Remove um alimento direto da linha — sem passar pelo editor. */
  const removerAlimentoEm = async (index: number) => {
    if (!detalhe) return;
    const atuais = detalhe.foods as api.MealFood[];
    if (atuais.length <= 1) {
      setAvisoDetalhe('Este é o único alimento — para tirá-lo, remova o registro inteiro.');
      return;
    }
    setAvisoDetalhe(null);
    setSalvandoEdicao(true);
    try {
      aplicarRegistro(
        await api.updateMealFoods(
          detalhe.id,
          atuais.filter((_, i) => i !== index),
        ),
      );
      setEditando(null);
    } catch {
      setAvisoDetalhe('Não deu para remover. Confira a conexão e tente de novo.');
    } finally {
      setSalvandoEdicao(false);
    }
  };

  /*
   Reanalisar usa a foto que mora no aparelho MAIS a observação da pessoa
   ("tem farofa, e é frango") — que o modelo trata com precedência. O registro
   é atualizado no lugar; id e horário ficam, e a foto continua valendo.
  */
  const reanalisar = async () => {
    if (!detalhe) return;
    const uri = fotoDe(detalhe.id);
    if (!uri) return;
    setAvisoDetalhe(null);
    setReanalisando(true);
    try {
      const b64 = await new File(uri).base64();
      const { record, analysis } = await api.reanalyzeMeal(detalhe.id, {
        imageBase64: b64,
        description: obsReanalise.trim() || undefined,
      });
      if (record) {
        aplicarRegistro(record);
        setObsReanalise('');
        setEditando(null);
      } else if (!analysis.is_food) {
        setAvisoDetalhe('A reanálise não identificou comida — o registro ficou como estava.');
      }
    } catch {
      setAvisoDetalhe('A reanálise falhou. Confira a conexão e tente de novo.');
    } finally {
      setReanalisando(false);
    }
  };

  // ——— Sub-tela: o registro aberto, com a foto grande e a conta inteira. ———
  if (detalhe) {
    const fotoUri = fotoDe(detalhe.id);
    const m = macros(detalhe.foods as api.MealFood[]);

    // Variável JSX, NÃO componente aninhado: componente definido aqui dentro
    // remonta a cada render e o teclado fecharia a cada tecla digitada.
    const editorDeAlimento = editando ? (
      <YStack
        marginVertical="$sm"
        padding="$md"
        gap="$sm"
        borderWidth={1}
        borderColor="$borderStrong"
        borderRadius={12}
      >
        <Label>{editando.index < 0 ? 'Novo alimento' : 'Corrigir alimento'}</Label>
        <TextInput
          value={editando.nome}
          onChangeText={(t) => setEditando((e) => (e ? { ...e, nome: t } : e))}
          placeholder="Nome (ex.: Farofa)"
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.accent}
          style={{ fontSize: 15, color: colors.text, paddingVertical: 6 }}
        />
        <TextInput
          value={editando.gramas}
          onChangeText={(t) => setEditando((e) => (e ? { ...e, gramas: t } : e))}
          placeholder="Gramas (ex.: 40)"
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.accent}
          keyboardType="number-pad"
          style={{ fontSize: 15, color: colors.text, paddingVertical: 6 }}
        />
        <Data color="$mutedForeground">
          A caloria recalcula pela tabela TACO a partir do nome e dos gramas.
        </Data>
        <XStack gap="$md" marginTop="$xs">
          <YStack flex={1}>
            <Button
              title={salvandoEdicao ? 'Salvando…' : 'Salvar'}
              onPress={() => void salvarEdicao()}
              disabled={salvandoEdicao || !editando.nome.trim()}
            />
          </YStack>
          <YStack flex={1}>
            <Button title="Cancelar" variant="ghost" onPress={() => setEditando(null)} />
          </YStack>
        </XStack>
      </YStack>
    ) : null;
    return (
      <DetailScreen
        title="Refeição"
        onBack={() => {
          setDetalhe(null);
          setEditando(null);
          setAvisoDetalhe(null);
          setObsReanalise('');
        }}
      >
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
          {m ? <MacroColunas m={m} /> : null}
        </YStack>

        <Section label="No prato">
          {(detalhe.foods as api.MealFood[]).map((food, i) => (
            <React.Fragment key={`${detalhe.id}-${i}`}>
              <Row last={i === detalhe.foods.length - 1}>
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
                {/* Lápis e lixeira NA LINHA: a ação mora ao lado do alvo. */}
                <XStack gap={2} marginLeft={8} flexShrink={0} alignItems="center">
                  <Pressable
                    onPress={() => {
                      setAvisoDetalhe(null);
                      setEditando({
                        index: i,
                        nome: food.name,
                        gramas: food.grams ? String(Math.round(food.grams)) : '',
                      });
                    }}
                    disabled={salvandoEdicao}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar ${food.name}`}
                    hitSlop={8}
                    style={({ pressed }) => [{ padding: 6 }, pressed && { opacity: 0.5 }]}
                  >
                    <Icon name="pencil" size={15} color={colors.textMuted} strokeWidth={1.5} />
                  </Pressable>
                  <Pressable
                    onPress={() => void removerAlimentoEm(i)}
                    disabled={salvandoEdicao}
                    accessibilityRole="button"
                    accessibilityLabel={`Remover ${food.name}`}
                    hitSlop={8}
                    style={({ pressed }) => [{ padding: 6 }, pressed && { opacity: 0.5 }]}
                  >
                    <Icon name="trash" size={15} color={colors.textMuted} strokeWidth={1.5} />
                  </Pressable>
                </XStack>
              </Row>
              {/* O editor abre COLADO na linha editada, não no fim da lista. */}
              {editando?.index === i ? editorDeAlimento : null}
            </React.Fragment>
          ))}
        </Section>

        {editando && editando.index < 0 ? editorDeAlimento : null}
        {!editando ? (
          <YStack alignSelf="flex-start" marginTop="$md">
            <Button
              title="Adicionar alimento"
              variant="ghost"
              onPress={() => {
                setAvisoDetalhe(null);
                setEditando({ index: -1, nome: '', gramas: '' });
              }}
            />
          </YStack>
        ) : null}

        <Data marginTop="$md" color="$mutedForeground">
          confiança da análise: {Math.round(detalhe.confidence * 100)}%
          {detalhe.notes ? ` · ${detalhe.notes}` : ''}
        </Data>
        <Data marginTop="$xs" color="$mutedForeground">
          (?) marca porção estimada com menos certeza. A caloria com "TACO" vem da tabela
          nutricional oficial sobre os gramas estimados; as demais são estimativa do modelo.
        </Data>

        {avisoDetalhe ? <Note title="Não deu desta vez" body={avisoDetalhe} /> : null}

        {fotoUri ? (
          <YStack marginTop="$xl" gap="$sm">
            <Label>A análise errou?</Label>
            <CampoComVoz
              valor={obsReanalise}
              onChange={setObsReanalise}
              placeholder="Diga o que está errado (ex.: tem farofa, e é frango) — opcional"
            />
            <Button
              title={reanalisando ? 'Reanalisando…' : 'Reanalisar com a foto'}
              variant="secondary"
              onPress={() => void reanalisar()}
              disabled={reanalisando}
            />
          </YStack>
        ) : null}

        <YStack marginTop="$xl">
          <Button title="Remover registro" variant="secondary" onPress={() => remover(detalhe)} />
        </YStack>
      </DetailScreen>
    );
  }

  // ——— Sub-tela: nova refeição — foto, galeria e a descrição num lugar só. ———
  if (criando) {
    return (
      <DetailScreen
        title="Nova refeição"
        onBack={() => {
          setCriando(false);
          setAviso(null);
        }}
      >
        <Body marginTop="$md" marginBottom="$lg" maxWidth="92%">
          Fotografe o prato e o AssumFit identifica os alimentos, estima as porções e calcula a
          faixa de calorias pela tabela nutricional oficial (TACO).
        </Body>

        <YStack marginBottom="$md">
          <CampoComVoz
            valor={descricao}
            onChange={setDescricao}
            placeholder="O que tem no prato? (opcional — melhora a análise)"
          />
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

        <Note
          title="A foto fica com você"
          body="Ela é guardada só neste aparelho, junto do registro. No servidor é analisada e descartada."
        />
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
      {/* A ação principal vem antes do resumo: registrar é o gesto repetido
          do dia; o resumo é consequência. À direita, a pedido — polegar. */}
      <YStack alignSelf="flex-end" marginTop="$md" marginBottom="$lg">
        <Button
          title="Nova refeição"
          onPress={() => {
            setAviso(null);
            setCriando(true);
          }}
        />
      </YStack>

      {/* O resumo do dia é a peça de destaque da tela — composição do resumo
          nutricional do MUVX (meta, barra, colunas de macros), na pele do
          AssumFit: halo, sombra e UM acento. */}
      <YStack marginBottom="$xl">
        <HeroCard eyebrow="Resumo de hoje">
          <XStack alignItems="baseline" gap="$sm">
            <Display>{deHoje.length ? `${kcalMin}–${kcalMax}` : '—'}</Display>
            <Data>kcal</Data>
          </XStack>
          {meta ? (
            <YStack gap="$xs">
              <BarraDaMeta consumido={(kcalMin + kcalMax) / 2} meta={meta.goal} />
              <Data color="$mutedForeground">{metaLinha(meta, (kcalMin + kcalMax) / 2)}</Data>
            </YStack>
          ) : (
            <Data color="$mutedForeground">
              Responda peso, altura e objetivo na anamnese para ganhar uma meta diária.
            </Data>
          )}
          {mHoje ? <MacroColunas m={mHoje} /> : null}
          <Data color="$mutedForeground">
            {deHoje.length
              ? `${deHoje.length} ${deHoje.length === 1 ? 'refeição registrada' : 'refeições registradas'}`
              : 'nenhuma refeição registrada hoje'}
          </Data>
        </HeroCard>
      </YStack>

      {meals === null ? (
        <YStack paddingVertical="$xl">
          <ActivityIndicator size="small" color={colors.textMuted} />
        </YStack>
      ) : meals.length === 0 ? (
        <Note
          title="Como funciona"
          body="Toque em Nova refeição, fotografe o prato, e o AssumFit identifica os alimentos, estima as porções e calcula a faixa de calorias pela tabela nutricional oficial (TACO). A foto fica guardada no seu aparelho, junto do registro."
        />
      ) : meals.length > 0 ? (
        <Section label="Últimas refeições">
          {meals.map((meal, i) => {
            const fotoUri = fotoDe(meal.id);
            const alimentos = (meal.foods as api.MealFood[]).map((f) => f.name).join(' · ');
            const mm = macros(meal.foods as api.MealFood[]);
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
                    <Data numberOfLines={1}>
                      {quando(meal.at)}
                      {mm ? ` · P ${mm.p} · C ${mm.c} · G ${mm.g}` : ''}
                    </Data>
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

/**
 * A barra da meta — o quanto do dia já foi consumido, no acento. Passou da
 * meta, ela para cheia e o TEXTO diz o quanto passou: meta de caloria não é
 * faixa clínica, e pintar de alerta viraria bronca.
 */
function BarraDaMeta({ consumido, meta }: { consumido: number; meta: number }) {
  const fracao = meta > 0 ? Math.min(1, consumido / meta) : 0;
  return (
    <YStack height={6} borderRadius={999} backgroundColor="$border" overflow="hidden">
      <YStack
        height={6}
        borderRadius={999}
        backgroundColor="$primary"
        width={`${Math.round(fracao * 100)}%`}
      />
    </YStack>
  );
}

/**
 * As três colunas de macros do resumo do MUVX — gramas em cima, participação
 * calórica embaixo (P e C valem 4 kcal/g; G vale 9). Sem cor por macro: aqui
 * o acento é um só, e a hierarquia é de peso e escala.
 */
function MacroColunas({ m }: { m: { p: number; c: number; g: number } }) {
  const cal = m.p * 4 + m.c * 4 + m.g * 9;
  const pct = (kcal: number) => (cal > 0 ? `${Math.round((kcal / cal) * 100)}%` : '—');
  const colunas = [
    { rotulo: 'Proteínas', gramas: m.p, kcal: m.p * 4 },
    { rotulo: 'Carboidratos', gramas: m.c, kcal: m.c * 4 },
    { rotulo: 'Gorduras', gramas: m.g, kcal: m.g * 9 },
  ];
  return (
    <XStack justifyContent="space-between" paddingTop="$sm">
      {colunas.map((c) => (
        <YStack key={c.rotulo} alignItems="flex-start" gap={2}>
          <Label>{c.rotulo}</Label>
          <Body color="$foreground">{c.gramas} g</Body>
          <Data color="$mutedForeground">{pct(c.kcal)}</Data>
        </YStack>
      ))}
    </XStack>
  );
}

/** Campo de texto com ditado — o transcrito entra para revisão, nunca direto. */
function CampoComVoz({
  valor,
  onChange,
  placeholder,
}: {
  valor: string;
  onChange: (t: string) => void;
  placeholder: string;
}) {
  const { colors } = useTheme();
  return (
    <XStack
      alignItems="center"
      gap="$sm"
      borderWidth={1}
      borderColor="$borderStrong"
      borderRadius={12}
      paddingHorizontal={12}
      paddingVertical={Platform.OS === 'ios' ? 8 : 2}
    >
      <YStack flex={1}>
        <TextInput
          value={valor}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.accent}
          multiline
          maxLength={300}
          style={{ fontSize: 14, color: colors.text, maxHeight: 80 }}
        />
      </YStack>
      <VoiceInput onTranscript={(t) => onChange(valor ? `${valor} ${t}` : t)} />
    </XStack>
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
