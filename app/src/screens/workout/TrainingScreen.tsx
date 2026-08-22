import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useMemo, useState , useRef} from 'react';
import { Alert, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  aoTocarNaIlha,
  atualizarIlhaDeEsporte,
  consumirAcoesDaIlha,
  encerrarIlhaDeEsporte,
  iniciarIlhaDeEsporte,
} from '../../../modules/widgetbridge';

import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui';
import { ExerciseVideo } from '../../components/ExerciseVideo';
import { acumularKcal, type PerfilParaEnergia } from '../../domain/workoutEnergy';
import { fetchAnamnesis } from '../../services/api.service';
import { useBiometricStore } from '../../store/biometric.store';
import { useUserStore } from '../../store/user.store';
import { formatSessionClock } from '../../domain/workout';
import type { WorkoutExercise } from '../../services/api.service';
import { elapsedSeconds, useWorkoutStore } from '../../store/workout.store';
import { useTheme } from '../../theme/ThemeProvider';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { ExerciseProblemSheet } from './ExerciseProblemSheet';
import { ExerciseSwapSheet } from './ExerciseSwapSheet';
import { PhaseBar, type PhaseProgress, type PhaseType } from './PhaseBar';
import { RestOverlay } from './RestOverlay';
import { SeriesCard } from './SeriesCard';
import { TimedExercise } from './TimedExercise';

const DEFAULT_REST_SECONDS = 60;

/**
 * Execução do treino — um exercício por vez.
 *
 * Estrutura portada do MUVX, e a decisão central dela é essa: a tela mostra UM
 * exercício, não a lista inteira. Quem está com o celular apoiado no banco não
 * quer rolar procurando onde parou; quer ver o que fazer agora, registrar, e
 * avançar. A lista completa vive no check-in, antes de começar.
 *
 * Dois relógios, e nenhum dos dois é contado — os dois derivam de instantes
 * guardados na store:
 *
 * - o da sessão, de `timerBase` mais o trecho corrente, o que permite pausar
 *   de verdade sem perder o tempo já cumprido;
 * - o do descanso, do alvo em epoch.
 *
 * Um contador incrementado a cada segundo para quando o app vai para segundo
 * plano — e uma sessão de 50 minutos apareceria como 12.
 *
 * **Não há mídia do exercício.** O MUVX mostra vídeo ou imagem aqui; o nosso
 * catálogo veio sem essas URLs de propósito — apontavam para o S3 deles. Quando
 * houver mídia própria, é neste ponto que ela entra, entre o nome e as séries.
 */
