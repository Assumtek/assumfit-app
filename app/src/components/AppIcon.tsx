import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Icon, type IconName } from './Icon';
import { BRAND_MARKS, type BrandMark } from '../assets/brandMarks';

/**
 * O ícone de um app de terceiros, como aparece no celular.
 *
 * Pedido da fundadora (22/08): na lista de avisos no pulso, o app se reconhece
 * pelo ícone de verdade, não por um glifo que o lembre. O iOS não deixa um app
 * ler o ícone de outro, então eles vão embarcados: logotipo oficial de
 * `simple-icons` (domínio público), branco sobre quadrado arredondado na cor
 * da marca — a convenção de ícone de app.
 *
 * É a ÚNICA exceção ao sistema de ícones monolinear (CLAUDE.md, regra 6), e é
 * exceção por natureza: a marca aqui é de outra empresa, e o valor está em
 * ela ser reconhecida como É. Quem não tem logotipo no pacote (telefone, SMS,
 * Skype…) leva a cor da marca com um glifo ou a inicial — nunca um desenho
 * nosso fingindo ser o logotipo.
 */
export type AppMark =
  | { kind: 'brand'; mark: BrandMark; glyphColor?: string }
  | { kind: 'glyph'; hex: string; icon: IconName }
  | { kind: 'letter'; hex: string; letter: string };

export function AppIcon({ mark, size = 28 }: { mark: AppMark; size?: number }) {
  const radius = size * 0.22;
  const inner = size * 0.58;
  const bg = mark.kind === 'brand' ? BRAND_MARKS[mark.mark].hex : mark.hex;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {mark.kind === 'brand' ? (
        <Svg width={inner} height={inner} viewBox="0 0 24 24">
          <Path d={BRAND_MARKS[mark.mark].path} fill={mark.glyphColor ?? '#FFFFFF'} />
        </Svg>
      ) : mark.kind === 'glyph' ? (
        <Icon name={mark.icon} size={inner} color="#FFFFFF" strokeWidth={2.2} />
      ) : (
        <Text style={{ color: '#FFFFFF', fontSize: inner * 0.85, fontWeight: '700' }}>{mark.letter}</Text>
      )}
    </View>
  );
}
