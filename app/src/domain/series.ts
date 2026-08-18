/**
 * O que uma série temporal medida pode e não pode dizer.
 *
 * Duas regras que a tela vinha quebrando de formas opostas, e as duas produzem
 * a mesma coisa — um gráfico que não corresponde a medições:
 *
 * 1. O que ENTRA na série. A leitura ao vivo repetia a última amostra de HRV a
 *    cada batimento, e noventa cópias de um número eram desenhadas como noventa
 *    medições.
 * 2. O que SAI para o gráfico. As abas 1H/6H/24H/7D existiam desde o começo e
 *    não filtravam nada: o estado era lido só para colorir o rótulo, e a série
 *    inteira ia para o desenho em qualquer aba. Tocar em "7D" mudava a cor de
 *    uma palavra.
 *
 * Um controle que não controla é pior que a ausência dele: quem toca conclui que
 * os dados são aqueles mesmo. Num produto de saúde, é o gráfico mentindo sobre o
 * próprio recorte.
 *
 * Fica no domínio, e não na tela, porque é regra sobre o dado — e porque assim
 * dá para testá-la sem montar componente.
 */

export type Ponto = { at: number; value: number };

/**
 * Acrescenta a amostra de HRV de uma leitura — se ela for NOVA.
 *
 * A leitura contínua carrega sempre a última amostra conhecida de HRV, porque o
 * score precisa do componente de maior peso a cada batimento. Isso é correto
 * para a leitura e desastroso para a série: o batimento chega a cada poucos
 * segundos, e empilhar `hrvMs` a cada evento enchia o gráfico de cópias da
 * mesma medição. A pessoa via uma reta perfeita e concluía que a variabilidade
 * dela não muda — num produto de saúde, uma curva que não corresponde a
 * medições é pior que curva nenhuma.
 *
 * O que separa uma amostra nova de uma repetida é o CARIMBO, não o valor: dois
 * HRV iguais medidos em janelas diferentes são dois dados; o mesmo HRV visto
 * duas vezes é um só.
 */
export function comAmostraDeHrv(
  serie: Ponto[],
  reading: { hrvMs: number | null; hrvAt?: number; recordedAt: number },
  limite = 90,
): Ponto[] {
  if (reading.hrvMs == null) return serie;
  const at = reading.hrvAt ?? reading.recordedAt;
  if (serie.some((a) => a.at === at)) return serie;
  return [...serie, { at, value: reading.hrvMs }].sort((a, b) => a.at - b.at).slice(-limite);
}

export type Faixa = '1H' | '6H' | '24H' | '7D';

export const FAIXAS: Faixa[] = ['1H', '6H', '24H', '7D'];

const JANELA_MS: Record<Faixa, number> = {
  '1H': 3600_000,
  '6H': 6 * 3600_000,
  '24H': 24 * 3600_000,
  '7D': 7 * 24 * 3600_000,
};

/** As amostras dentro da janela, da mais antiga à mais recente. */
export function noPeriodo(serie: Ponto[], faixa: Faixa, agora = Date.now()): Ponto[] {
  const desde = agora - JANELA_MS[faixa];
  return serie.filter((p) => p.at >= desde).sort((a, b) => a.at - b.at);
}

/**
 * Os três rótulos do eixo x, derivados do que está DESENHADO.
 *
 * Eram fixos — `['1h atrás', '30 min', 'agora']` — em qualquer faixa e sobre
 * qualquer dado. Numa série de sete dias, o eixo dizia "30 min".
 *
 * Vêm da primeira, do meio e da última amostra, e não da janela nominal: uma
 * faixa de 24 h com medições só das últimas duas horas deve dizer duas horas,
 * senão o gráfico parece cobrir um dia que ninguém mediu.
 */
export function rotulosDoPeriodo(serie: Ponto[], agora = Date.now()): string[] {
  if (serie.length < 2) return [];
  const primeiro = serie[0].at;
  const ultimo = serie[serie.length - 1].at;
  return [quandoFoi(primeiro, agora), quandoFoi((primeiro + ultimo) / 2, agora), 'agora'];
}

/** "há 3 h", "há 2 d" — distância até agora, na maior unidade que couber. */
export function quandoFoi(instante: number, agora = Date.now()): string {
  const min = Math.max(0, Math.round((agora - instante) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  return `há ${dias} d`;
}

/**
 * A faixa mais estreita que ainda mostra um gráfico, entre as candidatas.
 *
 * Abrir sempre em "1H" deixava a tela num vazio explicado ("sem série ainda")
 * mesmo quando havia uma semana de medições logo ali — a pulseira mede HRV em
 * janelas agendadas, e é normal a última hora não ter nenhuma. A aba inicial
 * passa a ser a primeira que tem o que desenhar.
 */
export function faixaInicial(serie: Ponto[], agora = Date.now()): Faixa {
  for (const faixa of FAIXAS) {
    if (noPeriodo(serie, faixa, agora).length >= 2) return faixa;
  }
  return '24H';
}
