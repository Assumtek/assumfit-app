import { useNavigation } from '@react-navigation/native';
import { YStack } from '@tamagui/stacks';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Note } from '../../components/Card';
import { DetailScreen, usePullRefresh } from '../../components/DetailScreen';
import { Icon } from '../../components/Icon';
import { TrainingPanel } from '../../components/TrainingPanel';
import { WeekRail } from '../../components/WeekRail';
import { Body, Button, Data, Headline } from '../../components/ui';
import { QuickMenu } from './QuickMenu';
import { movementMinutes } from '../../domain/movement';
import { montarSemanaDeTreino, type DiaDeTreino } from '../../domain/trainingWeek';
import { DAY_LABEL, isSportDay, modalityMeta, workoutMeta } from '../../domain/workout';
import * as api from '../../services/api.service';
import { useWorkoutStore } from '../../store/workout.store';
import { darkPalette } from '../../theme/palette';

/**
 * TREINO — a tela do plano.
 *
 * ── CONTRATO DA DIREÇÃO ──────────────────────────────────────────────────────
 * THESIS: Treino e Esporte não são duas telas, são UM instrumento em quatro
 * estados (plano, check-in, sessão ao vivo, leitura). Recusa o padrão da
 * categoria — pilha de cartões de mesmo tamanho sob títulos de seção — e o
 * template "número grande + rótulo + estatísticas de apoio".
 * OWN-WORLD: fixo, do manual de marca — fundo `#0E0A22`/`#ECE7F4`, um acento
 * `#877BF0` que pertence ao dado, numerais finos (200–300) que fazem o número
 * ler como instrumento, ícone monolinear de 1,5 px, relevo de `elevation.ts`
 * (no escuro material, no claro sombra), linha no lugar da caixa.
 * STORY: a pessoa abre sabendo só "o que eu faço hoje"; o painel responde com
 * a palavra antes do número, entrega UMA ação, e mantém os mesmos mostradores
 * do plano até o registro — os números que ela olhou são os que ela guarda.
 * FIRST VIEWPORT: a semana como uma régua medida (sete posições, barra =
 * cumprido, traço = previsto, ponto de acento = hoje) logo abaixo do título;
 * sob ela a leitura do dia aberto — avaliação em `Headline`, meta técnica em
 * `Body` — e a ação principal em largura cheia. Sem etiqueta, sem grade de
 * cartões.
 * FORM: painel de instrumento; candidato 4 de 7 da lista ordenada; seed 1759fd9c.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 * finish review, the verdict, and DESIGN.md
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function PlanScreen() {
  const navigation = useNavigation<any>();

  const plan = useWorkoutStore((s) => s.plan);
  const execution = useWorkoutStore((s) => s.execution);
  const loading = useWorkoutStore((s) => s.loading);
  const refresh = useWorkoutStore((s) => s.refresh);

  /*
   O que foi CUMPRIDO na semana — a metade medida da régua. Vem das mesmas duas
   fontes que a agenda de movimento consolida (treino concluído e sessão de
   esporte, sem contar duas vezes o ato vinculado). Falhando a rede, a régua
   ainda desenha o previsto: o plano vem do store, que tem cache.
  */
  const [minutos, setMinutos] = useState<Map<string, number>>(() => new Map());

  const carregar = useCallback(async () => {
    await refresh();
    const [execucoes, sessoes] = await Promise.all([
      api.fetchExecutionHistory(30).catch(() => null),
      api.fetchSportSessions(30).catch(() => null),
    ]);
    if (execucoes || sessoes) setMinutos(movementMinutes(execucoes ?? [], sessoes ?? []));
  }, [refresh]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const puxar = usePullRefresh(carregar);

  const semana = useMemo(
    () => montarSemanaDeTreino(plan, minutos, new Date()),
    [plan, minutos],
  );

  /*
   O dia aberto na leitura. `null` significa "siga o hoje" — sem isso, a tela
   ficaria presa no dia que a pessoa tocou ontem, e um plano que muda de dia
   sozinho durante a virada da meia-noite não teria como se corrigir.
  */
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const aberto: DiaDeTreino | undefined =
    semana.dias.find((d) => d.weekday === escolhido) ?? semana.dias.find((d) => d.ehHoje);

  if (loading && !plan) {
    return (
      <DetailScreen title="Treino" refreshControl={puxar}>
        <Data paddingTop="$lg">Carregando…</Data>
      </DetailScreen>
    );
  }

  if (!plan) {
    return (
      <DetailScreen title="Treino" refreshControl={puxar}>
        <YStack gap="$xl" paddingTop="$xl">
          <YStack gap="$sm">
            <Headline>Você ainda não tem um plano</Headline>
            <Body>
              Algumas perguntas sobre saúde e rotina, e o treino é montado a partir delas —
              respeitando o que você já respondeu no perfil.
            </Body>
          </YStack>
          <Button
            title="Montar meu treino"
            icon={<Icon name="dumbbell" size={16} color={darkPalette.ink} />}
            onPress={() => navigation.push('Anamnesis')}
          />
        </YStack>
      </DetailScreen>
    );
  }

  return (
    <DetailScreen title="Treino" refreshControl={puxar}>
      <YStack gap="$xl" paddingTop="$lg">
        {/*
          O que foi CONTIDO neste plano, e por quê.

          Antes, um plano que o avaliador reprovava simplesmente não existia — a
          pessoa respondia a anamnese inteira e recebia "não foi possível
          gerar". Agora ele é revisado e entregue; o que não pode é chegar mais
          conservador sem explicação. Some quando não há ressalva, que é o caso
          da grande maioria.
        */}
        {plan.revisionNotes && plan.revisionNotes.length > 0 ? (
          <Note title="O que ajustamos no seu plano" body={plan.revisionNotes.join(' ')} />
        ) : null}

        <WeekRail
          semana={semana}
          selecionado={aberto?.weekday ?? ''}
          onSelect={(dia) => setEscolhido(dia.weekday)}
        />

        {aberto ? (
          <Leitura
            dia={aberto}
            execucao={execution}
            onVoltarParaHoje={() => setEscolhido(null)}
            onCheckin={() => navigation.push('Checkin')}
            onContinuar={() => navigation.push('Training')}
          />
        ) : null}

        {/*
          Os quatro destinos do módulo, sem título de seção: quatro discos com
          a palavra embaixo já dizem o que são, e um cabeçalho ali só ocuparia
          a pausa que a leitura acabou de merecer.
        */}
        <QuickMenu />
      </YStack>
    </DetailScreen>
  );
}

