import { XStack, YStack } from '@tamagui/stacks';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { Note, Row, Section, ActionRow } from '../../components/List';
import { DetailScreen, usePullRefresh } from '../../components/DetailScreen';
import { Icon, type IconName } from '../../components/Icon';
import { Body, Button, Data, Headline, HeroCard, SectionTitle, Skeleton } from '../../components/ui';
import {
  alvoDoProjeto,
  fatosDoProjeto,
  horizonteDoProjeto,
  semanaDoProjeto,
  type FatoDoProjeto,
  type TreinoDoProjeto,
} from '../../domain/planProject';
import { DAY_LABEL } from '../../domain/workout';
import * as api from '../../services/api.service';
import { useWorkoutStore } from '../../store/workout.store';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * MEU PROJETO — por que o treino ficou desse jeito.
 *
 * Nasceu de uma pergunta de quem treina (ago/2026): "não sei qual a
 * metodologia, ele fica intercalando peito e costas". A ordem estava CERTA — é
 * pareamento agonista-antagonista — e mesmo assim o relato chegou como defeito.
 * Num produto em que a prescrição é automática, escolha deliberada que não se
 * explica é indistinguível de erro. E o app já guardava a fundamentação inteira
 * do modelo sem nunca mostrá-la.
 *
 * A espinha é o que a AVALIAÇÃO permitiu ou conteve, e não uma lista de
 * virtudes do plano: neste produto é a classificação de risco que decide o que
 * pode ser prescrito, e é dela que decorrem as escolhas mais visíveis — por que
 * ficou conservador, por que certos levantamentos não aparecem. Depois vêm as
 * decisões de método, derivadas da própria prescrição, e por último a
 * fundamentação escrita pelo modelo.
 *
 * FORMA: uma peça de relevo e o resto em LINHA. A primeira versão dava um card
 * a cada ressalva e a cada decisão — até nove cards de mesmo tamanho empilhados
 * sob etiquetas, que é a pilha de cartões que o módulo de treino recusa por
 * contrato e o que a regra 1 do sistema chama de ruído. O que esta tela entrega
 * é leitura corrida, e leitura se separa por hairline: o relevo fica com o
 * cabeçalho, que é a peça de destaque, e cada escolha é uma entrada de lista.
 *
 * Regra desta tela: **nada aqui é afirmado sem que a pessoa possa conferir
 * abrindo o próprio treino.** Os fatos saem da estrutura do plano, não de
 * adjetivos — ver `domain/planProject.ts`.
 */
const ICONE: Record<FatoDoProjeto['chave'], IconName> = {
  frequencia: 'calendar',
  alternancia: 'swap',
  preparo: 'stretch',
  volume: 'checklist',
  tempo: 'clock',
  nivel: 'gauge',
};

