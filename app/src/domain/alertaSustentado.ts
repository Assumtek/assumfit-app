/**
 * Um aviso de atenção precisa de mais de uma medição.
 *
 * O batimento já exigia cinco minutos acima da faixa antes de avisar; pressão e
 * oxigênio avisavam na PRIMEIRA leitura fora dela. Um testador recebeu "sua
 * pressão merece atenção" e abriu o app numa pressão ótima, 110 por 75
 * (Leonardo, 24/08/2026).
 *
 * Duas razões para exigir sustentação, e as duas valem mais que a pressa:
 *
 * 1. **O sensor é óptico e estima.** A própria tela diz que a pressão daqui
 *    serve para acompanhar tendência e que a braçadeira é a referência.
 *    Alarmar a partir de uma estimativa isolada contradiz o que o produto
 *    afirma duas telas adiante.
 * 2. **Alarme falso ensina a ignorar alarme.** Num app que a pessoa usa todo
 *    dia, o segundo aviso errado já custa a confiança no terceiro, que pode
 *    ser o certo.
 */

export type Medicao = { at: number; alerta: boolean };

export type CriterioDeAtencao = {
  /** Quantas medições seguidas fora da faixa antes de avisar. */
  minimo: number;
  /** Janela em que essas medições precisam caber, em milissegundos. */
  janelaMs: number;
};

/**
 * As medições recentes sustentam um aviso?
 *
 * Conta as ÚLTIMAS medições, da mais nova para trás: a sequência precisa ser
 * ininterrupta. Uma leitura normal no meio zera a contagem, porque é
 * exatamente ela que diz que o sinal anterior não se manteve.
 */
export function atencaoSustentada(
  medicoes: Medicao[],
  criterio: CriterioDeAtencao,
  agora: number,
): boolean {
  const recentes = medicoes
    .filter((m) => Number.isFinite(m.at) && agora - m.at <= criterio.janelaMs)
    .sort((a, b) => b.at - a.at);
  if (recentes.length < criterio.minimo) return false;
  return recentes.slice(0, criterio.minimo).every((m) => m.alerta);
}

/**
 * As réguas por métrica.
 *
 * A pressão exige três medições em duas horas porque ela é medida em janelas
 * agendadas e esparsas; o oxigênio exige duas em vinte minutos, que é o ritmo
 * das medições dele. Nenhuma das duas avisa por uma leitura só.
 */
export const CRITERIOS: Record<'pressao' | 'spo2', CriterioDeAtencao> = {
  pressao: { minimo: 3, janelaMs: 2 * 60 * 60 * 1000 },
  spo2: { minimo: 2, janelaMs: 20 * 60 * 1000 },
};