/**
 * A leitura do dia aberto na régua.
 *
 * A regra de ouro vale aqui como em toda métrica: o destaque é a frase, o
 * número é subordinado — "Peito e tríceps" grande, "6 exercícios · ~52 min"
 * embaixo. E o que já foi REGISTRADO no dia entra na mesma linha, porque o
 * cumprido é a informação que a régua acabou de prometer.
 */
function Leitura({
  dia,
  execucao,
  onVoltarParaHoje,
  onCheckin,
  onContinuar,
}: {
  dia: DiaDeTreino;
  execucao: { workoutName: string } | null;
  onVoltarParaHoje: () => void;
  onCheckin: () => void;
  onContinuar: () => void;
}) {
  const registrado = dia.cumprido > 0 ? `${dia.cumprido} min registrados` : null;
  const voltar = dia.ehHoje
    ? null
    : { title: 'Ver o treino de hoje', onPress: onVoltarParaHoje, variant: 'ghost' as const };

  // Sessão correndo manda em tudo: é o único estado que não pode ser lido como
  // convite, porque já foi aceito.
  if (dia.ehHoje && execucao) {
    return (
      <TrainingPanel
        ativo
        titulo={execucao.workoutName}
        meta="Em andamento — continue de onde parou."
        acao={{ title: 'Continuar treino', onPress: onContinuar, icon: 'play' }}
      />
    );
  }

  if (!dia.planejado) {
    return (
      <TrainingPanel
        titulo="Dia de descanso"
        icone="moon"
        meta={[
          'Recuperação é o que faz a adaptação acontecer.',
          dia.ehHoje ? null : `Previsto para ${DAY_LABEL[dia.weekday]}.`,
          registrado,
        ]
          .filter(Boolean)
          .join(' ')}
        acao={
          dia.ehHoje
            ? { title: 'Treinar mesmo assim', onPress: onCheckin, icon: 'play' }
            : null
        }
        secundaria={voltar}
      />
    );
  }

  const treino = dia.planejado;
  const detalhe = isSportDay(treino.modality)
    ? `${modalityMeta(treino.modality).label} · ${treino.exerciseCount} ${
        treino.exerciseCount === 1 ? 'bloco' : 'blocos'
      }`
    : workoutMeta(treino.muscleGroups, treino.exerciseCount);

  const meta = [
    detalhe,
    treino.estimatedDuration ? `~${treino.estimatedDuration} min` : null,
    dia.ehHoje ? null : `previsto para ${DAY_LABEL[dia.weekday]}`,
    registrado,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TrainingPanel
      titulo={treino.name}
      icone={modalityMeta(treino.modality).icon as never}
      meta={meta}
      acao={dia.ehHoje ? { title: 'Começar treino', onPress: onCheckin, icon: 'play' } : null}
      secundaria={voltar}
    />
  );
}
