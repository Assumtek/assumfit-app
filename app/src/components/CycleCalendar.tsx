import { XStack, YStack } from '@tamagui/stacks';
import React, { useMemo, useState } from 'react';
import { Pressable, type ViewStyle } from 'react-native';

import { COR_DA_FASE } from './CycleRing';
import { Icon } from './Icon';
import { Body, Data } from './ui';
import {
  PHASE_COPY,
  periodLink,
  phaseOn,
  phaseProjected,
  type CyclePhase,
  type LoggedCycle,
} from '../domain/cycle';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Calendário do ciclo, mês a mês.
 *
 * Existe porque "começou hoje" cobre um caso só. Quase sempre a pessoa lembra
 * a data depois — no dia seguinte, na semana seguinte — e um botão que só
 * aceita hoje obriga a mentir a data ou a não registrar.
 *
 * Tocar num dia marca ou desmarca AQUELE dia de menstruação — o modelo por
 * dia da Apple Health e do Flo (benchmark de ago/2026). Dias consecutivos
 * viram um ciclo no domínio (`groupCycles`), e o comprimento da sequência é a
 * duração real do fluxo — o "término" sai de graça: é parar de marcar.
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

/** Diâmetro da cápsula do período: o círculo do dia (30) com folga de 2. */
const CAPSULA = 34;

function hojeChave(): string {
  const d = new Date();
  return chave(d.getFullYear(), d.getMonth(), d.getDate());
}

