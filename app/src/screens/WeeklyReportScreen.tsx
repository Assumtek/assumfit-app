import { YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';

import { DetailScreen } from '../components/DetailScreen';
import { Row, Section } from '../components/List';
import { Body, Data, Readout, ReadoutCluster, SectionTitle, Skeleton } from '../components/ui';
import { resumoDaSemana, type ResumoDaSemana } from '../domain/weeklyReport';
import * as api from '../services/api.service';
import { useHabitsStore } from '../store/habits.store';

/**
 * O resumo da semana: os números do aparelho e a leitura do modelo, com as
 * ações. Chega pela notificação de domingo às 8h e pelo menu.
 *
 * O texto é SÓ do modelo: sem resposta, a tela diz que não houve resposta e
 * fica com os números. Texto pronto de reserva não entra (fundadora, 22/08).
 */
export function WeeklyReportScreen() {
  const [numeros, setNumeros] = useState<ResumoDaSemana | null>(null);
  const [texto, setTexto] = useState<api.WeeklyReport | 'erro' | undefined>(undefined);
  const semanaDeAgua = useHabitsStore((s) => s.week);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [execucoes, sessoes, dias] = await Promise.all([
        api.fetchExecutionHistory(7).catch(() => []),
        api.fetchSportSessions(7).catch(() => []),
        api.fetchDailyHistory(7).catch(() => []),
      ]);
      if (!vivo) return;
      setNumeros(resumoDaSemana(execucoes, sessoes, dias, semanaDeAgua.map((d) => d.waterMl)));
    })();
    api
      .fetchWeeklyReport()
      .then((t) => vivo && setTexto(t))
      .catch(() => vivo && setTexto('erro'));
    return () => {
      vivo = false;
    };
  }, [semanaDeAgua]);

  const min = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}h${String(n % 60).padStart(2, '0')}` : `${n} min`);

  return (
    <DetailScreen title="Resumo da semana">
      {texto === undefined ? (
        <YStack marginTop="$lg">
          <Skeleton lines={4} />
        </YStack>
      ) : texto === 'erro' ? (
        <Data marginTop="$lg">O modelo não respondeu agora. Os números abaixo são do aparelho; a leitura chega quando houver resposta.</Data>
      ) : (
        <YStack marginTop="$lg" gap="$sm">
          <SectionTitle>{texto.headline}</SectionTitle>
          <Body>{texto.resumo}</Body>
        </YStack>
      )}

      {numeros ? (
        <YStack marginTop="$xl">
          <ReadoutCluster>
            <Readout valor={String(numeros.atividades)} unidade="" rotulo="atividades" />
            <Readout valor={min(numeros.minutos)} unidade="" rotulo="em movimento" />
            <Readout valor={numeros.notaMedia != null ? numeros.notaMedia.toFixed(1).replace('.', ',') : '–'} unidade="" rotulo="nota média" />
          </ReadoutCluster>
        </YStack>
      ) : null}

      {texto && texto !== 'erro' && texto.acoes.length > 0 ? (
        <Section label="o que ajustar">
          {texto.acoes.map((a, i) => (
            <Row key={a.titulo} last={i === texto.acoes.length - 1}>
              <YStack flex={1} gap={4}>
                <Body color="$foreground">{a.titulo}</Body>
                <Data>{a.porque}</Data>
              </YStack>
            </Row>
          ))}
        </Section>
      ) : null}

      {numeros ? (
        <Section label="a semana em números">
          <Row>
            <Body flex={1}>Sono</Body>
            <Data>{numeros.sonoMedio != null ? `score ${numeros.sonoMedio}${numeros.sonoMinutosMedio != null ? ` · ${min(numeros.sonoMinutosMedio)} por noite` : ''}` : 'sem noites registradas'}</Data>
          </Row>
          <Row>
            <Body flex={1}>Passos</Body>
            <Data>{numeros.passosMedio != null ? `${numeros.passosMedio.toLocaleString('pt-BR')} por dia` : 'sem leitura'}</Data>
          </Row>
          <Row>
            <Body flex={1}>Água</Body>
            <Data>{numeros.aguaMediaMl != null ? `${(numeros.aguaMediaMl / 1000).toFixed(1).replace('.', ',')} L em ${numeros.diasComAgua} ${numeros.diasComAgua === 1 ? 'dia' : 'dias'}` : 'sem registro'}</Data>
          </Row>
          <Row last>
            <Body flex={1}>Esporte</Body>
            <Data>{numeros.esportes > 0 ? `${numeros.esportes} ${numeros.esportes === 1 ? 'sessão' : 'sessões'} · ${numeros.kcal} kcal` : 'nenhuma sessão'}</Data>
          </Row>
        </Section>
      ) : null}
    </DetailScreen>
  );
}
