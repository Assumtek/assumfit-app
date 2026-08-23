import { useNavigation } from '@react-navigation/native';
import { YStack } from '@tamagui/stacks';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Note } from '../../components/List';
import { DetailScreen, usePullRefresh } from '../../components/DetailScreen';
import { Icon } from '../../components/Icon';
import { TrainingPanel } from '../../components/TrainingPanel';
import { WeekRail } from '../../components/WeekRail';
import { Body, Button, Data, Headline, Skeleton } from '../../components/ui';
import { QuickMenu } from './QuickMenu';
import { movementMinutes, treinoConta } from '../../domain/movement';
import { treinoPendente, montarSemanaDeTreino, type DiaDeTreino } from '../../domain/trainingWeek';
import {
  DAY_LABEL,
  isSportDay,
  modalityMeta,
  workoutMetaSemRepetir,
} from '../../domain/workout';
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
  const [feitos, setFeitos] = useState<ReadonlySet<string>>(new Set());

  const carregar = useCallback(async () => {
    await refresh();
    const [execucoes, sessoes] = await Promise.all([
      api.fetchExecutionHistory(30).catch(() => null),
      api.fetchSportSessions(30).catch(() => null),
    ]);
    if (execucoes || sessoes) setMinutos(movementMinutes(execucoes ?? [], sessoes ?? []));
    // Treinos do plano já feitos nesta semana, por nome: é o que tira a
    // pendência de um dia cujo treino foi feito em outro.
    const segunda = new Date();
    segunda.setHours(0, 0, 0, 0);
    segunda.setDate(segunda.getDate() - ((segunda.getDay() + 6) % 7));
    setFeitos(new Set((execucoes ?? []).filter((e) => treinoConta(e) && new Date(e.startedAt) >= segunda).map((e) => e.workoutName)));
  }, [refresh]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const puxar = usePullRefresh(carregar);

  const semana = useMemo(
    () => montarSemanaDeTreino(plan, minutos, new Date(), feitos),
    [plan, minutos, feitos]);

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
        <YStack paddingTop="$lg"><Skeleton lines={4} /></YStack>
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
              Algumas perguntas sobre saúde e rotina, e o treino é montado a partir delas, respeitando o que você já respondeu no perfil.
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
            pendente={treinoPendente(semana)}
            onCheckin={(dia) => navigation.push('Checkin', dia ? { dayOfWeek: dia.weekday } : undefined)}
            onContinuar={() => navigation.push('Training')}
          />
        ) : null}

        {/*
          Os cinco destinos do módulo, sem título de seção: cinco discos com
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
  pendente,
  onVoltarParaHoje,
  onCheckin,
  onContinuar,
}: {
  dia: DiaDeTreino;
  execucao: { workoutName: string } | null;
  /** O treino desta semana que ficou para trás, se houver. */
  pendente: DiaDeTreino | null;
  onVoltarParaHoje: () => void;
  /** Sem argumento: o treino de hoje. Com dia: o treino DAQUELE dia, hoje. */
  onCheckin: (dia?: DiaDeTreino) => void;
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
        meta="Em andamento, continue de onde parou."
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
        /*
         Em dia de descanso a ação principal é DESCANSAR — então não há botão
         preenchido. A peça dizia "recuperação é o que faz a adaptação
         acontecer" e logo abaixo destacava treinar assim mesmo, com o acento
         que o sistema reserva para a ação principal da tela. O convite
         continua; deixa de ser o elemento mais alto.
        */
        acao={null}
        secundaria={
          dia.ehHoje
            ? pendente
              ? /*
                 Dia de descanso com treino pendente na semana: o atalho de
                 recuperar vale MAIS aqui do que "treinar mesmo assim" — a
                 rodada de testes (22/08) mostrou o sábado sem o botão, com a
                 sexta em aberto.
                */
                { title: `Fazer o de ${DAY_LABEL[pendente.weekday]} que ficou`, onPress: () => onCheckin(pendente), variant: 'secondary' }
              : { title: 'Treinar mesmo assim', onPress: () => onCheckin(), variant: 'secondary' }
            : voltar
        }
      />
    );
  }

  const treino = dia.planejado;
  const esporte = isSportDay(treino.modality);

  const detalhe = esporte
    ? `${modalityMeta(treino.modality).label} · ${treino.exerciseCount} ${
        treino.exerciseCount === 1 ? 'bloco' : 'blocos'
      }`
    : workoutMetaSemRepetir(treino.name, treino.muscleGroups, treino.exerciseCount);

  const meta = [
    detalhe,
    treino.estimatedDuration ? `~${treino.estimatedDuration} min` : null,
    dia.ehHoje ? null : `previsto para ${DAY_LABEL[dia.weekday]}`,
    registrado,
  ]
    .filter(Boolean)
    .join(' · ');

  /*
   O caminho é sempre o CHECK-IN, inclusive em dia de esporte.

   Houve uma versão que mandava o dia de esporte direto ao cronômetro, para
   fugir do percurso que gravou um treino de 65 segundos como 100% em produção.
   Resolvia o defeito e criava outro: pulava uma tela que tem função — é nela
   que se escolhe o treino do dia, se lê o preparo e se decide entre os dois
   jeitos de registrar.

   A correção pertence um nível abaixo, e está lá: no check-in, o dia de esporte
   destaca o CRONÔMETRO e desce o guiado a secundário. Quem escolhe continua
   vendo as duas opções; o que mudou é qual delas a tela recomenda.
  */
  /*
   O treino que FICOU. Um testador (21/08) não fez o de ontem, a tela já
   mostrava o de hoje, e ele queria um jeito fácil de fazer o que passou.
   Dois caminhos, os dois sem sair desta tela: no dia passado aberto na régua,
   a ação principal vira "Fazer este treino hoje"; e no painel de hoje, se
   ainda não há registro, a secundária oferece o pendente mais recente pelo
   nome do dia. Recuperar vale só dentro da semana — semana anterior é
   reorganizar o plano, não um atalho.
  */
  const recuperar =
    dia.ehHoje && pendente && dia.cumprido === 0
      ? {
          title: `Fazer o de ${DAY_LABEL[pendente.weekday]} que ficou`,
          onPress: () => onCheckin(pendente),
          variant: 'secondary' as const,
        }
      : null;

  return (
    <TrainingPanel
      titulo={treino.name}
      icone={modalityMeta(treino.modality).icon as never}
      meta={dia.pendente ? `${meta} · não registrado` : meta}
      acao={
        dia.ehHoje
          ? { title: 'Começar treino', onPress: () => onCheckin(), icon: 'play' }
          : dia.pendente
            ? { title: 'Fazer este treino hoje', onPress: () => onCheckin(dia), icon: 'play' }
            : null
      }
      secundaria={recuperar ?? voltar}
    />
  );
}
