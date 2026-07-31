import { XStack, YStack } from '@tamagui/stacks';
import React, { useMemo, useState } from 'react';
import { Pressable, type ViewStyle } from 'react-native';

import { Icon } from './Icon';
import { Body, Data } from './ui';
import { PHASE_COPY, phaseOn, phaseProjected, type CyclePhase, type LoggedCycle } from '../domain/cycle';
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
    // OLHAR o futuro pode (a projeção pinta as fases; as células continuam
    // intocáveis — registrar dia que não aconteceu seguiria proibido). O teto
    // de seis meses existe porque projeção além disso é chute vestido de dado.
    if (d > new Date(agora.getFullYear(), agora.getMonth() + 6, 1)) return;
    setAno(d.getFullYear());
    setMes(d.getMonth());
  };

  const noTeto =
    ano === agora.getFullYear() + Math.floor((agora.getMonth() + 6) / 12) &&
    mes === (agora.getMonth() + 6) % 12;

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
          disabled={noTeto}
          accessibilityRole="button"
          accessibilityLabel="Próximo mês"
          hitSlop={12}
        >
          <Icon name="arrowRight" size={18} color={noTeto ? colors.hairlineStrong : colors.text} />
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
          // A fase de cada dia sai do MESMO cálculo da tela — o passado pela
          // fase real, o futuro E o trecho anterior ao primeiro registro pela
          // PROJEÇÃO: o calendário é a visão principal e pinta o mês INTEIRO.
          const real = futuro ? null : phaseOn(k, cycles);
          const fase = real ?? phaseProjected(k, cycles);

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
                (fase ? `, ${PHASE_COPY[fase.phase].label}${futuro ? ', previsão' : ''}` : '')
              }
              // A medida fica no `Pressable`, e não num filho: é ele que ocupa
              // a coluna da grade, e `width: 1/7` num filho de largura
              // automática não sabe de que largura é a fração.
              style={CELULA}
            >
              <>
                {/*
                  O DIA INTEIRO carrega a fase: a mancha no círculo do número.
                  A tira de 3px que ficava embaixo não diferenciava quatro
                  intensidades — área pequena demais para rampa de opacidade
                  ler. No círculo de 30px, lê. O anel marca o HOJE.
                */}
                <YStack
                  width={30}
                  height={30}
                  borderRadius={15}
                  borderWidth={k === hoje ? 1.5 : 0}
                  borderColor={k === hoje ? '$foreground' : 'transparent'}
                  alignItems="center"
                  justifyContent="center"
                  style={fase ? { backgroundColor: corDaFase(fase.phase, colors.accent) } : undefined}
                >
                  <Data style={{ color: corDoNumero(fase?.phase ?? null, futuro, k === hoje, colors) }}>
                    {dia}
                  </Data>
                </YStack>
                {/*
                  O ponto cheio continua sendo o ÚNICO glifo de registro — a
                  mancha é fase deduzida (no futuro e antes do primeiro
                  registro, projetada). Misturar faria previsão virar fato.
                */}
                {registrado ? (
                  <YStack width={5} height={5} borderRadius={3} backgroundColor="$primary" />
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
 * Quatro fases, UM acento: o mesmo roxo em quatro intensidades.
 *
 * Um acento por tela é regra do sistema — quatro matizes transformariam o
 * calendário em gráfico decorativo. A rampa de opacidade mantém a cor única e
 * ainda ordena as fases por "peso" fisiológico: menstruação mais forte,
 * ovulação em seguida, folicular e lútea como fundo.
 */
// Sobre a MANCHA do dia inteiro (30px), estes degraus separam as quatro fases
// de relance — na tira de 3px de antes, nenhum degrau separava.
const OPACIDADE_DA_FASE: Record<CyclePhase, number> = {
  menstrual: 0.9,
  ovulatory: 0.5,
  follicular: 0.24,
  luteal: 0.1,
};

export function corDaFase(fase: CyclePhase, accent: string): string {
  const r = parseInt(accent.slice(1, 3), 16);
  const g = parseInt(accent.slice(3, 5), 16);
  const b = parseInt(accent.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${OPACIDADE_DA_FASE[fase]})`;
}

/**
 * O número precisa sobreviver à mancha embaixo dele.
 *
 * Menstruação (0,9) é praticamente o acento puro nos dois temas → o ink
 * escuro da marca, a mesma regra do texto do Button. Ovulação (0,5) resolve
 * para roxo médio-claro no claro e médio-escuro no escuro → o foreground do
 * tema serve nos dois. As fases fracas mantêm a lógica normal da grade.
 */
function corDoNumero(
  fase: CyclePhase | null,
  futuro: boolean,
  ehHoje: boolean,
  colors: { text: string; textFaint: string; hairlineStrong: string },
): string {
  if (fase === 'menstrual') return '#0E0A22';
  if (fase === 'ovulatory') return colors.text;
  if (futuro) return colors.hairlineStrong;
  if (ehHoje) return colors.text;
  return colors.textFaint;
}
