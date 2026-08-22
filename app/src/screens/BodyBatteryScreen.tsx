import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';

import { Note, Row, Section } from '../components/Card';
import { LineChart } from '../components/charts/LineChart';
import { DetailScreen, usePullRefresh } from '../components/DetailScreen';
import { DayPickerRow, useHistoricoDoDia } from '../components/DayPicker';
import { formatDateBR } from '../domain/birthDate';
import { Body, Data, Display, Label, MetricSm, RatingText } from '../components/ui';
import { calcBodyBattery, recoveryEfficiency } from '../domain/bodyBattery';
import { rateBodyBattery, ratingTextColor } from '../domain/ratings';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Bateria do corpo — quanto de reserva sobrou do dia.
 *
 * Tela própria, e não uma seção dentro de HRV. As duas coisas se parecem e não
 * são a mesma: HRV é uma medição num instante; a bateria é a integral da carga
 * ao longo do dia. Pendurar a curva do dia dentro da tela de uma medição
 * instantânea confunde as duas — foi exatamente o que aconteceu quando o card
 * levava para lá.
 *
 * O número é CALCULADO, não lido do aparelho: não existe nada equivalente nos
 * 33 cabeçalhos do SDK. Isso está dito na tela, porque num produto de saúde a
 * diferença entre medido e derivado é do usuário, não nossa.
 */
export function BodyBatteryScreen() {
  const { colors } = useTheme();
  const sleep = useBiometricStore((s) => s.sleep);
  const stressHistory = useBiometricStore((s) => s.stressHistory);
  const syncHistory = useBiometricStore((s) => s.syncHistory);

  /*
   Puxar aqui relê a PULSEIRA, não a rede.

   A bateria deriva do sono e da série de estresse, e as duas vêm da memória do
   aparelho — atualizar contra o servidor não traria nada de novo.
  */
  const refresh = usePullRefresh(syncHistory);

  /*
   A bateria é DIÁRIA, e o dia escolhido decide tudo nesta tela.

   O estresse do dia vem da série do servidor quando o dia é passado, e da
   memória da pulseira quando é hoje — a mesma regra das outras telas de saúde.
  */
  const historico = useHistoricoDoDia((p) => p.stress_score, stressHistory);
  const bateria = calcBodyBattery(sleep, historico.pontos, null, historico.dia);

  const tira = (
    <DayPickerRow
      selecionado={historico.dia}
      onSelecionar={historico.setDia}
      comDado={historico.comDado}
    />
  );

  if (!bateria) {
    /*
     Duas ausências diferentes, duas frases diferentes.

     Antes as duas caíam em "falta a noite" — e o caso mais comum não é falta de
     sono nenhum: é ter uma noite de dias atrás. Dizer "assim que houver uma
     noite" a quem TEM noite medida, só que de terça, manda a pessoa esperar por
     algo que já aconteceu.
    */
    const temNoiteDeOutroDia = sleep != null;
    return (
      <DetailScreen title="Bateria" refreshControl={refresh}>
        {tira}
        <Note
          title={temNoiteDeOutroDia ? 'Sem sono medido nesta noite' : 'Falta a noite'}
          body={
            temNoiteDeOutroDia
              ? `A bateria parte do sono da noite anterior, e não há medição para este dia, a sua noite mais recente é de ${formatDateBR(sleep!.date)}. Um número montado com o sono de um dia e o estresse de outro não descreveria nem um nem outro.`
              : 'A bateria parte do sono: é ele que diz com quanto você começou o dia. Assim que houver uma noite medida pela pulseira, esta tela se preenche.'
          }
        />
      </DetailScreen>
    );
  }

  const rating = rateBodyBattery(bateria.current);
  const eficiencia = recoveryEfficiency(bateria.morning, null);

  return (
    <DetailScreen title="Bateria" refreshControl={refresh}>
      {tira}

      <YStack marginBottom="$lg">
        <Display>{bateria.current}</Display>
        <Data marginTop="$xs">de 100 · reserva agora</Data>
        {/* O carimbo é a NOITE, não a última amostra de estresse. A noite é o
            ponto de partida da conta, e datar pelo estresse dava ao número uma
            atualidade que ele não tem. */}
        <Data marginTop="$xs">a partir do sono de {formatDateBR(sleep!.date)}</Data>
        <RatingText marginTop="$sm" style={{ color: ratingTextColor(rating.state, colors) }}>
          {rating.label}
        </RatingText>
        {/* Uma frase de abertura: o que este número É. "Qual a explicação
            dessa bateria?" (testador, 22/08). O método fica na Ajuda. */}
        <Body marginTop="$md">
          A bateria começa no que a noite de sono recarregou e, ao longo do dia, desce com o estresse que a
          pulseira mede e sobe nos momentos calmos: 100 é reserva cheia, e ela gasta mais rápido do que recupera.
        </Body>
      </YStack>

      {/*
        A curva do dia inteiro, com domínio fixo de 0 a 100.

        Fixo e não automático: numa escala que se ajusta ao dado, um dia que
        variou de 62 a 68 desenha a mesma montanha que um dia que foi de 10 a
        95. A bateria só significa alguma coisa contra o total.
      */}
      {bateria.curve.length > 1 ? (
        <Medido>
          {(largura) => (
            <LineChart
              data={bateria.curve.map((p) => p.level)}
              width={largura}
              height={172}
              domain={[0, 100]}
              markLast
            />
          )}
        </Medido>
      ) : (
        <Body>
          A curva aparece quando houver mais de uma medição de estresse no dia, é ela que move a
          agulha.
        </Body>
      )}

      <Section label="O dia">
        <Row>
          <Body color="$foreground">Acordou com</Body>
          <MetricSm>{bateria.morning}</MetricSm>
        </Row>
        <Row last>
          <Body color="$foreground">Gasto desde então</Body>
          <MetricSm>{bateria.used}</MetricSm>
        </Row>
      </Section>

      {/*
        Ganho da noite e eficiência ficam de fora enquanto não houver a véspera.

        Os dois precisam saber com quanto a pessoa foi DORMIR, e isso só existe
        a partir do segundo dia de uso. Mostrar "+80" partindo de zero, como o
        app do fabricante faz, seria inventar o ponto de partida — e num produto
        de saúde número plausível que ninguém mediu é pior que campo vazio.
      */}
      <Section label="A noite">
        <Row>
          <Body color="$foreground">Ganho da noite</Body>
          <Data>{bateria.gain == null ? 'a partir de amanhã' : `+${bateria.gain}`}</Data>
        </Row>
        <Row last>
          <Body color="$foreground">Eficiência da recuperação</Body>
          <Data>{eficiencia == null ? 'a partir de amanhã' : `${eficiencia}%`}</Data>
        </Row>
      </Section>

    </DetailScreen>
  );
}

/**
 * Dá ao filho a largura REAL disponível.
 *
 * O gráfico é SVG e precisa de largura em número — não existe `width: 100%` num
 * `<Svg>`. Calcular a partir da tela obriga a subtrair padding em três lugares,
 * e qualquer mudança neles quebra o desenho em silêncio.
 */
function Medido({ children }: { children: (largura: number) => React.ReactNode }) {
  const [largura, setLargura] = React.useState(0);
  return (
    <XStack marginBottom="$xl" onLayout={(e) => setLargura(e.nativeEvent.layout.width)}>
      {largura > 0 ? children(largura) : null}
    </XStack>
  );
}
