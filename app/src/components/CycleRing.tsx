import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import Svg, { Circle, G, Line } from 'react-native-svg';

import { Data, Label, Metric, MetricSm } from './ui';
import { PHASE_COPY, type CyclePhase } from '../domain/cycle';
import { useTheme } from '../theme/ThemeProvider';

/**
 * O MÊS como anel: um traço por dia do calendário, colorido pela fase.
 *
 * A primeira versão desenhava quatro arcos proporcionais à duração das fases —
 * bonito e inútil para a pergunta real, que é "em que fase eu vou estar no dia
 * 23". Aqui cada dia do mês tem o próprio traço na volta, então a resposta se
 * lê apontando o dedo: a volta é o mês, o traço é o dia.
 *
 * ## Cor: a exceção autorizada
 *
 * O sistema tem UM acento, e esta tela é a exceção — decisão da fundadora
 * (ago/2026), pedida com estas palavras: "pode usar cores normal, vermelho
 * etc.". A razão é que as quatro fases são CATEGORIAS simultâneas na mesma
 * volta, e quatro opacidades do mesmo roxo, lado a lado num traço de 3 pt,
 * não se distinguem. O roxo da marca continua na fase lútea, que fecha o
 * ciclo — a paleta não abandona a identidade, abre espaço para o dado.
 */

export type DiaDoAnel = {
  /** Dia do mês, 1-based. */
  dia: number;
  /** `null` quando a projeção não alcança aquele dia. */
  fase: CyclePhase | null;
  ehHoje: boolean;
  registrado: boolean;
};

/**
 * As quatro fases em cores próprias. Escolhidas para funcionarem nos dois
 * temas e para serem distinguíveis por quem não separa bem verde de vermelho:
 * além da cor, a menstruação é a única com traço mais grosso e é a única
 * quente forte.
 */
export const COR_DA_FASE: Record<CyclePhase, string> = {
  menstrual: '#E5484D',
  follicular: '#46A758',
  ovulatory: '#F5A524',
  luteal: '#877BF0',
};

const TAMANHO = 260;
/** Espessura do traço de cada dia. */
const TRACO = 12;
/** Vão angular entre dias, em graus — sem ele o anel vira uma faixa só. */
const VAO = 1.6;

export function CycleRing({
  dias,
  diasParaProxima,
  faseDeHoje,
  estimando,
  nomeDoMes,
}: {
  dias: DiaDoAnel[];
  /** Dias até a próxima menstruação; 0 = prevista para hoje; null = sem previsão. */
  diasParaProxima: number | null;
  faseDeHoje: CyclePhase | null;
  estimando: boolean;
  nomeDoMes: string;
}) {
  const { colors } = useTheme();

  const raio = (TAMANHO - TRACO * 2) / 2;
  const centro = TAMANHO / 2;
  const total = Math.max(1, dias.length);
  const passo = 360 / total;

  return (
    <YStack alignItems="center" marginVertical="$md">
      <YStack width={TAMANHO} height={TAMANHO} alignItems="center" justifyContent="center">
        <Svg
          width={TAMANHO}
          height={TAMANHO}
          style={{ position: 'absolute', top: 0, left: 0 }}
          accessibilityLabel={`Ciclo em ${nomeDoMes}: ${dias.length} dias, cada um com a fase prevista`}
        >
          {/* O dia 1 no topo, girando no sentido horário — é onde todo mundo
              procura o começo do mês. */}
          <G rotation={-90} origin={`${centro}, ${centro}`}>
            {dias.map((d, i) => {
              const a1 = ((i * passo + VAO / 2) * Math.PI) / 180;
              const a2 = (((i + 1) * passo - VAO / 2) * Math.PI) / 180;
              const cor = d.fase ? COR_DA_FASE[d.fase] : colors.track;
              // O dia registrado é traço mais grosso: fato medido pesa mais
              // que fase projetada, e a diferença precisa existir sem cor nova.
              const espessura = d.registrado ? TRACO + 4 : TRACO;
              return (
                <Line
                  key={d.dia}
                  x1={centro + raio * Math.cos(a1)}
                  y1={centro + raio * Math.sin(a1)}
                  x2={centro + raio * Math.cos(a2)}
                  y2={centro + raio * Math.sin(a2)}
                  stroke={cor}
                  strokeWidth={espessura}
                  strokeLinecap="butt"
                  opacity={d.fase ? 1 : 0.6}
                />
              );
            })}
          </G>

          {/* Hoje: um ponto FORA do anel, apontando o dia — dentro dele viraria
              um quinto tom competindo com as fases. */}
          {dias.map((d, i) => {
            if (!d.ehHoje) return null;
            const meio = ((i + 0.5) * passo - 90) * (Math.PI / 180);
            const rExterno = raio + TRACO / 2 + 7;
            return (
              <Circle
                key={`hoje-${d.dia}`}
                cx={centro + rExterno * Math.cos(meio)}
                cy={centro + rExterno * Math.sin(meio)}
                r={4}
                fill={colors.text}
              />
            );
          })}
        </Svg>

        {/* O miolo responde a pergunta que traz alguém a esta tela. */}
        <YStack alignItems="center" paddingHorizontal="$xxl">
          {diasParaProxima == null ? (
            <Data textAlign="center">sem previsão ainda</Data>
          ) : diasParaProxima === 0 ? (
            <MetricSm fontWeight="700" color="$foreground" textAlign="center">
              Prevista para hoje
            </MetricSm>
          ) : (
            <>
              <Metric letterSpacing={-2} color="$foreground" fontVariant={['tabular-nums']}>
                {diasParaProxima}
              </Metric>
              <Data textAlign="center">
                {diasParaProxima === 1 ? 'dia até a próxima' : 'dias até a próxima'}
              </Data>
            </>
          )}
          {faseDeHoje ? (
            <Label marginTop="$md" textAlign="center" style={{ color: COR_DA_FASE[faseDeHoje] }}>
              {PHASE_COPY[faseDeHoje].label}
              {estimando ? ' · estimado' : ''}
            </Label>
          ) : null}
        </YStack>
      </YStack>

      <Data marginTop="$sm">{nomeDoMes}</Data>

      {/* Legenda: sem nome, quatro cores num anel são decoração. */}
      <XStack flexWrap="wrap" justifyContent="center" gap="$md" rowGap="$xs" marginTop="$lg">
        {(Object.keys(COR_DA_FASE) as CyclePhase[]).map((fase) => (
          <XStack key={fase} alignItems="center" gap="$xs">
            <YStack
              width={8}
              height={8}
              borderRadius={4}
              style={{ backgroundColor: COR_DA_FASE[fase] }}
            />
            <Data>{PHASE_COPY[fase].label}</Data>
          </XStack>
        ))}
      </XStack>
    </YStack>
  );
}
