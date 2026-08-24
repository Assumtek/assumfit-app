import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';

import {
  EIXOS,
  type Eixo,
  eixosMedidos,
  fraseDaAssinatura,
  pontaDoEixo,
  segmentos,
  vertice,
} from '../../domain/assinatura';
import { DASH } from '../../domain/ratings';
import { useTheme } from '../../theme/ThemeProvider';
import { Body, Label, Metric, Micro } from '../ui';
import { HeroCard } from '../ui/Card';
import { useSurfaceColor } from '../ui/elevation';
import { Pill, PillText } from '../ui/Pill';

/**
 * A margem que os rótulos precisam de cada lado.
 *
 * A figura não pode usar a largura inteira: "Atividade" e "Energia" se apoiam
 * nas pontas laterais e crescem para fora. Sem esta reserva os dois saíam
 * cortados pela borda do card, que foi exatamente o que a primeira versão fez
 * no simulador.
 */
const MARGEM_DO_ROTULO = 62;
/** Os anéis da régua, do miolo para fora. Régua, não papel quadriculado. */
const ANEIS = [0.34, 0.67, 1];

/**
 * A assinatura do dia: pentágono dos cinco eixos, contra a média dos dias.
 *
 * A peça de destaque da home, e a única com sombra de realce na tela. Três
 * coisas nela são regra do produto, não estilo:
 *
 * 1. **Um acento só, e ele é do dado.** A forma de hoje é `accent`; a média é
 *    o mesmo acento rebaixado e tracejado; régua e eixos são acromáticos.
 * 2. **Eixo sem medição não vira zero.** O rótulo mostra o traço e a figura
 *    fecha por uma ponte tracejada, que se lê como "faltou medida aqui".
 * 3. **Nenhum número solto nos vértices.** Cada eixo tem escala própria (ms,
 *    passos, score), e cinco escalas diferentes lado a lado num desenho não se
 *    comparam. O número grande é um só, o de energia, e cada vértice é porta
 *    para a tela onde o dado dele aparece com a régua inteira.
 */