export function ProjectScreen() {
  const { colors } = useTheme();
  const plan = useWorkoutStore((s) => s.plan);
  const [treinos, setTreinos] = useState<TreinoDoProjeto[] | null>(null);
  const [anamnese, setAnamnese] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    let vivo = true;
    api
      .fetchAnamnesis()
      .then((a) => vivo && setAnamnese(a?.answers ?? null))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  const carregar = useCallback(async () => {
    const dias = (plan?.days ?? []).filter((d) => d.workout);
    if (dias.length === 0) return setTreinos([]);
    /*
     Um por vez, e tolerando falha individual: são até sete consultas, e um dia
     que não respondeu não pode apagar a leitura dos outros seis.
    */
    const carregados: TreinoDoProjeto[] = [];
    for (const dia of dias) {
      const detalhe = await api.fetchWorkout(dia.workout!.id).catch(() => null);
      if (!detalhe) continue;
      carregados.push({
        name: detalhe.name,
        temPreparo: detalhe.phases.some((f) => f.type === 'ALONGAMENTO' && f.exercises.length > 0),
        principais:
          detalhe.phases
            .find((f) => f.type === 'TREINO')
            ?.exercises.map((e) => ({
              name: e.name,
              muscleGroup: e.muscleGroup,
              subtype: e.subtype,
            })) ?? [],
      });
    }
    setTreinos(carregados);
  }, [plan]);

  useEffect(() => {
    void carregar();
  }, [carregar]);
  const puxar = usePullRefresh(carregar);

  if (!plan) {
    return (
      <DetailScreen title="Meu projeto">
        <Note
          title="Nenhum plano ativo"
          body="O projeto explica as escolhas de um plano. Gere o seu para vê-lo aqui."
        />
      </DetailScreen>
    );
  }

  const fatos = treinos ? fatosDoProjeto(treinos, anamnese) : [];
  const contido = plan.revisionNotes ?? [];
  const semana = semanaDoProjeto(plan.days);
  const horizonte = horizonteDoProjeto(plan);
  const alvo = alvoDoProjeto({ objetivo: plan.goal, treinos: treinos ?? [], horizonte });

  return (
    <DetailScreen title="Meu projeto" refreshControl={puxar}>
      {/*
        O cabeçalho é a única peça de relevo da tela, e carrega a regra que a
        torna confiável: nada abaixo é adjetivo, tudo sai da prescrição.
      */}
      <YStack paddingTop="$sm">
        <HeroCard>
          <Headline>{plan.name}</Headline>
          <Body>
            Por que o seu treino ficou assim. Cada escolha abaixo sai da própria prescrição, dá para conferir abrindo qualquer sessão.
          </Body>
        </HeroCard>
      </YStack>

      {/*
        ONDE ISTO VAI DAR, e até quando.

        Pedido de testador (Leonardo, 24/08/2026): "no projeto falta a duração e
        os objetivos que pretendemos alcançar, pessoas são movidas pelo
        resultado". Ele está certo sobre a falta, e a forma de atender sem
        prometer o que este produto não pode prometer é falar do que o app MEDE:
        prazo, objetivo declarado, e marcos de processo que se conferem na tela
        de progresso. Corpo de ninguém é previsto aqui.
      */}
      {horizonte ? (
        <Section label="o prazo">
          <Row>
            <Data flexShrink={0} width={112}>
              {horizonte.vencido ? 'Encerrado' : `Semana ${horizonte.semanaAtual} de ${horizonte.semanas}`}
            </Data>
            <YStack flex={1} height={4} borderRadius={2} backgroundColor="$muted" overflow="hidden">
              <YStack width={`${Math.round(horizonte.fracao * 100)}%`} height={4} backgroundColor="$primary" />
            </YStack>
          </Row>
          <Row last>
            <Body flex={1}>
              {horizonte.vencido
                ? 'O plano chegou ao fim. Gerar o próximo é o que leva a progressão adiante.'
                : `${horizonte.diasRestantes} ${horizonte.diasRestantes === 1 ? 'dia' : 'dias'} até a revisão, em ${dataCurta(horizonte.fim)}. É quando o plano é refeito com o que você treinou até lá.`}
            </Body>
          </Row>
        </Section>
      ) : null}

      {alvo ? (
        <Section label="onde isto vai dar">
          <Escolha icone="target" titulo={alvo.objetivo} corpo={alvo.comoOPlanoPersegue} last={alvo.marcos.length === 0} />
          {alvo.marcos.map((marco, i) => (
            <Escolha
              key={marco.titulo}
              icone="check"
              titulo={marco.titulo}
              corpo={marco.detalhe}
              last={i === alvo.marcos.length - 1}
            />
          ))}
        </Section>
      ) : null}

      {/*
        A ESPINHA: o que a avaliação de segurança conteve.

        Vem primeiro porque neste produto é ela que decide o que pode ser
        prescrito — e é dela que decorrem as escolhas que mais estranham, como
        um levantamento clássico não aparecer em lugar nenhum. Some quando não
        houve ressalva, que é a maioria dos casos.
      */}
      {contido.length > 0 ? (
        <Section label="o que foi contido">
          {contido.map((nota, i) => (
            <Escolha key={i} icone="flag" corpo={nota} last={i === contido.length - 1} />
          ))}
        </Section>
      ) : null}

      {fatos.length > 0 ? (
        <Section label="as decisões">
          {fatos.map((fato, i) => (
            <Escolha
              key={fato.chave}
              icone={ICONE[fato.chave]}
              titulo={fato.titulo}
              corpo={fato.porque}
              last={i === fatos.length - 1}
            />
          ))}
        </Section>
      ) : treinos === null ? (
        <Section label="as decisões">
          <Skeleton lines={3} />
        </Section>
      ) : null}

      <Section label="a semana">
        {semana.map((dia, i) => (
          <Row key={dia.dayOfWeek} last={i === semana.length - 1}>
            <Data flexShrink={0} width={72}>
              {DAY_LABEL[dia.dayOfWeek]}
            </Data>
            {dia.nome ? (
              <Body flex={1} numberOfLines={1} color="$foreground">
                {dia.nome}
              </Body>
            ) : (
              <Data flex={1}>Descanso</Data>
            )}
          </Row>
        ))}
      </Section>

      {/*
        A fundamentação do modelo NÃO aparece aqui — decisão da fundadora
        (22/08/2026), depois de um testador pedir duas vezes. Ela é escrita para
        o revisor; o que a pessoa lê são as decisões acima, em linguagem humana,
        montadas pelo domínio a partir da estrutura do plano. O texto continua
        guardado no plano para o revisor e o log.
      */}
    </DetailScreen>
  );
}

/** "28/09" — a data como ela aparece ao lado de um prazo. */
function dataCurta(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Uma escolha do projeto: linha de ação sem ação, só leitura. */
function Escolha({ icone, titulo, corpo, last }: { icone: IconName; titulo?: string; corpo: string; last: boolean }) {
  return <ActionRow icon={icone} title={titulo ?? corpo} subtitle={titulo ? corpo : undefined} right="none" last={last} />;
}
