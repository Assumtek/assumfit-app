import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import { File, Paths } from 'expo-file-system';
import { useChartWidth } from '../components/charts/useChartWidth';
import { BarChart } from '../components/charts/BarChart';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, TextInput } from 'react-native';

import { Icon } from '../components/Icon';
import { VoiceInput } from '../components/VoiceInput';

import { Note, Row, Section } from '../components/List';
import { PeriodTabs, PERIODOS } from '../components/PeriodTabs';
import { DetailScreen, usePullRefresh } from '../components/DetailScreen';
import { Body, Button, Data, Display, HeroCard, Label, Pill } from '../components/ui';
import { ageFromBirthDate, calorieGoal, toMeasure, type CalorieGoal } from '../domain/nutritionGoal';
import { mensagemDaFalha } from '../domain/apiErrors';
import * as api from '../services/api.service';
import { escolherFoto, subirImagem } from '../services/foto';
import { MealReminder } from '../components/MealReminder';
import { useWorkoutStore } from '../store/workout.store';
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
  const navigation = useNavigation<any>();
  const [meals, setMeals] = useState<api.MealRecord[] | null>(null);
  /** Relatório por período (Leonardo, 22/08): 7 ou 30 dias de kcal por dia, com a meta. */
  const [periodo, setPeriodo] = useState<7 | 30>(7);
  const [larguraPeriodo, onLayoutPeriodo] = useChartWidth();
  const [analisando, setAnalisando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Registro aberto — a sub-tela de detalhe com a foto grande. */
  const [detalhe, setDetalhe] = useState<api.MealRecord | null>(null);
  /** Foto escolhida, aguardando confirmação — o preview + descrição do MUVX. */
  const [fotoPendente, setFotoPendente] = useState<{ uri: string; base64: string } | null>(null);
  /**
   * As URLs assinadas das fotos, por chave do S3.
   *
   * Em LOTE: a lista de sete dias pediria uma requisição por refeição, e a
   * tela abriria com uma sequência de espaços se preenchendo um a um.
   */
  const [urlsDeFoto, setUrlsDeFoto] = useState<Record<string, string>>({});
  /** Multiplicador de porção por índice — o "− 1x +" de cada alimento. */
  const [passos, setPassos] = useState<
    Record<number, { base: number; baseKcalMin: number; baseKcalMax: number; mult: number }>
  >({});
  /** O "adicionar alimento" em dois passos: busca na TACO → porção. */
  const [adicionando, setAdicionando] = useState<{
    q: string;
    resultados: api.TacoFood[];
    escolhido: api.TacoFood | null;
    gramas: string;
  } | null>(null);
  const buscaTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Porções e painéis são POR registro: trocar de refeição zera os dois.
  useEffect(() => {
    setPassos({});
    setAdicionando(null);
  }, [detalhe?.id]);
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
      const lista = await api.fetchMeals(30);
      setMeals(lista);
      /*
       As URLs das fotos vêm todas de uma vez, e só das que não estão em cache
       local: pedir assinatura para uma imagem que já está no disco é viagem
       perdida.
      */
      const faltando = lista
        .map((m) => m.imageKey)
        .filter((k): k is string => !!k)
        .filter((k, i, arr) => arr.indexOf(k) === i);
      if (faltando.length > 0) {
        setUrlsDeFoto(await api.urlsDasImagens(faltando));
      }
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
            // Anamnese primeiro; sem a pergunta lá (versões antigas), vale o
            // objetivo do plano ativo, que é a decisão mais recente da pessoa.
            goalAnswer:
              typeof respostas.goal === 'string'
                ? respostas.goal
                : (useWorkoutStore.getState().plan?.goal ?? rotina?.goal ?? null),
            trainDaysPerWeek: rotina?.trainDays?.length ?? null,
          }));
      } catch {
        setMeta(null);
      }
    })();
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const refresh = usePullRefresh(carregar);

  /**
   * Passo 1, escolher a foto.
   *
   * O preparo mora em `services/foto.ts` desde que o chat do personal passou a
   * aceitar imagem: a redução para 1280 px é o que garante que ela caiba no
   * corpo da requisição, e é o tipo de cuidado que diverge quando se duplica.
   * O JPEG do preview é o MESMO que a análise vê e que sobe para o S3.
   */
  const escolher = async (deCamera: boolean) => {
    setAviso(null);
    const r = await escolherFoto(deCamera);
    if (!r) return;
    if ('falha' in r) {
      setAviso(
        r.falha === 'sem-permissao'
          ? 'Sem acesso à câmera. Conceda em Ajustes, ou use uma foto da galeria.'
          : r.falha === 'camera-indisponivel'
            ? 'Não deu para abrir a câmera. Tente pela galeria.'
            : 'Não deu para preparar a foto. Tente outra.');
      return;
    }
    setFotoPendente(r.foto);
  };

  /*
   O arquivo local vem primeiro: é o cache de quem registrou neste aparelho, e
   é a ÚNICA fonte das refeições anteriores à mudança para o S3, que não têm
   chave no servidor.
  */
  const fotoDaRefeicao = (meal: api.MealRecord): string | null =>
    fotoLocalDe(meal.id) ?? (meal.imageKey ? urlsDeFoto[meal.imageKey] ?? null : null);

  const novaRefeicao = () => {
    setAviso(null);
    Alert.alert('Nova refeição', 'De onde vem a foto?', [
      { text: 'Câmera', onPress: () => void escolher(true) },
      { text: 'Galeria', onPress: () => void escolher(false) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  /** Passo 2 — confirmada a foto (e a descrição), analisar. */
  const analisarPendente = async () => {
    if (!fotoPendente) return;
    setAviso(null);
    setAnalisando(true);
    try {
      /*
       A foto sobe ANTES da análise, e a chave segue com ela: assim o registro
       nasce já apontando para a imagem, sem uma segunda requisição para
       amarrar as duas coisas.

       A subida leva um ou dois segundos contra os dez ou quinze da análise, e
       falhar nela não impede nada: a refeição é registrada sem foto.
      */
      const chave = await subirImagem(fotoPendente.uri, 'refeicao');
      const { record, analysis } = await api.analyzeMeal({
        imageBase64: fotoPendente.base64,
        description: descricao.trim() || undefined,
        ...(chave ? { imageKey: chave } : {}),
      });
      if (!analysis.is_food) {
        setAviso('Não deu para identificar comida nesta foto. Tente outro ângulo, com mais luz.');
      } else if (record) {
        try {
          new File(fotoPendente.uri).copy(new File(Paths.document, `refeicao-${record.id}.jpg`));
        } catch {
          // Sem espaço em disco o histórico fica sem foto — nunca sem registro.
        }
        setMeals((atual) => [record, ...(atual ?? [])]);
        setDescricao('');
        // Da captura direto para o registro criado: é ali que se confere o
        // resultado e se corrige na hora o que a análise errou.
        setFotoPendente(null);
        setDetalhe(record);
      }
    } catch (err) {
      setAviso(mensagemDaFalha(err, 'A análise'));
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
    } catch (err) {
      setAvisoDetalhe(mensagemDaFalha(err, 'A edição'));
    } finally {
      setSalvandoEdicao(false);
    }
  };

  /** Remove um alimento direto da linha — sem passar pelo editor. */
  const removerAlimentoEm = async (index: number) => {
    if (!detalhe) return;
    const atuais = detalhe.foods as api.MealFood[];
    if (atuais.length <= 1) {
      setAvisoDetalhe('Este é o único alimento, para tirá-lo, remova o registro inteiro.');
      return;
    }
    setAvisoDetalhe(null);
    setSalvandoEdicao(true);
    try {
      aplicarRegistro(
        await api.updateMealFoods(
          detalhe.id,
          atuais.filter((_, i) => i !== index)));
      setEditando(null);
    } catch (err) {
      setAvisoDetalhe(mensagemDaFalha(err, 'A remoção'));
    } finally {
      setSalvandoEdicao(false);
    }
  };

  /*
   O "− 1x +" de cada alimento: o multiplicador age sobre a porção que a
   análise estimou (a base fica congelada no primeiro toque). Item casado na
   TACO recalcula lá; item sem casamento escala a própria faixa aqui — a
   proporção é a única conta honesta possível sem tabela.
  */
  const mudarPorcao = async (i: number, delta: number) => {
    if (!detalhe || salvandoEdicao) return;
    const atuais = detalhe.foods as api.MealFood[];
    const food = atuais[i];
    if (!food?.grams) return;
    const passo = passos[i] ?? {
      base: food.grams,
      baseKcalMin: food.kcal_min,
      baseKcalMax: food.kcal_max,
      mult: 1,
    };
    const mult = Math.min(5, Math.max(0.5, passo.mult + delta * 0.5));
    if (mult === passo.mult) return;

    const foods = atuais.map((f, j) =>
      j === i
        ? {
            ...f,
            grams: Math.round(passo.base * mult),
            kcal_min: Math.round(passo.baseKcalMin * mult),
            kcal_max: Math.round(passo.baseKcalMax * mult),
          }
        : f);
    setAvisoDetalhe(null);
    setSalvandoEdicao(true);
    try {
      aplicarRegistro(await api.updateMealFoods(detalhe.id, foods));
      setPassos((p) => ({ ...p, [i]: { ...passo, mult } }));
    } catch (err) {
      setAvisoDetalhe(mensagemDaFalha(err, 'O ajuste da porção'));
    } finally {
      setSalvandoEdicao(false);
    }
  };

  /** Busca na TACO com um respiro de 300 ms — autocompletar, não metralhadora. */
  const buscarTaco = (texto: string) => {
    setAdicionando((a) => (a ? { ...a, q: texto } : a));
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    if (texto.trim().length < 2) {
      setAdicionando((a) => (a ? { ...a, resultados: [] } : a));
      return;
    }
    buscaTimer.current = setTimeout(() => {
      void api
        .searchFoods(texto.trim())
        .then((foods) => setAdicionando((a) => (a && a.q === texto ? { ...a, resultados: foods } : a)))
        .catch(() => {});
    }, 300);
  };

  /** O alimento escolhido entra com o NOME OFICIAL da tabela — casamento certo. */
  const adicionarDaTaco = async () => {
    if (!detalhe || !adicionando?.escolhido) return;
    const g = Number(adicionando.gramas.replace(',', '.'));
    if (!Number.isFinite(g) || g <= 0) return;
    const foods = [
      ...(detalhe.foods as api.MealFood[]),
      { name: adicionando.escolhido.description, grams: g, kcal_min: 0, kcal_max: 0, uncertain: false },
    ];
    setAvisoDetalhe(null);
    setSalvandoEdicao(true);
    try {
      aplicarRegistro(await api.updateMealFoods(detalhe.id, foods));
      setAdicionando(null);
    } catch (err) {
      setAvisoDetalhe(mensagemDaFalha(err, 'A inclusão'));
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
    const uri = fotoDaRefeicao(detalhe);
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
        setAvisoDetalhe('A reanálise não identificou comida, o registro ficou como estava.');
      }
    } catch (err) {
      setAvisoDetalhe(mensagemDaFalha(err, 'A reanálise'));
    } finally {
      setReanalisando(false);
    }
  };

  // ——— Sub-tela: o registro aberto, com a foto grande e a conta inteira. ———
  if (detalhe) {
    const fotoUri = fotoDaRefeicao(detalhe);
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
          style={{ fontSize: 16, color: colors.text, paddingVertical: 8 }}
        />
        <TextInput
          value={editando.gramas}
          onChangeText={(t) => setEditando((e) => (e ? { ...e, gramas: t } : e))}
          placeholder="Gramas (ex.: 40)"
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.accent}
          keyboardType="number-pad"
          style={{ fontSize: 16, color: colors.text, paddingVertical: 8 }}
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
            body="A foto do prato fica só no aparelho em que foi tirada, este registro veio de outro, ou a foto foi apagada."
          />
        )}

        <YStack marginTop="$lg" marginBottom="$md">
          <Label>{quando(detalhe.at)}</Label>
          <XStack alignItems="baseline" gap="$sm">
            <Display>~{Math.round((detalhe.kcalMin + detalhe.kcalMax) / 2)}</Display>
            <Data>kcal · faixa {detalhe.kcalMin}–{detalhe.kcalMax}</Data>
          </XStack>
          {m ? <MacroColunas m={m} /> : null}
        </YStack>

        <Section label="No prato">
          {(detalhe.foods as api.MealFood[]).map((food, i) => (
            <React.Fragment key={`${detalhe.id}-${i}`}>
              <Row last={i === detalhe.foods.length - 1}>
                <YStack flex={1} minWidth={0} gap={4}>
                  <Body color="$foreground" numberOfLines={2}>
                    {food.name}
                    {food.uncertain ? ' (?)' : ''}
                  </Body>
                  <Data numberOfLines={1}>
                    {food.portion || ''}
                    {food.grams ? ` · ~${Math.round(food.grams)} g` : ''}
                  </Data>
                  {food.matched ? <Data numberOfLines={1}>TACO: {food.matched}</Data> : null}
                  {food.grams ? (
                    <XStack alignItems="center" gap="$sm" marginTop={4}>
                      <BotaoDePasso
                        rotulo="−"
                        onPress={() => void mudarPorcao(i, -1)}
                        desabilitado={salvandoEdicao || (passos[i]?.mult ?? 1) <= 0.5}
                      />
                      <Data color="$foreground">
                        {String(passos[i]?.mult ?? 1).replace('.', ',')}x
                      </Data>
                      <BotaoDePasso
                        rotulo="+"
                        onPress={() => void mudarPorcao(i, +1)}
                        desabilitado={salvandoEdicao || (passos[i]?.mult ?? 1) >= 5}
                      />
                    </XStack>
                  ) : null}
                </YStack>
                <Data color="$foreground" flexShrink={0}>
                  {food.kcal_min}–{food.kcal_max} kcal
                </Data>
                {/* Lápis e lixeira NA LINHA: a ação mora ao lado do alvo. */}
                <XStack gap={4} marginLeft={8} flexShrink={0} alignItems="center">
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
                    style={({ pressed }) => [{ padding: 8 }, pressed && { opacity: 0.5 }]}
                  >
                    <Icon name="pencil" size={16} color={colors.textMuted} strokeWidth={1.5} />
                  </Pressable>
                  <Pressable
                    onPress={() => void removerAlimentoEm(i)}
                    disabled={salvandoEdicao}
                    accessibilityRole="button"
                    accessibilityLabel={`Remover ${food.name}`}
                    hitSlop={8}
                    style={({ pressed }) => [{ padding: 8 }, pressed && { opacity: 0.5 }]}
                  >
                    <Icon name="trash" size={16} color={colors.textMuted} strokeWidth={1.5} />
                  </Pressable>
                </XStack>
              </Row>
              {/* O editor abre COLADO na linha editada, não no fim da lista. */}
              {editando?.index === i ? editorDeAlimento : null}
            </React.Fragment>
          ))}
        </Section>

        {adicionando ? (
          <YStack
            marginTop="$md"
            padding="$md"
            gap="$sm"
            borderWidth={1}
            borderColor="$borderStrong"
            borderRadius={12}
          >
            {!adicionando.escolhido ? (
              <>
                <Label>Adicionar alimento</Label>
                <TextInput
                  value={adicionando.q}
                  onChangeText={buscarTaco}
                  placeholder="Busque na tabela (ex.: frango)"
                  placeholderTextColor={colors.textFaint}
                  selectionColor={colors.accent}
                  autoFocus
                  style={{ fontSize: 16, color: colors.text, paddingVertical: 8 }}
                />
                {adicionando.resultados.map((f) => (
                  <Pressable
                    key={f.description}
                    onPress={() =>
                      setAdicionando((a) => (a ? { ...a, escolhido: f, gramas: '' } : a))
                    }
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
                {adicionando.q.trim().length >= 2 && adicionando.resultados.length === 0 ? (
                  <Data color="$mutedForeground">nada na tabela com esse nome</Data>
                ) : null}
                <Button title="Cancelar" variant="ghost" onPress={() => setAdicionando(null)} />
              </>
            ) : (
              <>
                <Label>Definir a porção</Label>
                <Body color="$foreground">{adicionando.escolhido.description}</Body>
                <Data color="$mutedForeground">
                  {adicionando.escolhido.kcal_per_100g} kcal por 100 g (tabela TACO)
                </Data>
                <TextInput
                  value={adicionando.gramas}
                  onChangeText={(t) => setAdicionando((a) => (a ? { ...a, gramas: t } : a))}
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
                      title={salvandoEdicao ? 'Adicionando…' : 'Adicionar'}
                      onPress={() => void adicionarDaTaco()}
                      disabled={
                        salvandoEdicao ||
                        !(Number(adicionando.gramas.replace(',', '.')) > 0)
                      }
                    />
                  </YStack>
                  <YStack flex={1}>
                    <Button
                      title="Trocar alimento"
                      variant="ghost"
                      onPress={() =>
                        setAdicionando((a) => (a ? { ...a, escolhido: null, gramas: '' } : a))
                      }
                    />
                  </YStack>
                </XStack>
              </>
            )}
          </YStack>
        ) : !editando ? (
          <YStack alignSelf="flex-start" marginTop="$md">
            <Button
              title="Adicionar alimento"
              variant="ghost"
              onPress={() => {
                setAvisoDetalhe(null);
                setEditando(null);
                setAdicionando({ q: '', resultados: [], escolhido: null, gramas: '' });
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
              placeholder="Diga o que está errado (ex.: tem farofa, e é frango), opcional"
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

  // ——— Sub-tela: confirmar a foto — preview, descrição e o Analisar. ———
  if (fotoPendente) {
    return (
      <DetailScreen
        title="Confirmar foto"
        onBack={() => {
          if (analisando) return;
          setFotoPendente(null);
          setAviso(null);
        }}
      >
        <Image
          source={{ uri: fotoPendente.uri }}
          style={{ width: '100%', height: 300, borderRadius: 16, marginTop: 8 }}
          resizeMode="cover"
        />

        <YStack marginTop="$lg" gap="$xs">
          <Label>Descrição (opcional)</Label>
          <CampoComVoz
            valor={descricao}
            onChange={setDescricao}
            placeholder="ex.: arroz, feijão, farofa e frango grelhado"
          />
          <Data color="$mutedForeground">
            Detalhar os alimentos deixa a estimativa mais precisa, o que você citar tem
            precedência na análise.
          </Data>
        </YStack>

        {analisando ? (
          <XStack alignItems="center" gap="$md" marginTop="$lg">
            <ActivityIndicator size="small" color={colors.accent} />
            <Data>identificando os alimentos e consultando a tabela nutricional…</Data>
          </XStack>
        ) : null}

        {aviso ? <Note title="Não deu desta vez" body={aviso} /> : null}

        <YStack marginTop="$xl" gap="$md">
          <Button
            title={analisando ? 'Analisando…' : 'Analisar refeição'}
            onPress={() => void analisarPendente()}
            disabled={analisando}
          />
          <Button
            title="Trocar foto"
            variant="ghost"
            onPress={novaRefeicao}
            disabled={analisando}
          />
        </YStack>

        <Note
          title="A foto fica com você"
          body="Ela fica guardada na sua conta, junto do registro, e só você a vê. Apagar a refeição apaga a foto."
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
        <Button title="Nova refeição" onPress={novaRefeicao} />
      </YStack>

      {aviso ? <Note title="Não deu desta vez" body={aviso} /> : null}

      {/* O resumo do dia é a peça de destaque da tela — composição do resumo
          nutricional do MUVX (meta, barra, colunas de macros), na pele do
          AssumFit: halo, sombra e UM acento. */}
      <YStack marginBottom="$xl">
        <HeroCard eyebrow="Resumo de hoje">
          <XStack alignItems="baseline" gap="$sm">
            {/* O número central em destaque; a faixa vira sub-rótulo. "520–780"
                como número principal lia como imprecisão (testador, 23/08). */}
            <Display>{deHoje.length ? `~${Math.round((kcalMin + kcalMax) / 2)}` : '0'}</Display>
            <Data>{deHoje.length ? `kcal · faixa ${kcalMin}–${kcalMax}` : 'kcal'}</Data>
          </XStack>
          {meta ? (
            <YStack gap="$xs">
              <BarraDaMeta consumido={(kcalMin + kcalMax) / 2} meta={meta.goal} />
              <Data color="$mutedForeground">{metaLinha(meta, (kcalMin + kcalMax) / 2)}</Data>
            </YStack>
          ) : (
            <YStack gap="$md">
              <Data color="$mutedForeground">
                Com peso, altura e objetivo na anamnese, esta caixa ganha uma meta diária.
              </Data>
              <YStack alignSelf="flex-start">
                <Button
                  title="Responder anamnese"
                  variant="secondary"
                  size="md"
                  onPress={() => navigation.push('Anamnesis')}
                />
              </YStack>
            </YStack>
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
          body="Toque em Nova refeição, fotografe o prato, e o AssumFit identifica os alimentos, estima as porções e calcula a faixa de calorias pela tabela nutricional oficial (TACO). A foto fica guardada na sua conta, junto do registro."
        />
      ) : meals.length > 0 ? (
        <Section label="Últimas refeições">
          {meals.map((meal, i) => {
            const fotoUri = fotoDaRefeicao(meal);
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
                      style={{ width: 52, height: 52, borderRadius: 12 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <YStack
                      width={52}
                      height={52}
                      borderRadius={12}
                      backgroundColor="$card"
                      borderWidth={1}
                      borderColor="$border"
                    />
                  )}
                  <YStack flex={1} minWidth={0} gap={4}>
                    <Body color="$foreground" numberOfLines={1}>
                      {alimentos || 'Refeição'}
                    </Body>
                    <Data numberOfLines={1}>
                      {quando(meal.at)}
                      {mm ? ` · P ${mm.p} · C ${mm.c} · G ${mm.g}` : ''}
                    </Data>
                  </YStack>
                  <Data color="$foreground" flexShrink={0}>
                    ~{Math.round((meal.kcalMin + meal.kcalMax) / 2)} kcal
                  </Data>
                </Pressable>
              </Row>
            );
          })}
        </Section>
      ) : null}
      {meals && meals.length > 0 ? (
        <Section label="Por período">
          <PeriodTabs
            opcoes={[PERIODOS.semana, PERIODOS.mes]}
            valor={periodo}
            onChange={(d: number) => setPeriodo(d as 7 | 30)}
          />
          <YStack onLayout={onLayoutPeriodo}>
            {larguraPeriodo > 0 ? (
              <BarChart
                width={larguraPeriodo}
                height={140}
                max={Math.max((meta?.goal ?? 2000) * 1.15, ...kcalPorDia(meals, periodo).map((d) => d.value))}
                reference={meta ? { value: meta.goal, label: 'meta' } : undefined}
                bars={kcalPorDia(meals, periodo)}
                labelEvery={periodo === 7 ? 1 : 5}
                id="kcal-periodo"
              />
            ) : null}
          </YStack>
          <Data marginTop="$sm">{resumoDoPeriodo(meals, periodo, meta)}</Data>
        </Section>
      ) : null}

      <MealReminder />

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
    <YStack height={8} borderRadius={999} backgroundColor="$border" overflow="hidden">
      <YStack
        height={8}
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
  const pct = (kcal: number) => (cal > 0 ? `${Math.round((kcal / cal) * 100)}%` : '–');
  const colunas = [
    { rotulo: 'Proteínas', gramas: m.p, kcal: m.p * 4 },
    { rotulo: 'Carboidratos', gramas: m.c, kcal: m.c * 4 },
    { rotulo: 'Gorduras', gramas: m.g, kcal: m.g * 9 },
  ];
  return (
    <XStack justifyContent="space-between" paddingTop="$sm">
      {colunas.map((c) => (
        <YStack key={c.rotulo} alignItems="flex-start" gap={4}>
          <Label>{c.rotulo}</Label>
          <Body color="$foreground">{c.gramas} g</Body>
          <Data color="$mutedForeground">{pct(c.kcal)}</Data>
        </YStack>
      ))}
    </XStack>
  );
}

/** O − e o + do stepper de porção: quadradinho de borda, sem acento — controle. */
function BotaoDePasso({
  rotulo,
  onPress,
  desabilitado,
}: {
  rotulo: string;
  onPress: () => void;
  desabilitado?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      accessibilityRole="button"
      accessibilityLabel={rotulo === '−' ? 'Diminuir porção' : 'Aumentar porção'}
      hitSlop={6}
      style={({ pressed }) => [pressed && { opacity: 0.5 }, desabilitado ? { opacity: 0.3 } : null]}
    >
      <YStack
        width={32}
        height={32}
        borderRadius={8}
        borderWidth={1}
        borderColor="$borderStrong"
        alignItems="center"
        justifyContent="center"
      >
        <Body color="$foreground">{rotulo}</Body>
      </YStack>
    </Pressable>
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

/**
 * A foto de uma refeição.
 *
 * Desde 01/09/2026 ela vive no S3, e o que se usa é a URL assinada que a tela
 * pede em lote. O arquivo local continua sendo consultado ANTES: é o cache das
 * refeições registradas neste aparelho, e das que existiam antes da mudança,
 * que não têm chave no servidor e só existem aqui.
 */
function fotoLocalDe(id: string): string | null {
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
  // O gasto estimado e o ajuste aparecem por extenso: um testador (Leonardo,
  // 22/08) pediu o cálculo que já existia, porque a tela só mostrava a meta.
  const delta = Math.abs(meta.goal - meta.tdee);
  const ajuste =
    meta.adjustment === 'deficit' ? ` (déficit de ${delta})` : meta.adjustment === 'surplus' ? ` (superávit de ${delta})` : '';
  return `gasto estimado ~${meta.tdee} kcal · meta ~${meta.goal} ${objetivo}${ajuste}${situacao}`;
}

/** "hoje 12:40", "ter 19:15" — o suficiente para achar a refeição na lista. */
function quando(iso: string): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `hoje ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} ${hora}`;
}

/** kcal (média da faixa) por dia, do mais antigo ao de hoje; dia sem registro vale zero. */
function kcalPorDia(meals: api.MealRecord[], dias: number): { label: string; value: number }[] {
  const porDia = new Map<string, number>();
  for (const m of meals) {
    const d = new Date(m.at);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    porDia.set(chave, (porDia.get(chave) ?? 0) + (m.kcalMin + m.kcalMax) / 2);
  }
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Array.from({ length: dias }, (_, i) => {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - (dias - 1 - i));
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { label: String(d.getDate()).padStart(2, '0'), value: Math.round(porDia.get(chave) ?? 0) };
  });
}

function resumoDoPeriodo(meals: api.MealRecord[], dias: number, meta: CalorieGoal | null): string {
  const serie = kcalPorDia(meals, dias);
  const comRegistro = serie.filter((d) => d.value > 0);
  if (comRegistro.length === 0) return `Nenhuma refeição registrada nos últimos ${dias} dias.`;
  const media = Math.round(comRegistro.reduce((s, d) => s + d.value, 0) / comRegistro.length);
  const base = `${comRegistro.length} de ${dias} dias com registro · média de ~${media} kcal nos dias registrados`;
  if (!meta) return base;
  const dif = media - meta.goal;
  return `${base} · ${dif >= 0 ? `~${dif} acima` : `~${-dif} abaixo`} da meta`;
}
