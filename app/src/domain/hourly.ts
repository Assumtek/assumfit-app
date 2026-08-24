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
 * A caloria de uma fatia, na unidade certa ou estimada.
 *
 * O firmware não promete unidade: o mesmo campo já chegou em kcal e em cal
 * (`activityEstimates.caloriasDoDia` existe por isso, depois de um testador ver
 * "886.149 kcal"). Quando trouxemos a caloria por fatia, o saneamento não veio
 * junto, e o gráfico de movimento por hora apareceu com escala de 30.838
 * (Leonardo, 24/08/2026): trinta mil calorias numa hora.
 *
 * A régua é a mesma do dia: caloria por passo entre 0,015 e 0,15. Fora disso,
 * tenta como cal e, se ainda não couber, estima pelo passo, que é o número que
 * nunca mente por três ordens de grandeza.
 */
const KCAL_POR_PASSO_MIN = 0.015;
const KCAL_POR_PASSO_MAX = 0.15;
const KCAL_POR_PASSO = 0.04;

export function caloriaSaneada(bruta: number | null | undefined, passos: number): number {
  const p = Math.max(0, passos);
  if (p <= 0) return 0;
  if (bruta != null && Number.isFinite(bruta) && bruta > 0) {
    for (const fator of [1, 1 / 1000]) {
      const kcal = bruta * fator;
      const porPasso = kcal / p;
      if (porPasso >= KCAL_POR_PASSO_MIN && porPasso <= KCAL_POR_PASSO_MAX) return kcal;
    }
  }
  return p * KCAL_POR_PASSO;
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
    daMemoria[hora].kcal += caloriaSaneada(a.kcal, a.steps);
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

/**
 * A curva acumulada, para o gráfico de "cheguei à meta?".
 *
 * `total` é o número grande da tela, ancorado no contador do aparelho. Sem
 * ele, a curva termina na soma das fatias, e as duas coisas divergem na mesma
 * tela: o topo dizia 9.896 passos e a curva parava antes (relato do Bruno,
 * 23/08). Duas verdades lado a lado é pior do que qualquer uma das duas.
 *
 * Falta de fatia é o caso comum: a memória da pulseira chega atrasada, e o que
 * o contador tem a mais aconteceu recentemente, então entra na hora corrente.
 * Sobra é raro (fatia de outro dia, contador reiniciado) e aí a curva é
 * reescalada para terminar no total, preservando a forma do dia.
 */
export function acumuladoAteAgora(
  fatias: FatiaDoDia[],
  horaAtual: number,
  total?: number | null,
): number[] {
  const base = normalizar(fatias);
  const ate = Math.max(0, Math.min(HORAS_DO_DIA - 1, horaAtual));
  let soma = 0;
  const curva = base.slice(0, ate + 1).map((f) => (soma += f.passos));
  if (total == null || !Number.isFinite(total) || total < 0 || curva.length === 0) return curva;

  const fim = curva[curva.length - 1];
  if (fim === total) return curva;
  if (fim === 0) {
    // Nenhuma fatia ainda: o dia inteiro está no contador, e a curva sobe de
    // uma vez na hora corrente. Distribuí-lo pelas horas seria inventar.
    curva[curva.length - 1] = total;
    return curva;
  }
  if (total > fim) {
    curva[curva.length - 1] = total;
    return curva;
  }
  const fator = total / fim;
  return curva.map((v) => Math.round(v * fator));
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

/**
 * Os rótulos do eixo da curva acumulada.
 *
 * Eram fixos ("06h, 12h, 18h, 22h") enquanto a curva ia da meia-noite até
 * AGORA: às duas da tarde, o gráfico terminava sob um rótulo que dizia 22h. O
 * eixo tem que descrever os dados que existem, não o dia inteiro.
 */
export function rotulosDoAcumulado(horaAtual: number, quantos = 4): string[] {
  const ate = Math.max(0, Math.min(HORAS_DO_DIA - 1, horaAtual));
  if (ate === 0) return ['00h'];
  const passo = ate / (quantos - 1);
  return Array.from({ length: quantos }, (_, i) =>
    `${String(Math.round(i * passo)).padStart(2, '0')}h`,
  );
}

/**
 * As fatias do firmware são delta ou acumulado? A série responde.
 *
 * O cabeçalho do fabricante chama o campo de `totalStepCount`, "总步数", total
 * de passos, sem dizer total DE QUÊ: da fatia ou do dia até ali. Nós assumimos
 * delta e somamos, e o efeito apareceu no pulso de quem testou: 10.000 passos
 * na nossa tela contra 2.147 no app do fabricante, quase cinco vezes mais.
 * Somar uma série acumulada dá aproximadamente metade do número de fatias
 * vezes o total, que é a ordem exata do erro relatado.
 *
 * A decisão não pode depender de fé no cabeçalho, então ela é medida:
 *
 * - Série **não decrescente** cuja soma passa folgadamente do último valor só
 *   acontece quando cada ponto já contém os anteriores. Deltas reais sobem e
 *   descem conforme a pessoa anda e para.
 * - Na dúvida, delta, que é a leitura que NUNCA infla: interpretar acumulado
 *   como delta erraria para cima, e num app de saúde o erro que mente para
 *   melhor é o pior dos dois.
 */
export type ModoDaSerie = 'delta' | 'acumulado';

export function modoDaSerie(amostras: { steps: number }[]): ModoDaSerie {
  const passos = amostras.map((a) => a.steps).filter((v) => Number.isFinite(v));
  if (passos.length < 2) return 'delta';
  const naoDecrescente = passos.every((v, i) => i === 0 || v >= passos[i - 1]);
  if (!naoDecrescente) return 'delta';
  const soma = passos.reduce((s, v) => s + v, 0);
  const ultimo = passos[passos.length - 1];
  return soma > ultimo * 1.25 ? 'acumulado' : 'delta';
}

/**
 * Converte a série para DELTAS, qualquer que seja o formato de origem.
 *
 * Acumulado vira diferença entre pontos consecutivos, com o primeiro ponto
 * valendo ele mesmo (o que aconteceu desde a meia-noite até a primeira fatia).
 * Contador que anda para trás vale zero, não passo negativo.
 */
export function comoDeltas<T extends { steps: number; kcal?: number }>(amostras: T[]): T[] {
  if (modoDaSerie(amostras) === 'delta') return amostras;
  let anteriorPassos = 0;
  let anteriorKcal = 0;
  return amostras.map((a) => {
    const passos = Math.max(0, a.steps - anteriorPassos);
    const kcal = Math.max(0, (a.kcal ?? 0) - anteriorKcal);
    anteriorPassos = a.steps;
    anteriorKcal = a.kcal ?? anteriorKcal;
    return { ...a, steps: passos, kcal };
  });
}

/**
 * O total do dia, com o contador do aparelho como ÂNCORA.
 *
 * O contador ao vivo é o mesmo número que o app do fabricante mostra, e é a
 * referência: a memória serve para preencher o dia quando ele ainda não chegou
 * (app aberto de manhã, antes do primeiro evento), não para corrigi-lo para
 * cima. Era exatamente isso que a soma fazia, e por isso vencia sempre.
 */
export function totalDoDiaComAncora(
  fatias: FatiaDoDia[],
  contadorDoAparelho: number | null | undefined,
): number {
  const daMemoria = totalDoDia(fatias).passos;
  if (contadorDoAparelho == null || !Number.isFinite(contadorDoAparelho)) return daMemoria;
  if (contadorDoAparelho <= 0) return daMemoria;
  return contadorDoAparelho;
}

/**
 * Converte para ACUMULADO, que é o formato que o servidor espera.
 *
 * O resumo diário toma `max(steps)` do dia, e o comentário do serviço diz por
 * quê: um contador acumulado tem no máximo o total do dia. Enviar deltas para
 * lá guarda a MAIOR FATIA como se fosse o dia inteiro, o que subestima sem
 * nenhum sintoma visível, o oposto do erro que a tela mostrava.
 *
 * Passa por `comoDeltas` antes, então funciona qualquer que seja o formato de
 * origem.
 */
export function comoAcumulado<T extends { steps: number }>(amostras: T[]): T[] {
  let soma = 0;
  return comoDeltas(amostras).map((a) => {
    soma += Math.max(0, a.steps);
    return { ...a, steps: soma };
  });
}
