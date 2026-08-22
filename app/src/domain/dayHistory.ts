import { isoHoje } from './water';
import type { Ponto } from './series';

/**
 * O histórico por dia das telas de saúde.
 *
 * De onde vem, e por que não da pulseira: a memória dela guarda sete dias e
 * cobra uma consulta serial por dia — trocar de dia custaria dezenas de
 * segundos. O servidor devolve trinta dias de pontos horários numa requisição
 * só, e fatiar localmente é instantâneo.
 *
 * O preço é a resolução: hora a hora, enquanto a pulseira mede a cada cinco
 * minutos. Para o dia de HOJE isso seria um retrocesso, e por isso hoje
 * continua vindo da pulseira — o histórico serve ao que já passou, onde a
 * granularidade de hora é o que interessa e o resto é ruído.
 */

/** Um dia no calendário local, como `2026-08-18`. */
export type DiaIso = string;

/**
 * Os últimos `quantos` dias, do mais antigo ao de hoje.
 *
 * Datas locais, montadas dia a dia com `setDate` em vez de subtrair 24 h em
 * milissegundos: nos dias de mudança de horário o dia não tem 24 h, e a
 * subtração pularia ou repetiria uma data.
 */
export function ultimosDias(quantos: number, hoje = new Date()): DiaIso[] {
  const dias: DiaIso[] = [];
  for (let i = quantos - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    dias.push(isoHoje(d));
  }
  return dias;
}

/** O dia de um instante, no calendário de quem está com o celular. */
export function diaDe(at: number | string): DiaIso {
  return isoHoje(new Date(at));
}

/**
 * As amostras de um dia, extraídas de uma série horária.
 *
 * O corte é por DIA LOCAL e não por janela de 24 h a partir de agora: quem
 * escolhe "16 de agosto" quer o dia inteiro daquela data, da meia-noite à
 * meia-noite, e não as 24 h que terminam no mesmo horário de hoje.
 */
export function pontosDoDia<T extends { hour: string }>(
  serie: T[],
  dia: DiaIso,
  valor: (p: T) => number | null): Ponto[] {
  const pontos: Ponto[] = [];
  for (const p of serie) {
    if (diaDe(p.hour) !== dia) continue;
    const v = valor(p);
    // `null` é hora sem medição, não zero: a pulseira alterna janelas medidas e
    // vazias, e desenhar zero produziria quedas que nunca aconteceram.
    if (v == null || !Number.isFinite(v)) continue;
    const at = new Date(p.hour).getTime();
    if (Number.isFinite(at)) pontos.push({ at, value: v });
  }
  return pontos.sort((a, b) => a.at - b.at);
}

/** Quais dias têm alguma medição da grandeza — o seletor apaga os vazios. */
export function diasComDado<T extends { hour: string }>(
  serie: T[],
  valor: (p: T) => number | null): Set<DiaIso> {
  const dias = new Set<DiaIso>();
  for (const p of serie) {
    const v = valor(p);
    if (v == null || !Number.isFinite(v)) continue;
    dias.add(diaDe(p.hour));
  }
  return dias;
}

/** `2026-08-16` → `sáb 16`. O rótulo curto da tira de dias. */
export function rotuloDoDia(dia: DiaIso, hoje = isoHoje()): string {
  if (dia === hoje) return 'hoje';
  const [ano, mes, d] = dia.split('-').map(Number);
  const data = new Date(ano, mes - 1, d);
  const semana = data.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${semana} ${String(d).padStart(2, '0')}`;
}
