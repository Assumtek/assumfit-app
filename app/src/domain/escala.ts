/**
 * A conta de um slider de escala inteira.
 *
 * Mora no domínio porque é aritmética com bordas, e borda de slider é onde o
 * defeito se esconde: um pixel além da trilha não pode virar 11, e o primeiro
 * pixel não pode virar 0 numa escala que começa em 1.
 *
 * Existe porque a escala de esforço percebido andava de dois em dois, e um
 * testador pediu o meio: "quanto este treino puxou está de 2 em 2, seria legal
 * ter um slider" (Leonardo, 25/08/2026). Ele tem razão de método: a escala de
 * Borg CR10 é de UM em um, e forçar o par empurra a resposta para o número
 * vizinho em vez de registrar o que a pessoa sentiu.
 */

export type FaixaDaEscala = { minimo: number; maximo: number };

/**
 * O valor inteiro correspondente a uma posição na trilha.
 *
 * `x` e `largura` em pontos de tela. Largura não positiva devolve o mínimo, e
 * não `NaN`: layout que ainda não aconteceu não pode produzir valor inválido.
 */
export function valorDaPosicao(x: number, largura: number, faixa: FaixaDaEscala): number {
  const { minimo, maximo } = faixa;
  if (largura <= 0 || maximo <= minimo) return minimo;
  const fracao = Math.max(0, Math.min(1, x / largura));
  return Math.round(minimo + fracao * (maximo - minimo));
}

/**
 * A posição, de 0 a 1, em que o marcador de um valor se apoia.
 *
 * O inverso da função acima, e usada para desenhar. Valor fora da faixa é
 * grampeado: o marcador nunca sai da trilha, mesmo com dado velho ou vindo do
 * servidor com outra escala.
 */
export function fracaoDoValor(valor: number, faixa: FaixaDaEscala): number {
  const { minimo, maximo } = faixa;
  if (maximo <= minimo) return 0;
  const dentro = Math.max(minimo, Math.min(maximo, valor));
  return (dentro - minimo) / (maximo - minimo);
}

/**
 * As marcas que a régua desenha por baixo do slider.
 *
 * O passo precisa DIVIDIR a faixa, senão a última marca fica a uma distância
 * diferente das outras e a régua mente sobre o espaçamento. Era o caso de 1 a
 * 10 de dois em dois: saía 1, 3, 5, 7, 9 e um 10 acrescentado no fim, colado no
 * 9, enquanto a régua os desenhava igualmente espaçados. O valor 8 aparecia em
 * cima do 9, e um testador leu isso como o slider estar quebrado (Leonardo,
 * 29/08/2026: "funciona mas está com um comportamento estranho").
 *
 * Vence o MENOR passo que divide a faixa e cabe em seis marcas: 1 a 10 vira 1,
 * 4, 7, 10, com as duas pontas presentes e todos os intervalos iguais.
 */
const MAXIMO_DE_MARCAS = 6;

export function marcasDaEscala(faixa: FaixaDaEscala): number[] {
  const { minimo, maximo } = faixa;
  const extensao = maximo - minimo;
  if (extensao <= 0) return [minimo];

  let passo = extensao;
  for (let p = 1; p <= extensao; p++) {
    if (extensao % p !== 0) continue;
    if (extensao / p + 1 <= MAXIMO_DE_MARCAS) {
      passo = p;
      break;
    }
  }

  const marcas: number[] = [];
  for (let v = minimo; v <= maximo; v += passo) marcas.push(v);
  return marcas;
}
