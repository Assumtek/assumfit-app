import { XStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';

import { Data } from './ui';
import { Pill } from './ui';

/**
 * O seletor de período, um só para todas as telas.
 *
 * Cada tela tinha a própria janela escrita no código, e nenhuma dizia por quê:
 * pressão mostrava 7 dias, atividade 7, refeições 7 ou 30, e as demais o dia.
 * O mesmo controle em todas transforma cada tela em histórico e poupa a
 * pergunta "por que aqui só tem uma semana?".
 *
 * Os rótulos são de uma letra (S, M, A), como no app Saúde: a pill fica
 * pequena, cabem quatro sem apertar, e o rótulo de acessibilidade diz por
 * extenso, que é onde a palavra importa.
 */
export type Periodo = { dias: number; letra: string; nome: string };

export const PERIODOS: Record<'semana' | 'mes' | 'trimestre' | 'ano', Periodo> = {
  semana: { dias: 7, letra: 'S', nome: 'Últimos 7 dias' },
  mes: { dias: 30, letra: 'M', nome: 'Últimos 30 dias' },
  trimestre: { dias: 90, letra: '3M', nome: 'Últimos 3 meses' },
  ano: { dias: 365, letra: 'A', nome: 'Último ano' },
};

export function PeriodTabs({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: Periodo[];
  valor: number;
  onChange: (dias: number) => void;
}) {
  return (
    <XStack gap="$sm" marginBottom="$md">
      {opcoes.map((p) => {
        const ativo = p.dias === valor;
        return (
          <Pressable
            key={p.dias}
            onPress={() => onChange(p.dias)}
            accessibilityRole="button"
            accessibilityLabel={p.nome}
            accessibilityState={{ selected: ativo }}
          >
            <Pill variant="control" muted={!ativo}>
              <Data color={ativo ? '$foreground' : '$mutedForeground'}>{p.letra}</Data>
            </Pill>
          </Pressable>
        );
      })}
    </XStack>
  );
}

/** O nome do período escolhido, para o rótulo da seção. */
export function nomeDoPeriodo(dias: number): string {
  const p = Object.values(PERIODOS).find((x) => x.dias === dias);
  return p ? p.nome : `Últimos ${dias} dias`;
}