export function AssinaturaDoDia({
  eixos,
  energia,
  avaliacao,
  diasNaMedia,
  largura,
  onAbrir,
}: {
  eixos: Eixo[];
  /** O score de energia, que ocupa o centro da figura. */
  energia: number;
  /** A avaliação em linguagem humana, o que a pessoa lê primeiro. */
  avaliacao: string;
  /** Quantos dias anteriores já entraram na comparação. */
  diasNaMedia: number;
  /** A largura útil dentro do card. A figura se dimensiona a partir dela. */
  largura: number;
  onAbrir: (rota: string) => void;
}) {
  const { colors } = useTheme();
  const superficie = useSurfaceColor();
  const LADO = Math.max(240, largura);
  const RAIO = LADO / 2 - MARGEM_DO_ROTULO;
  const RAIO_DO_ROTULO = RAIO + 18;
  /*
   A caixa acompanha a FIGURA, não a largura. Um pentágono de ponta para cima
   não é simétrico na vertical: ele sobe um raio inteiro e desce oito décimos
   dele. Reservar os dois lados iguais, como uma caixa quadrada faz, deixava um
   vão morto entre o desenho e o fio da frase.
  */
  const ACIMA = RAIO_DO_ROTULO + 14;
  const ABAIXO = RAIO_DO_ROTULO * 0.81 + 16;
  const ALTURA = ACIMA + ABAIXO;
  const CENTRO = { x: LADO / 2, y: ACIMA };
  const medidos = eixosMedidos(eixos);
  const frase = fraseDaAssinatura(eixos, diasNaMedia);
  const temMedia = eixos.some((e) => e.media != null);

  const lados = segmentos(
    eixos.map((e) => e.fracao),
    CENTRO,
    RAIO);
  const cheios = lados.filter((s) => !s.ponte);
  const pontes = lados.filter((s) => s.ponte);

  const preenchimento = eixos
    .map((e, i) => (e.fracao == null ? null : vertice(i, e.fracao, CENTRO, RAIO)))
    .filter((p): p is { x: number; y: number } => p != null)
    .map((p) => `${p.x},${p.y}`)
    .join(' ');

  /*
   A média usa a MESMA montagem da forma de hoje, inclusive as pontes: exigir
   os cinco eixos apagava a referência inteira por causa de um eixo que o
   servidor ainda não tem, e sem referência a figura de hoje não diz se o dia
   saiu do lugar de sempre, que é a razão de ela existir.
  */
  const ladosDaMedia = segmentos(
    eixos.map((e) => e.media),
    CENTRO,
    RAIO);

  return (
    <HeroCard accessibilityLabel={`Assinatura do dia. Energia ${energia}, ${avaliacao}. ${frase}`}>
      <XStack alignItems="flex-start" justifyContent="space-between">
        <YStack>
          <Label>energia de hoje</Label>
          <XStack alignItems="flex-end" gap="$sm">
            <Metric>{energia}</Metric>
          </XStack>
        </YStack>
        <Pill>
          <PillText>{avaliacao}</PillText>
        </Pill>
      </XStack>

      {medidos >= 3 ? (
        <YStack alignItems="center">
          <Svg width={LADO} height={ALTURA} accessibilityRole="image" accessibilityLabel={legenda(eixos)}>
            {ANEIS.map((r) => (
              <Polygon
                key={r}
                points={EIXOS.map((_, i) => {
                  const p = vertice(i, r, CENTRO, RAIO, 0);
                  return `${p.x},${p.y}`;
                }).join(' ')}
                fill="none"
                stroke={colors.track}
                strokeWidth={1}
              />
            ))}

            {EIXOS.map((_, i) => {
              const p = pontaDoEixo(i, CENTRO, RAIO);
              return (
                <Line key={i} x1={CENTRO.x} y1={CENTRO.y} x2={p.x} y2={p.y} stroke={colors.track} strokeWidth={1} />
              );
            })}

            {ladosDaMedia.map((s, i) => (
              <Polyline
                key={`m${i}`}
                points={`${s.de.x},${s.de.y} ${s.para.x},${s.para.y}`}
                fill="none"
                stroke={colors.accent}
                strokeOpacity={0.42}
                strokeWidth={1.4}
                strokeDasharray="4 5"
              />
            ))}

            {preenchimento ? (
              <Polygon points={preenchimento} fill={colors.accentSoft} stroke="none" />
            ) : null}

            {cheios.map((s, i) => (
              <Polyline
                key={`c${i}`}
                points={`${s.de.x},${s.de.y} ${s.para.x},${s.para.y}`}
                fill="none"
                stroke={colors.accent}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
            ))}
            {pontes.map((s, i) => (
              <Polyline
                key={`p${i}`}
                points={`${s.de.x},${s.de.y} ${s.para.x},${s.para.y}`}
                fill="none"
                stroke={colors.accent}
                strokeOpacity={0.34}
                strokeWidth={1.5}
                strokeDasharray="2 4"
              />
            ))}

            {eixos.map((e, i) => {
              if (e.fracao == null) return null;
              const p = vertice(i, e.fracao, CENTRO, RAIO);
              return <Circle key={e.chave} cx={p.x} cy={p.y} r={4} fill={superficie} stroke={colors.accent} strokeWidth={2} />;
            })}

            {eixos.map((e, i) => {
              const p = pontaDoEixo(i, CENTRO, RAIO_DO_ROTULO);
              const ancora = p.x > CENTRO.x + 6 ? 'start' : p.x < CENTRO.x - 6 ? 'end' : 'middle';
              return (
                <SvgText
                  key={e.chave}
                  x={p.x}
                  y={p.y + 4}
                  fill={e.fracao == null ? colors.textMuted : colors.text}
                  fontSize={12}
                  fontWeight="700"
                  textAnchor={ancora}
                >
                  {e.fracao == null ? `${e.rotulo} ${DASH}` : e.rotulo}
                </SvgText>
              );
            })}
          </Svg>

          {/* Cada eixo é porta para a própria tela. As áreas de toque ficam por
              cima do desenho, uma por vértice, com 44pt de lado. */}
          <YStack position="absolute" width={LADO} height={ALTURA}>
            {eixos.map((e, i) => {
              const p = pontaDoEixo(i, CENTRO, RAIO_DO_ROTULO - 8);
              return (
                <Pressable
                  key={e.chave}
                  onPress={() => onAbrir(e.rota)}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.rotulo}, abrir`}
                  style={{ position: 'absolute', left: p.x - 22, top: p.y - 22, width: 44, height: 44 }}
                />
              );
            })}
          </YStack>
        </YStack>
      ) : (
        <YStack paddingVertical="$xl" gap="$sm">
          <Body>
            A assinatura precisa de pelo menos três medidas do dia. Sincronize a pulseira para ela aparecer.
          </Body>
        </YStack>
      )}

      {temMedia ? (
        <XStack justifyContent="center" gap="$lg" alignItems="center">
          <XStack alignItems="center" gap="$sm">
            <YStack width={14} height={2} backgroundColor="$primary" />
            <Micro>hoje</Micro>
          </XStack>
          <XStack alignItems="center" gap="$sm">
            <YStack width={14} height={2} backgroundColor="$primary" opacity={0.42} />
            <Micro>seus últimos dias</Micro>
          </XStack>
        </XStack>
      ) : null}

      <YStack borderTopWidth={1} borderTopColor="$border" paddingTop="$md">
        <Body>{frase}</Body>
      </YStack>
    </HeroCard>
  );
}

function legenda(eixos: Eixo[]): string {
  const medidos = eixos.filter((e) => e.fracao != null);
  if (medidos.length === 0) return 'Assinatura do dia, sem medições.';
  return `Assinatura do dia em cinco eixos: ${medidos.map((e) => e.rotulo).join(', ')}.`;
}
