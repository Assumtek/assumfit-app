import { XStack, YStack } from '@tamagui/stacks';
import React, { useMemo, useState } from 'react';
import { Pressable, type ViewStyle } from 'react-native';

import { Icon } from './Icon';
import { Body, Data } from './ui';
import { PHASE_COPY, phaseOn, type CyclePhase, type LoggedCycle } from '../domain/cycle';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Calendário do ciclo, mês a mês.
 *
 * Existe porque "começou hoje" cobre um caso só. Quase sempre a pessoa lembra
 * a data depois — no dia seguinte, na semana seguinte — e um botão que só
 * aceita hoje obriga a mentir a data ou a não registrar.
 *
 * Tocar num dia marca ou desmarca o INÍCIO da menstruação naquele dia. Não é
 * seleção de intervalo: o que o cálculo precisa é do primeiro dia, e pedir
 * início e fim dobraria o atrito para um dado que a fase nem usa.
 */

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** `YYYY-MM-DD` no fuso LOCAL — `toISOString` viraria o dia à noite. */
function chave(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function hojeChave(): string {
  const d = new Date();
  return chave(d.getFullYear(), d.getMonth(), d.getDate());
}

export function CycleCalendar({
  cycles,
  onToggle,
  busy,
}: {
  cycles: LoggedCycle[];
  onToggle: (dia: string, jaRegistrado: boolean) => void;
  busy: boolean;
}) {
  const { colors } = useTheme();

  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth());

  const registrados = useMemo(() => new Set(cycles.map((c) => c.startedAt)), [cycles]);
  const hoje = hojeChave();

  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  // Espaços em branco antes do dia 1, para o mês começar no dia da semana certo.
  const celulas: (number | null)[] = [
    ...Array.from({ length: primeiroDiaSemana }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ];

  const mover = (delta: number) => {
    const d = new Date(ano, mes + delta, 1);
    // Não deixa navegar para o futuro: registrar dia que não aconteceu jogaria
    // a previsão inteira para frente.
    if (d > new Date(agora.getFullYear(), agora.getMonth(), 1)) return;
    setAno(d.getFullYear());
    setMes(d.getMonth());
  };

  const noFuturo = ano === agora.getFullYear() && mes === agora.getMonth();

  return (
    <YStack marginTop="$md" marginBottom="$lg">
      <XStack alignItems="center" justifyContent="space-between" marginBottom="$md">
        <Pressable onPress={() => mover(-1)} accessibilityRole="button" accessibilityLabel="Mês anterior" hitSlop={12}>
          <Icon name="back" size={18} color={colors.text} />
        </Pressable>
        <Body color="$foreground">
          {MESES[mes]} {ano !== agora.getFullYear() ? ano : ''}
        </Body>
        <Pressable
          onPress={() => mover(1)}
          disabled={noFuturo}
          accessibilityRole="button"
          accessibilityLabel="Próximo mês"
          hitSlop={12}
        >
          <Icon name="arrowRight" size={18} color={noFuturo ? colors.hairlineStrong : colors.text} />
        </Pressable>
      </XStack>

      <XStack>
        {SEMANA.map((d, i) => (
          <Data key={i} flex={1} textAlign="center" fontSize={11} marginBottom="$xs">
            {d}
          </Data>
        ))}
      </XStack>

      <XStack flexWrap="wrap">
        {celulas.map((dia, i) => {
          if (dia === null) return <YStack key={`v${i}`} style={CELULA} />;

          const k = chave(ano, mes, dia);
          const registrado = registrados.has(k);
          const futuro = k > hoje;
          // A fase de cada dia sai do MESMO cálculo da tela — o calendário
          // mostra o ciclo, não uma segunda versão dele.
          const estado = futuro ? null : phaseOn(k, cycles);

          return (
            <Pressable
              key={k}
              onPress={() => !futuro && !busy && onToggle(k, registrado)}
              disabled={futuro || busy}
              accessibilityRole="button"
              accessibilityState={{ selected: registrado, disabled: futuro }}
              accessibilityLabel={
                `${dia} de ${MESES[mes]}` +
                (registrado ? ', início de menstruação registrado' : '') +
                (estado ? `, ${PHASE_COPY[estado.phase].label}` : '')
              }
              // A medida fica no `Pressable`, e não num filho: é ele que ocupa
              // a coluna da grade, e `width: 1/7` num filho de largura
              // automática não sabe de que largura é a fração.
              style={CELULA}
            >
              <>
                <Data color={futuro ? '$borderStrong' : k === hoje ? '$foreground' : '$faint'}>
                  {dia}
                </Data>
              {/*
                Dois sinais diferentes, de propósito: o ponto cheio é o dia que
                VOCÊ registrou; o traço é a fase que o cálculo deduziu. Misturar
                os dois faria previsão parecer registro.
              */}
                {registrado ? (
                  <YStack width={5} height={5} borderRadius={3} backgroundColor="$primary" />
                ) : estado ? (
                  <YStack
                    width={12}
                    height={2}
                    borderRadius={1}
                    style={{ backgroundColor: corDaFase(estado.phase, colors) }}
                  />
                ) : (
                  <YStack width={5} height={5} />
                )}
              </>
            </Pressable>
          );
        })}
      </XStack>
    </YStack>
  );
}

/** A medida de uma célula da grade — sete por linha, quadrada. */
const CELULA: ViewStyle = {
  width: `${100 / 7}%`,
  aspectRatio: 1,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
};

/**
 * A fase menstrual usa o acento; as demais, tons neutros.
 *
 * Um acento por tela é regra do sistema, e aqui ele pertence ao dado que a
 * pessoa registrou. Pintar quatro fases com quatro cores transformaria o
 * calendário num gráfico decorativo.
 */
function corDaFase(fase: CyclePhase, colors: { accentSoft: string; hairlineStrong: string; hairline: string }) {
  if (fase === 'menstrual') return colors.accentSoft;
  if (fase === 'ovulatory') return colors.hairlineStrong;
  return colors.hairline;
}