export function TrainingScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const execution = useWorkoutStore((s) => s.execution);
  const workout = useWorkoutStore((s) => s.workout);
  const progress = useWorkoutStore((s) => s.progress);
  const restEndsAt = useWorkoutStore((s) => s.restEndsAt);
  const setProgress = useWorkoutStore((s) => s.setProgress);
  const completeSet = useWorkoutStore((s) => s.completeSet);
  const swapExercise = useWorkoutStore((s) => s.swapExercise);
  const startRest = useWorkoutStore((s) => s.startRest);
  const clearRest = useWorkoutStore((s) => s.clearRest);
  const refresh = useWorkoutStore((s) => s.refresh);
  const timerBase = useWorkoutStore((s) => s.timerBase);
  const timerRunSince = useWorkoutStore((s) => s.timerRunSince);
  const toggleTimer = useWorkoutStore((s) => s.toggleTimer);
  const syncTimer = useWorkoutStore((s) => s.syncTimer);
  const cancel = useWorkoutStore((s) => s.cancel);

  const route = useRoute();
  const [index, setIndex] = useState(0);

  /*
   O exercício que o checklist pediu para abrir.

   A lista do checklist era só leitura — tocar não fazia nada, e era o que a
   pessoa tentava para trocar ou concluir. Agora ela navega para cá com o id, e
   a execução pula direto para ele. Sem isso, o toque abriria sempre o primeiro.
  */
  const pedido = (route.params as { exerciseId?: string } | undefined)?.exerciseId;
  const [swapOpen, setSwapOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /*
   Altura real do rodapé de ações, medida.

   O MUVX usa a constante 132 aqui. Copiar o número foi o erro: o rodapé de lá
   tem 132 px, o nosso tinha 162, e a barra de descanso caía em cima do botão
   "Concluir exercício". Medir vale mais que copiar — sobrevive a mudar o texto
   de um botão ou a altura de uma variante.
  */
  /*
   Zero, e não 132.

   132 era o número do MUVX copiado como valor inicial, e o CLAUDE.md já registra
   que o rodapé de lá tem 132 enquanto o nosso tem 162. Enquanto o `onLayout` não
   dispara, esse palpite colocava a barra de descanso 30 px baixo demais — em
   cima do "Concluir exercício". Zero é honesto: significa "ainda não medi", e a
   barra usa o piso da área segura até a medição chegar.
  */
  const [footerHeight, setFooterHeight] = useState(0);

  /*
   bpm e calorias DURANTE o treino (testador, 22/08). O batimento é o da
   pulseira ao vivo; a caloria é estimada por Keytel a partir dele, do peso
   (anamnese), do sexo e da idade — sem peso, só o batimento aparece. O
   acúmulo soma o gasto de cada intervalo entre leituras, com teto por
   intervalo para o app suspenso não cobrar uma hora de uma vez.
  */
  const bpmAoVivo = useBiometricStore((s) => s.latest?.heartRate ?? null);
  const sexo = useUserStore((s) => s.user.sex);
  const idade = useUserStore((s) => s.age)();
  const [pesoKg, setPesoKg] = useState<number | null>(null);
  const [kcal, setKcal] = useState(0);
  const ultimaAmostra = useRef<number | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchAnamnesis()
      .then((a) => {
        const peso = (a?.answers as { weightKg?: number } | undefined)?.weightKg;
        if (vivo && typeof peso === 'number' && peso > 0) setPesoKg(peso);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!execution || bpmAoVivo == null || pesoKg == null) return;
    const agora = Date.now();
    const anterior = ultimaAmostra.current;
    ultimaAmostra.current = agora;
    if (anterior == null) return;
    const perfil: PerfilParaEnergia = { sex: sexo, age: idade, weightKg: pesoKg };
    setKcal((acc) => acumularKcal(acc, bpmAoVivo, agora - anterior, perfil));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpmAoVivo, execution?.id, pesoKg]);

  useEffect(() => {
    if (!execution || !workout) void refresh();
  }, [execution, workout, refresh]);

  /*
   Sem sessão viva esta tela não tem o que mostrar — e ficava presa em
   "Carregando treino…" quando alguém CONCLUÍA o treino e voltava para cá
   pela seta (a execução já tinha morrido na store). A janela de 1,5 s dá
   tempo de o `refresh` reencontrar uma sessão real antes de desistir.
  */
  const focada = useIsFocused();
  useEffect(() => {
    if (!focada || execution) return;
    const id = setTimeout(() => {
      if (!useWorkoutStore.getState().execution) navigation.replace('Plan');
    }, 1500);
    return () => clearTimeout(id);
  }, [focada, execution, navigation]);

  /*
   A Dynamic Island do treino guiado (pedido da fundadora, ago/2026): a mesma
   Live Activity do esporte, com o nome do treino, o tempo correndo e o
   exercício corrente como fase. Nasce com a execução e morre com ela — a
   cleanup roda quando `execution` vira null (concluído/cancelado) ou quando a
   tela desmonta.
  */
  useEffect(() => {
    if (!execution) return;
    iniciarIlhaDeEsporte(execution.workoutName, Date.parse(execution.startedAt), {
      symbol: 'dumbbell',
    });
    return () => encerrarIlhaDeEsporte();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution?.id]);

  // Alinha o cronômetro com o início real da sessão ao montar sobre uma que já
  // existia — voltar do check-in, ou reabrir o app no meio do treino.
  useEffect(() => {
    if (execution) syncTimer(execution.startedAt);
  }, [execution, syncTimer]);

  /*
   O tique só existe para redesenhar. O tempo em si é derivado de instantes
   guardados na store, então perder um tique — em segundo plano, sob carga — não
   perde tempo nenhum: o próximo redesenho já traz o valor certo.
  */
  useEffect(() => {
    if (timerRunSince === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timerRunSince]);

  /** A lista achatada, guardando a fase de cada exercício. */
  const flat = useMemo(
    () =>
      (workout?.phases ?? []).flatMap((phase) =>
        phase.exercises.map((exercise) => ({ exercise, phase: phase.type as PhaseType })),
      ),
    [workout],
  );

  const current = flat[index];

  /*
   A fase da ilha acompanha o exercício corrente — e, no DESCANSO, vira a
   contagem regressiva com o que vem a seguir (testador, 22/08: "na pausa o
   widget deveria mostrar o tempo de descanso e o exercício"). `endsAtMs`
   é o que faz a ilha contar para trás; sem ele, volta ao relógio da sessão.
  */
  useEffect(() => {
    if (!execution || !current) return;
    const proximo = restEndsAt ? (nextUpRef.current?.nextName ?? current.exercise.name) : null;
    atualizarIlhaDeEsporte({
      startedAtMs: Date.parse(execution.startedAt),
      phase: restEndsAt ? `Descanso · a seguir: ${proximo}` : current.exercise.name,
      endsAtMs: restEndsAt ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution?.id, current?.exercise.id, restEndsAt]);
  const nextUpRef = useRef<{ nextName: string | null } | null>(null);

  /*
   Botões da ilha no treino guiado: "encerrar" abre o fim de treino. Pausa não
   existe aqui — o relógio é de parede — e a ação é DRENADA mesmo assim, para
   não ficar na fila e vazar para uma sessão de esporte futura.
  */
  useEffect(() => {
    if (!execution) return;
    const drenar = () => {
      for (const acao of consumirAcoesDaIlha()) {
        if (acao.action === 'end') navigation.navigate('TrainingFinished');
      }
    };
    const tirarCampainha = aoTocarNaIlha(drenar);
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') drenar();
    });
    return () => {
      tirarCampainha();
      assinatura.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution?.id]);

  const phases: PhaseProgress[] = useMemo(() => {
    const byType = new Map<PhaseType, PhaseProgress>();
    for (const item of flat) {
      const entry = byType.get(item.phase) ?? { type: item.phase, total: 0, completed: 0 };
      entry.total += 1;
      const sets = progress[item.exercise.id] ?? [];
      if (sets.length > 0 && sets.every((s) => s.completed)) entry.completed += 1;
      byType.set(item.phase, entry);
    }
    return [...byType.values()];
  }, [flat, progress]);

  if (!execution || !workout || !current) {
    return (
      <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center">
        <Text fontSize={15} color="$mutedForeground">
          Carregando treino…
        </Text>
      </YStack>
    );
  }

  const { exercise, phase } = current;
  const sets = progress[exercise.id] ?? [];
  const doneCount = sets.filter((s) => s.completed).length;
  const isSimple = exercise.subtype !== 'STRENGTH';

  /*
   Quantos segundos este exercício pede, quando ele é por tempo.

   `holdTime` é do alongamento e `duration` do cardio — campos diferentes
   porque significam coisas diferentes: um é quanto SUSTENTAR a posição, o
   outro é quanto DURAR a atividade. Força nunca tem nenhum dos dois.
  */
  const tempoAlvo =
    exercise.subtype === 'MOBILITY'
      ? (exercise.holdTime ?? null)
      : exercise.subtype === 'CARDIO'
        ? (exercise.duration ?? null)
        : null;
  const isLast = index === flat.length - 1;

  const inPhase = flat.filter((f) => f.phase === phase);
  const positionInPhase = inPhase.findIndex((f) => f.exercise.id === exercise.id) + 1;

  const running = timerRunSince !== null;
  const elapsedSec = elapsedSeconds(timerBase, timerRunSince, now);

  /** A primeira série não concluída. É ela que aparece expandida. */
  const activeIndex = sets.findIndex((s) => !s.completed);

  /*
   O que vem depois do descanso.

   A barra diz isso porque descansar sem saber o que vem é o que faz a pessoa
   sair do app para conferir. Se ainda há série neste exercício, é a próxima
   série; se acabou, é o próximo exercício.
  */
  const pendingSets = sets.filter((s) => !s.completed).length;
  const nextUp =
    pendingSets > 0
      ? { nextLabel: 'Próxima série', nextName: exercise.name }
      : flat[index + 1]
        ? { nextLabel: 'A seguir', nextName: flat[index + 1].exercise.name }
        : { nextLabel: null, nextName: null };
  nextUpRef.current = nextUp;

  useEffect(() => {
    if (!pedido || !workout) return;
    const todos = workout.phases.flatMap((f) => f.exercises);
    const alvo = todos.findIndex((e) => e.id === pedido);
    if (alvo >= 0) setIndex(alvo);
  }, [pedido, workout]);

  const handleToggle = async (setIndex: number) => {
    const wasCompleted = sets[setIndex]?.completed ?? false;
    await completeSet(exercise.id, setIndex);
    // Descanso só ao CONCLUIR, e não na última série do exercício — descansar
    // para depois trocar de aparelho é descanso que ninguém cumpre.
    if (!wasCompleted && setIndex < sets.length - 1) {
      const rest = exercise.sets[setIndex]?.restTime ?? DEFAULT_REST_SECONDS;
      if (rest > 0) startRest(rest);
    }
  };

  /*
   Voltar significa coisas diferentes no primeiro exercício e nos demais.

   Do segundo em diante há para onde voltar DENTRO do treino, e sair da tela
   seria perder o lugar. No primeiro não há passo anterior, e o único
   significado possível de "voltar" é desistir do check-in — que é destrutivo e
   por isso pergunta antes.
  */
  const goBack = () => {
    clearRest();
    if (index > 0) return setIndex((i) => i - 1);
    setCancelOpen(true);
  };

  const confirmCancel = async () => {
    setCancelling(true);
    try {
      await cancel();
      navigation.navigate('Plan');
    } catch {
      // Sem rede: a sessão continua viva no servidor. A pessoa fica na tela,
      // com o diálogo fechado, e pode tentar de novo — sem rejeição solta.
      Alert.alert('Não foi possível encerrar agora', 'Confira a conexão e tente de novo.');
    } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  };

  const goNext = () => {
    clearRest();
    if (isLast) return navigation.navigate('TrainingFinished');
    setIndex((i) => Math.min(flat.length - 1, i + 1));
  };

  /*
   "Concluir" num exercício POR TEMPO (alongamento, cardio com duração).

   Esses exercícios não têm cartão de séries: recebem uma série implícita no
   progresso e o botão só avançava o índice — a série ficava "não concluída",
   a barra de fases não contava o exercício e o servidor nunca recebia a
   conclusão. "Ao concluir os alongamentos não atualizou o progresso"
   (testador, 22/08). Agora concluir marca o que está pendente e então
   avança; "Pular" continua só avançando, que é a diferença entre os dois.
  */
  const concluirExercicio = async () => {
    if (tempoAlvo !== null) {
      for (let i = 0; i < sets.length; i++) {
        if (!sets[i]?.completed) await completeSet(exercise.id, i);
      }
    }
    goNext();
  };

  return (
    <YStack flex={1} backgroundColor="$background">
      {/* Cabeçalho próprio: os controles são pílulas circulares, não ícones
          soltos — é o que os separa do conteúdo como alvos de toque. */}
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="$xl"
        paddingTop={insets.top + 8}
        paddingBottom="$sm"
      >
        <ControlButton label="Voltar" onPress={goBack}>
          <Icon name="back" size={20} color={colors.text} />
        </ControlButton>

        <XStack alignItems="center" gap="$md">
          <ControlButton
            label="Checklist do treino"
            onPress={() => (navigation as any).push('Checklist')}
          >
            <Icon name="checklist" size={20} color={colors.text} />
          </ControlButton>

          <ControlButton
            label={running ? 'Pausar cronômetro' : 'Retomar cronômetro'}
            onPress={toggleTimer}
          >
            <Icon name={running ? 'pause' : 'play'} size={20} color={colors.text} />
          </ControlButton>

          <XStack
            alignItems="center"
            gap="$xs"
            backgroundColor="$control"
            borderRadius={14}
            paddingHorizontal="$lg"
            paddingVertical="$md"
          >
            <Icon name="clock" size={16} color={colors.text} />
            <Text
              fontSize={15}
              fontWeight="500"
              color="$foreground"
              // Dígitos tabulares: sem eles a largura muda a cada segundo e o
              // cronômetro treme dentro da pílula.
              fontVariant={['tabular-nums']}
            >
              {formatSessionClock(elapsedSec)}
            </Text>
          </XStack>
          {bpmAoVivo != null ? (
            <XStack
              alignItems="center"
              gap={6}
              borderRadius={999}
              borderWidth={1}
              borderColor="$border"
              paddingHorizontal="$md"
              paddingVertical="$md"
            >
              <Icon name="heart" size={16} color={colors.text} />
              <Text fontSize={15} fontWeight="500" color="$foreground" fontVariant={['tabular-nums']}>
                {bpmAoVivo}
              </Text>
              {pesoKg != null ? (
                <Text fontSize={13} color="$mutedForeground" fontVariant={['tabular-nums']}>
                  · {Math.round(kcal)} kcal
                </Text>
              ) : null}
            </XStack>
          ) : null}
        </XStack>
      </XStack>

      <PhaseBar
        current={phase}
        positionInPhase={positionInPhase}
        phaseTotal={inPhase.length}
        phases={phases}
      />

      <YStack height={1} backgroundColor="$border" marginTop="$md" />

      {/*
        O TECLADO cobria o campo de carga.

        A tela tinha `keyboardShouldPersistTaps` — que resolve o toque atravessar
        o teclado — e nada que EMPURRASSE o conteúdo. Registrar carga é digitar,
        e o campo fica na parte de baixo da série: o teclado subia por cima
        justamente do que se estava preenchendo. Relatado em ago/2026.

        `padding` no iOS e `height` no Android é o par que o React Native pede;
        o deslocamento é zero porque a tela já começa colada no topo.
      */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 8,
          // Espaço para o rodapé fixo e para a barra de descanso não cobrirem
          // a última série. Segue a medição, não um número escolhido a olho.
          paddingBottom: footerHeight + 96,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/*
          Exercício por TEMPO desenha outra coisa inteira.

          Alongamento e mobilidade não têm carga nem repetição para registrar —
          têm uma duração a cumprir. Mostrá-los com o cartão de séries obriga a
          inventar "peso 0, reps 0", que é o que fazia o alongamento parecer um
          exercício de força mal preenchido.

          Cardio entra aqui quando vem com duração prescrita; sem ela, cai no
          cartão de séries, que é onde distância e intensidade são registradas.
        */}
        {/* O vídeo de como fazer, acima de tudo — vale para força e por tempo. */}
        <ExerciseVideo videoUrl={exercise.videoUrl ?? null} thumbnailUrl={exercise.thumbnailUrl ?? null} />

        {tempoAlvo !== null ? (
          <TimedExercise
            name={exercise.name}
            seconds={tempoAlvo}
            description={exercise.description ?? exercise.notes}
            phase={phase}
          />
        ) : (
        <>
        {/* O exercício é centralizado — é a única coisa na tela, e centralizar
            é o que o marca como foco em vez de item de lista. */}
        <Text
          fontSize={20}
          fontWeight="500"
          color="$foreground"
          textAlign="center"
          marginTop="$xl"
        >
          {exercise.name}
        </Text>

        <Text fontSize={13} color="$mutedForeground" textAlign="center" marginTop="$md">
          {infoLine(exercise, sets.length)}
        </Text>

        {exercise.description ? (
          <Text fontSize={13} color="$mutedForeground" textAlign="center" marginTop="$xl">
            {exercise.description}
          </Text>
        ) : null}

        {exercise.notes ? (
          <Text fontSize={13} color="$mutedForeground" textAlign="center" marginTop="$md">
            {exercise.notes}
          </Text>
        ) : null}

        <YStack marginTop="$xxl">
          <XStack alignItems="center" justifyContent="space-between" marginBottom="$md">
            <Text fontSize={15} fontWeight="500" color="$foreground">
              Séries ({doneCount}/{sets.length})
            </Text>
            <XStack gap="$sm">
              <AcaoDoExercicio icone="swap" rotulo="Trocar" onPress={() => setSwapOpen(true)} />
              <AcaoDoExercicio
                icone="flag"
                rotulo="Sinalizar"
                onPress={() => setProblemOpen(true)}
              />
            </XStack>
          </XStack>

          {sets.map((set, i) => (
            <SeriesCard
              key={i}
              number={i + 1}
              prescribedReps={
                exercise.sets[i]?.repetitions ?? exercise.sets[0]?.repetitions ?? '—'
              }
              state={set}
              isActive={i === activeIndex}
              simple={isSimple}
              isCardio={exercise.subtype === 'CARDIO'}
              onChange={(patch) => setProgress(exercise.id, i, patch)}
              onToggle={() => void handleToggle(i)}
              onSkip={() => void handleToggle(i)}
            />
          ))}
        </YStack>
        </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {/*
        O rodapé de ações vale para TODO exercício (decisão da fundadora,
        ago/2026): o alongamento também conclui, pula e finaliza por aqui. O
        exercício por tempo ficou só com o relógio — os botões de ação que ele
        tinha dentro saíram, para não haver dois conjuntos na mesma tela.
      */}
      <YStack
        paddingHorizontal="$xl"
        paddingTop="$md"
        paddingBottom={insets.bottom + 14}
        backgroundColor="$background"
        onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
      >
        <YStack
          backgroundColor="$card"
          borderWidth={1}
          borderColor="$border"
          borderRadius={16}
          padding="$sm"
          gap="$sm"
        >
          <Button
            title={isLast ? 'Concluir treino' : 'Concluir exercício'}
            icon={<Icon name="check" size={16} color={colors.ink} />}
            onPress={() => void concluirExercicio()}
          />
          <XStack gap="$sm">
            <YStack flex={1}>
              <Button
                title="Pular exercício"
                variant="ghost"
                size="md"
                icon={<Icon name="skip" size={14} color={colors.textMuted} />}
                onPress={goNext}
              />
            </YStack>
            {!isLast ? (
              <YStack flex={1}>
                <Button
                  title="Finalizar"
                  variant="ghost"
                  size="md"
                  onPress={() => navigation.navigate('TrainingFinished')}
                />
              </YStack>
            ) : null}
          </XStack>
        </YStack>
      </YStack>

      {restEndsAt ? (
        <RestOverlay
          endsAt={restEndsAt}
          onSkip={clearRest}
          footerHeight={Math.max(footerHeight, insets.bottom + 72)}
          {...nextUp}
        />
      ) : null}

      {swapOpen ? (
        <ExerciseSwapSheet
          exercise={exercise}
          onClose={() => setSwapOpen(false)}
          /*
           `onPick` era opcional e ninguém passava: a pessoa escolhia o
           substituto, a folha fechava e o treino seguia com o mesmo exercício.
           A troca vale só para esta sessão — o plano não muda.
          */
          onPick={(substituto) => swapExercise(exercise.id, substituto)}
        />
      ) : null}

      <ExerciseProblemSheet
        open={problemOpen}
        onClose={() => setProblemOpen(false)}
        onTrocar={() => {
          setProblemOpen(false);
          setSwapOpen(true);
        }}
        onPular={() => {
          setProblemOpen(false);
          goNext();
        }}
      />

      <ConfirmDialog
        open={cancelOpen}
        title="Tem certeza que deseja cancelar seu check-in?"
        body="Você poderá fazer o check-in novamente neste treino ou em outro."
        confirmLabel="Sim, cancelar check-in"
        cancelLabel="Não, voltar ao exercício"
        loading={cancelling}
        onConfirm={() => void confirmCancel()}
        onCancel={() => setCancelOpen(false)}
      />
    </YStack>
  );
}

function ControlButton({
  children,
  onPress,
  label,
}: {
  children: React.ReactNode;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <YStack backgroundColor="$control" borderRadius={999} padding="$md">
        {children}
      </YStack>
    </Pressable>
  );
}

/** "3 séries · 10-12 reps · 90s descanso", adaptado por fase. */
function infoLine(exercise: WorkoutExercise, setCount: number): string {
  if (exercise.subtype === 'CARDIO') {
    return [exercise.duration ? `${exercise.duration} min` : null, exercise.intensity]
      .filter(Boolean)
      .join(' · ');
  }
  if (exercise.subtype === 'MOBILITY') {
    return exercise.holdTime
      ? `${exercise.holdTime}s por posição`
      : (exercise.sets[0]?.repetitions ?? 'mobilidade');
  }

  const parts: string[] = [];
  if (setCount > 0) parts.push(`${setCount} ${setCount === 1 ? 'série' : 'séries'}`);
  const reps = exercise.sets[0]?.repetitions;
  if (reps) parts.push(`${reps} reps`);
  const rest = exercise.sets[0]?.restTime;
  if (rest) parts.push(`${rest}s descanso`);
  return parts.join(' · ');
}

/**
 * Ação sobre o exercício atual — trocar, sinalizar problema.
 *
 * Pílula contornada e acromática: são ações sobre o conteúdo, e o acento
 * pertence ao dado. Viraram componente quando passaram de uma para duas, que é
 * onde duas cópias começam a divergir em padding.
 */
function AcaoDoExercicio({
  icone,
  rotulo,
  onPress,
}: {
  icone: 'swap' | 'flag';
  rotulo: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={rotulo}>
      <XStack
        alignItems="center"
        gap="$sm"
        paddingHorizontal="$md"
        paddingVertical={10}
        borderRadius={999}
        borderWidth={1}
        borderColor="$border"
      >
        <Icon name={icone} size={14} color={colors.textMuted} />
        <Text fontSize={13} fontWeight="500" color="$mutedForeground">
          {rotulo}
        </Text>
      </XStack>
    </Pressable>
  );
}