export function CycleCalendar({
  marcados,
  grupos,
  onToggle,
  busy,
}: {
  /** Cada DIA de menstruação marcado — o modelo por dia da Apple e do Flo. */
  marcados: string[];
  /** Os ciclos agrupados (para pintar as fases). */
  grupos: LoggedCycle[];
  onToggle: (dia: string, jaRegistrado: boolean) => void;
  busy: boolean;
}) {
  const { colors } = useTheme();

  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth());

  const registrados = useMemo(() => new Set(marcados), [marcados]);
  const hoje = hojeChave();

  /*
   A largura da grade é MEDIDA porque a cápsula do período precisa de número,
   não de porcentagem: ela começa no meio de uma célula e termina no meio de
   outra, atravessando a borda entre as duas — e `50%` de um filho absoluto
   não sabe de que largura é a metade.
  */
  const [larguraGrade, setLarguraGrade] = useState(0);
  const ladoCelula = larguraGrade / 7;

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

      <XStack flexWrap="wrap" onLayout={(e) => setLarguraGrade(e.nativeEvent.layout.width)}>
        {celulas.map((dia, i) => {
          if (dia === null) return <YStack key={`v${i}`} style={CELULA} />;

          const k = chave(ano, mes, dia);
          const registrado = registrados.has(k);
          const futuro = k > hoje;

          /*
            A CÁPSULA do período (decisão da fundadora, ago/2026): em vez de
            um anel por dia, um traço contínuo em volta da sequência inteira
            de menstruação — começa arredondado no primeiro dia, segue reto
            pelos dias do meio e fecha no último. A quebra na virada de semana
            é obrigatória: a linha não pode saltar da borda direita da grade
            para a esquerda da linha de baixo.
          */
          const { antes: ligaAntes, depois: ligaDepois } = periodLink(k, registrados, i % 7);
          // A fase de cada dia sai do MESMO cálculo da tela — o passado pela
          // fase real, o futuro E o trecho anterior ao primeiro registro pela
          // PROJEÇÃO: o calendário é a visão principal e pinta o mês INTEIRO.
          const real = futuro ? null : phaseOn(k, grupos);
          const fase = real ?? phaseProjected(k, grupos);

          return (
            <Pressable
              key={k}
              onPress={() => !futuro && !busy && onToggle(k, registrado)}
              disabled={futuro || busy}
              accessibilityRole="button"
              accessibilityState={{ selected: registrado, disabled: futuro }}
              accessibilityLabel={
                `${dia} de ${MESES[mes]}` +
                (registrado ? ', dia de menstruação registrado' : '') +
                (fase ? `, ${PHASE_COPY[fase.phase].label}${futuro ? ', previsão' : ''}` : '')
              }
              // A medida fica no `Pressable`, e não num filho: é ele que ocupa
              // a coluna da grade, e `width: 1/7` num filho de largura
              // automática não sabe de que largura é a fração.
              style={CELULA}
            >
              <>
                {/*
                  A FAIXA do período, preenchida e contínua: ela atravessa a
                  célula inteira nos dias do meio e só arredonda nas pontas do
                  trecho. Era um círculo por dia — cinco discos em fila liam
                  como cinco marcações, não como um período de cinco dias.
                */}
                {registrado && ladoCelula > 0 ? (
                  <YStack
                    position="absolute"
                    height={CAPSULA}
                    top={(ladoCelula - CAPSULA) / 2}
                    left={ligaAntes ? 0 : (ladoCelula - CAPSULA) / 2}
                    right={ligaDepois ? 0 : (ladoCelula - CAPSULA) / 2}
                    borderTopLeftRadius={ligaAntes ? 0 : CAPSULA / 2}
                    borderBottomLeftRadius={ligaAntes ? 0 : CAPSULA / 2}
                    borderTopRightRadius={ligaDepois ? 0 : CAPSULA / 2}
                    borderBottomRightRadius={ligaDepois ? 0 : CAPSULA / 2}
                    style={{ backgroundColor: corDaFase('menstrual', colors.accent) }}
                  />
                ) : null}

                {/*
                  A mancha de fase segue no círculo do dia — mas só onde NÃO
                  há registro: no período quem pinta é a faixa acima, e dois
                  preenchimentos sobrepostos escureceriam as pontas.
                */}
                <YStack
                  width={30}
                  height={30}
                  borderRadius={15}
                  alignItems="center"
                  justifyContent="center"
                  style={
                    fase && !registrado
                      ? { backgroundColor: corDaFase(fase.phase, colors.accent) }
                      : undefined
                  }
                >
                  <Data
                    fontWeight={k === hoje ? '700' : '400'}
                    style={{
                      color: corDoNumero(
                        registrado ? 'menstrual' : (fase?.phase ?? null),
                        futuro,
                        k === hoje,
                        colors,
                      ),
                    }}
                  >
                    {dia}
                  </Data>
                </YStack>

                {k === hoje ? (
                  <YStack width={4} height={4} borderRadius={2} backgroundColor="$foreground" />
                ) : (
                  <YStack width={4} height={4} />
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
  gap: 2,
};

/**
 * A cor da fase no calendário — as MESMAS do anel, em fundo suave.
 *
 * A rampa de opacidade do roxo que morava aqui saiu junto com a decisão de
 * ago/2026 de dar cor própria a cada fase: manter duas linguagens de cor na
 * mesma tela (anel colorido, calendário roxo) faria a pessoa procurar
 * significado numa diferença que não existe.
 *
 * O dia registrado é o único preenchido forte; os demais recebem a cor da
 * fase diluída, para o número continuar legível por cima.
 */
const ALFA_DA_FASE: Record<CyclePhase, number> = {
  menstrual: 0.9,
  ovulatory: 0.35,
  follicular: 0.2,
  luteal: 0.18,
};

export function corDaFase(fase: CyclePhase, _accent?: string): string {
  return comAlfa(COR_DA_FASE[fase], ALFA_DA_FASE[fase]);
}

/** `#E5484D` + 0,2 → `rgba(229,72,77,0.2)`. */
function comAlfa(hex: string, alfa: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alfa})`;
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
  // Sobre o vermelho cheio da menstruação, branco é o que alcança contraste
  // nos dois temas — o ink escuro sumia ali.
  if (fase === 'menstrual') return '#FFFFFF';
  if (fase === 'ovulatory') return colors.text;
  if (futuro) return colors.hairlineStrong;
  if (ehHoje) return colors.text;
  return colors.textFaint;
}
