import { YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';
import Svg, {
  ClipPath,
  Defs,
  G,
  Image as SvgImage,
  Polygon,
  Polyline,
} from 'react-native-svg';

import type { GeoPoint } from '../domain/sport';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Mosaico em favo de mel: cada sessão vira um hexágono com a FOTO dela
 * dentro, ou o traçado do percurso quando não houver foto.
 *
 * O hexágono não é enfeite: ele encaixa sem sobra, o que faz uma parede densa
 * de memórias em vez de uma grade de cartões. A geometria é pointy-top —
 * vértice em cima —, o arranjo alterna 3 e 2 por linha, e a linha curta entra
 * deslocada meia largura, que é o que fecha o favo.
 */

/** Uma peça do mosaico: foto (asset ou uri) ou percurso desenhado. */
export type HexItem = {
  key: string;
  /** `require()` de asset local ou `{ uri }` — o que a sessão guardou. */
  foto?: number | { uri: string };
  /** Sem foto, o percurso desenha a peça. */
  points?: GeoPoint[];
  rotulo: string;
  onPress?: () => void;
};

/** Quantas peças cabem por linha, alternando — o padrão do favo. */
const LINHA_CHEIA = 3;
const LINHA_CURTA = 2;

export function HexMosaic({ itens, width }: { itens: HexItem[]; width: number }) {
  const { colors } = useTheme();
  if (itens.length === 0) return null;

  // Geometria pointy-top: largura = √3·s, altura = 2·s, e cada linha nova
  // sobe 3/4 da altura para os vértices se encaixarem.
  const larguraHex = width / LINHA_CHEIA;
  const s = larguraHex / Math.sqrt(3);
  const alturaHex = 2 * s;
  const passoY = 1.5 * s;

  // Distribui em linhas alternadas 3, 2, 3, 2…
  const linhas: HexItem[][] = [];
  let i = 0;
  while (i < itens.length) {
    const tamanho = linhas.length % 2 === 0 ? LINHA_CHEIA : LINHA_CURTA;
    linhas.push(itens.slice(i, i + tamanho));
    i += tamanho;
  }

  const alturaTotal = (linhas.length - 1) * passoY + alturaHex;

  return (
    <YStack width={width} height={alturaTotal}>
      {linhas.map((linha, l) => {
        const curta = l % 2 === 1;
        const offsetX = curta ? larguraHex / 2 : 0;
        return linha.map((item, c) => {
          const x = offsetX + c * larguraHex;
          const y = l * passoY;
          return (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              disabled={!item.onPress}
              accessibilityRole={item.onPress ? 'button' : 'image'}
              accessibilityLabel={item.rotulo}
              style={({ pressed }) => [
                {
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: larguraHex,
                  height: alturaHex,
                },
                pressed && item.onPress ? { opacity: 0.7 } : undefined,
              ]}
            >
              <Hexagono
                item={item}
                largura={larguraHex}
                altura={alturaHex}
                lado={s}
                trilho={colors.track}
                traco={colors.accent}
                borda={colors.hairline}
              />
            </Pressable>
          );
        });
      })}
    </YStack>
  );
}

function Hexagono({
  item,
  largura,
  altura,
  lado,
  trilho,
  traco,
  borda,
}: {
  item: HexItem;
  largura: number;
  altura: number;
  lado: number;
  trilho: string;
  traco: string;
  borda: string;
}) {
  const cx = largura / 2;
  const cy = altura / 2;
  // Meio ponto de folga em cada peça: sem isso os hexágonos se encostam e a
  // parede vira uma mancha só, sem a malha que faz o favo ser favo.
  const r = lado - 0.75;
  const meia = (Math.sqrt(3) / 2) * r;
  const pontos = [
    [cx, cy - r],
    [cx + meia, cy - r / 2],
    [cx + meia, cy + r / 2],
    [cx, cy + r],
    [cx - meia, cy + r / 2],
    [cx - meia, cy - r / 2],
  ]
    .map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`)
    .join(' ');

  const idClip = `hex-${item.key}`;

  return (
    <Svg width={largura} height={altura}>
      <Defs>
        <ClipPath id={idClip}>
          <Polygon points={pontos} />
        </ClipPath>
      </Defs>

      {/* Fundo: o trilho aparece nas peças sem foto e por trás dela enquanto
          a imagem decodifica — nunca um buraco branco na parede. */}
      <Polygon points={pontos} fill={trilho} />

      {item.foto ? (
        <SvgImage
          href={item.foto}
          x={0}
          y={0}
          width={largura}
          height={altura}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${idClip})`}
        />
      ) : item.points && item.points.length > 1 ? (
        <G clipPath={`url(#${idClip})`}>
          <TracadoDoPercurso
            points={item.points}
            largura={largura}
            altura={altura}
            cor={traco}
          />
        </G>
      ) : null}

      {/* Aresta fina: separa peça de peça sem virar moldura. */}
      <Polygon points={pontos} fill="none" stroke={borda} strokeWidth={1} />
    </Svg>
  );
}

/**
 * O percurso normalizado dentro da peça — a mesma projeção do detalhe: o maior
 * vão manda nos dois eixos, para a forma do trajeto não esticar.
 */
function TracadoDoPercurso({
  points,
  largura,
  altura,
  cor,
}: {
  points: GeoPoint[];
  largura: number;
  altura: number;
  cor: string;
}) {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const minLon = Math.min(...lons);
  const span = Math.max(Math.max(...lats) - minLat, Math.max(...lons) - minLon, 1e-5);
  const pad = largura * 0.22;
  const util = largura - pad * 2;
  const w = ((Math.max(...lons) - minLon) / span) * util;
  const h = ((Math.max(...lats) - minLat) / span) * util;

  const pts = points
    .map((p) => {
      const x = pad + (util - w) / 2 + ((p.lon - minLon) / span) * util;
      const y = altura / 2 + h / 2 - ((p.lat - minLat) / span) * util;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <Polyline
      points={pts}
      fill="none"
      stroke={cor}
      strokeWidth={4}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}
