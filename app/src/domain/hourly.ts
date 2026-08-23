/**
 * O dia em 24 fatias, e uma semântica só.
 *
 * Havia duas convivendo no mesmo array e nenhuma declarada: a memória da
 * pulseira entrega DELTAS ("nesta fatia foram 320 passos") e o evento ao vivo
 * entrega o ACUMULADO do dia ("você está com 6.412"). Empilhados juntos, o
 * gráfico ganhava uma barra gigante ao lado de barras normais depois de cada
 * sincronização, e a curva "acumulada" da tela de atividade subia e descia.
 *
 * Aqui a regra é uma: **fatia guarda o que aconteceu NAQUELA hora**. Quem
 * recebe acumulado converte para delta antes de entrar (`deltaDoAcumulado`).
 *
 * Calorias vêm junto porque o firmware as manda na mesma fatia, e eram
 * descartadas na ponte: o app estimava caloria a partir do passo enquanto o
 * aparelho já sabia a resposta.
 */

export type FatiaDoDia = { hora: number; passos: number; kcal: number };

export const HORAS_DO_DIA = 24;

export function fatiasVazias(): FatiaDoDia[] {
  return Array.from({ length: HORAS_DO_DIA }, (_, hora) => ({ hora, passos: 0, kcal: 0 }));
}

/**
 * Funde as fatias da memória com o que já havia.
 *
 * Por hora fica o MAIOR dos dois: a memória tem grão de cinco minutos mas
 * chega atrasada, e o que passou ao vivo depois dela não pode ser apagado por
 * uma consulta que já estava velha quando começou.
 */
export function comFatiasDaMemoria(
  atuais: FatiaDoDia[],
  amostras: { at: number; steps: number; kcal?: number }[],
): FatiaDoDia[] {
  const daMemoria = fatiasVazias();
  for (const a of amostras) {
    if (!Number.isFinite(a.at) || a.at <= 0) continue;
    const hora = new Date(a.at).getHours();
    if (hora < 0 || hora >= HORAS_DO_DIA) continue;
    daMemoria[hora].passos += Math.max(0, a.steps);
    daMemoria[hora].kcal += Math.max(0, a.kcal ?? 0);
  }
  const base = normalizar(atuais);
  return daMemoria.map((f, i) => ({
    hora: i,
    passos: Math.max(f.passos, base[i].passos),
    kcal: Math.max(f.kcal, base[i].kcal),
  }));
}

/**
 * O que a leitura ao vivo acrescenta à hora corrente.
 *
 * `anterior` é o último acumulado visto NESTA sessão. Sem ele (primeiro evento
 * depois de abrir o app) não se sabe quanto do acumulado é desta hora, e o
 * certo é não somar nada: inventar aqui produziria uma barra com o dia inteiro
 * dentro dela.
 */
export function deltaDoAcumulado(anterior: number | null, agora: number | null): number {
  if (agora == null || !Number.isFinite(agora)) return 0;
  if (anterior == null || !Number.isFinite(anterior)) return 0;
  const d = agora - anterior;
  // Contador que ANDOU PARA TRÁS é virada de dia ou troca de aparelho, não
  // passo negativo. Zero, e a próxima leitura vira a nova referência.
  return d > 0 ? d : 0;
}

export function comDeltaNaHora(
  atuais: FatiaDoDia[],
  hora: number,
  passos: number,
  kcal: number,
): FatiaDoDia[] {
  if (passos <= 0 && kcal <= 0) return atuais;
  const base = normalizar(atuais);
  if (hora < 0 || hora >= HORAS_DO_DIA) return base;
  base[hora] = {
    hora,
    passos: base[hora].passos + Math.max(0, passos),
    kcal: base[hora].kcal + Math.max(0, kcal),
  };
  return base;
}

/** Aceita fatia antiga (ou faltando) sem quebrar a tela. */
export function normalizar(fatias: FatiaDoDia[] | undefined | null): FatiaDoDia[] {
  const base = fatiasVazias();
  if (!Array.isArray(fatias)) return base;
  for (const f of fatias) {
    if (!f || typeof f.hora !== 'number') continue;
    if (f.hora < 0 || f.hora >= HORAS_DO_DIA) continue;
    base[f.hora] = {
      hora: f.hora,
      passos: Math.max(0, Number(f.passos) || 0),
      kcal: Math.max(0, Number(f.kcal) || 0),
    };
  }
  return base;
}

export function totalDoDia(fatias: FatiaDoDia[]): { passos: number; kcal: number } {
  return normalizar(fatias).reduce(
    (s, f) => ({ passos: s.passos + f.passos, kcal: s.kcal + f.kcal }),
    { passos: 0, kcal: 0 },
  );
}

/** A curva acumulada, para o gráfico de "cheguei à meta?". */
export function acumuladoAteAgora(fatias: FatiaDoDia[], horaAtual: number): number[] {
  const base = normalizar(fatias);
  const ate = Math.max(0, Math.min(HORAS_DO_DIA - 1, horaAtual));
  let soma = 0;
  return base.slice(0, ate + 1).map((f) => (soma += f.passos));
}

export type Barra = { label: string; value: number };

/**
 * As barras do dia, da primeira hora com movimento até agora.
 *
 * Começar à meia-noite encheria metade do gráfico com o sono; começar sempre
 * às 6h esconderia quem trabalha de madrugada. Quem decide é o dado.
 */
export function barrasDoDia(
  fatias: FatiaDoDia[],
  horaAtual: number,
  campo: 'passos' | 'kcal' = 'kcal',
): Barra[] {
  const base = normalizar(fatias);
  const ate = Math.max(0, Math.min(HORAS_DO_DIA - 1, horaAtual));
  const primeira = base.findIndex((f) => f.passos > 0 || f.kcal > 0);
  if (primeira < 0) return [];
  const de = Math.min(primeira, ate);
  return base
    .slice(de, ate + 1)
    .map((f) => ({ label: `${String(f.hora).padStart(2, '0')}h`, value: Math.round(f[campo]) }));
}

/** A hora mais ativa do dia, para a frase que acompanha o gráfico. */
export function horaMaisAtiva(fatias: FatiaDoDia[]): FatiaDoDia | null {
  const base = normalizar(fatias).filter((f) => f.passos > 0);
  if (base.length === 0) return null;
  return base.reduce((a, b) => (b.passos > a.passos ? b : a));
}
