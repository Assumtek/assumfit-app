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
 * Todas as posições quando a escala é curta; de duas em duas quando ela passa
 * de oito, para as marcas não virarem um borrão. É desenho, não dado: o valor
 * escolhido continua sendo qualquer inteiro da faixa.
 */
export function marcasDaEscala(faixa: FaixaDaEscala): number[] {
  const { minimo, maximo } = faixa;
  const total = maximo - minimo + 1;
  const passo = total > 8 ? 2 : 1;
  const marcas: number[] = [];
  for (let v = minimo; v <= maximo; v += passo) marcas.push(v);
  if (marcas[marcas.length - 1] !== maximo) marcas.push(maximo);
  return marcas;
}
