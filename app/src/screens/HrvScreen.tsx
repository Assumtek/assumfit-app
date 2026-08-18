import { XStack, YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable } from 'react-native';

import { EmptyMetric } from '../components/BandStatus';
import { Note } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { FetchFromBandButton, MeasureButton } from '../components/MeasureButton';
import { MeasuredAt } from '../components/MeasuredAt';
import { DayPickerRow, useHistoricoDoDia } from '../components/DayPicker';
import { LineChart } from '../components/charts/LineChart';
import { Data, Display, RatingText } from '../components/ui';
import { rateHrv, shown } from '../domain/ratings';
import { faixaInicial, FAIXAS, noPeriodo, rotulosDoPeriodo, type Faixa } from '../domain/series';
import { useBiometricStore } from '../store/biometric.store';

export function HrvScreen() {
  const latest = useBiometricStore((s) => s.latest);
  const hrvHistory = useBiometricStore((s) => s.hrvHistory);
  /*
   A aba inicial é decidida pelo DADO, uma vez.

   Num `useState` com inicializador preguiçoso de propósito: recalcular a cada
   render arrancaria a aba da mão de quem acabou de tocar em outra.
  */
  const historico = useHistoricoDoDia((p) => p.hrv_ms, hrvHistory);
  const [range, setRange] = useState<Faixa>(() => faixaInicial(hrvHistory));
  const [chartWidth, setChartWidth] = useState(0);

  if (!latest)
    return (
      <DetailScreen title="Variabilidade (HRV)">
        <EmptyMetric measure="hrv" />
      </DetailScreen>
    );

  const rating = rateHrv(latest.hrvMs);
  /*
   As faixas de período recortam HOJE. Num dia passado elas não fazem sentido —
   "última hora" de anteontem não é nada —, e ali a curva é o dia inteiro.
  */
  const serie = historico.ehHoje ? noPeriodo(hrvHistory, range) : historico.pontos;
  /*
   A linha de base é da JANELA em vista, não da série inteira.

   É o que dá sentido a trocar de aba: a média de sete dias comparada com as
   últimas seis horas responde "hoje está diferente do meu normal?", e uma
   média fixa responderia sempre a mesma coisa em qualquer aba.
  */
  const baseline = serie.length
    ? serie.reduce((soma, p) => soma + p.value, 0) / serie.length
    : latest.hrvMs;

  return (
    /*
     Só variabilidade. A frequência tem tela própria (`HeartRateScreen`).

     As duas moravam aqui porque os cards "HRV" e "coração" da home iam para o
     mesmo lugar — remendo de navegação, não decisão. São grandezas com fontes e
     cadências diferentes: batimento a cada poucos segundos, HRV numa janela por
     hora que passa dias vazia. Juntas, a idade de um valia pelo outro.
    */
    <DetailScreen title="Variabilidade (HRV)">
      <YStack marginBottom="$xxl">
        <Display>{shown(latest.hrvMs)}</Display>
        {/*
          A IDADE da medição, ao lado do número.

          A pulseira mede HRV em janelas agendadas e passa dias sem nenhuma —
          confirmado no aparelho e no app do fabricante, que mostrava 45 ms de
          quatro dias antes. Um número sem data se lê como "agora", e aí a
          pessoa interpreta como estado atual algo que é de anteontem.
        */}
        <Data marginTop="$sm">ms · variabilidade cardíaca</Data>
        {/*
          O carimbo é o da AMOSTRA (`hrvAt`), não o da leitura: o HRV vem de uma
          janela agendada e a leitura que o carrega é do minuto. Usar
          `recordedAt` faria um dado de dias atrás parecer recém-medido.
        */}
        <MeasuredAt at={latest.hrvAt ?? undefined} />
        <RatingText
          marginTop="$lg"
          color={rating.state === 'alert' ? '$destructive' : '$foreground'}
        >
          {rating.label}
        </RatingText>
      </YStack>

      <DayPickerRow
        selecionado={historico.dia}
        onSelecionar={historico.setDia}
        comDado={historico.comDado}
      />

      {historico.ehHoje ? (
      <XStack gap="$xl" marginBottom="$lg">
        {FAIXAS.map((r) => {
          // Faixa sem curva fica visivelmente indisponível em vez de levar a um
          // vazio: o controle passa a informar onde há dado antes do toque.
          const vazia = noPeriodo(hrvHistory, r).length === 0;
          return (
            <Pressable
              key={r}
              onPress={() => setRange(r)}
              hitSlop={10}
              accessibilityRole="tab"
              accessibilityState={{ selected: range === r, disabled: vazia }}
            >
              <Data
                letterSpacing={1}
                color={range === r ? '$foreground' : vazia ? '$faint' : '$mutedForeground'}
              >
                {r}
              </Data>
            </Pressable>
          );
        })}
      </XStack>
      ) : null}

      <YStack
        marginBottom="$md"
        onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}
      >
        {/*
          Curva só existe com pelo menos DOIS pontos — um ponto é um valor, não
          uma linha. O `LineChart` devolvia `null` nesse caso e a tela ficava
          com um vazio silencioso onde deveria haver gráfico: quem abria não
          sabia se o app estava carregando, quebrado ou sem dado. Agora a
          ausência é dita, com o caminho para resolvê-la logo abaixo.
        */}
        {serie.length >= 1 ? (
          <LineChart
            data={serie.map((p) => p.value)}
            width={chartWidth}
            height={150}
            markLast
            // Sem HRV medido não há média pessoal, e faixa de referência
            // desenhada sobre nada seria decoração enganosa.
            band={baseline == null ? undefined : { from: baseline * 0.85, to: baseline * 1.15 }}
            thresholds={baseline == null ? [] : [{ value: baseline, label: 'sua média' }]}
            xLabels={rotulosDoPeriodo(serie)}
            id="hrv"
          />
        ) : (
          <Note
            title="Sem medições nesta faixa"
            body={
              hrvHistory.length >= 1
                ? 'Há medições fora deste período. Toque numa faixa mais larga para vê-las.'
                : 'A pulseira registra HRV numa janela por hora, e quando você mede aqui. A primeira medição já aparece no gráfico.'
            }
          />
        )}
      </YStack>
      {serie.length >= 2 ? (
        <Data marginBottom="$sm" lineHeight={17}>
          A faixa é a sua linha de base — HRV só significa alguma coisa contra ela, nunca em valor
          absoluto.
        </Data>
      ) : null}


      <MeasureButton kind="hrv" />
      {/*
        Os dois, e não um. A medição sob demanda de HRV nunca concluiu com valor
        em campo — todas as tentativas foram recusadas por sensor ocupado, o que
        só se corrigiu em 18/08 e ainda não foi provado num aparelho. Reler a
        memória é o caminho que funciona, e agora ele varre sete dias.
      */}
      <FetchFromBandButton label="Buscar HRV na pulseira" />
    </DetailScreen>
  );
}
