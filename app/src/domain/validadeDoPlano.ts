/**
 * Quanto ainda vale o plano de treino.
 *
 * Pedido de testador: "o projeto de treino venceu e morreu por falta de
 * acompanhamento". O plano nasce com 30 dias de validade e nada olhava para
 * isso: nem avisava que estava acabando, nem oferecia o próximo. A pessoa
 * seguia treinando um plano vencido, ou parava sem saber por quê.
 *
 * **Plano vencido não é plano nenhum.** Marcar como expirado e sumir com ele
 * deixaria quem não renovou sem treino, o que é pior que treinar um plano
 * velho: o corpo de quem faz o de quatro semanas atrás continua sendo
 * exercitado. Por isso o estado é informação, e não bloqueio.
 */

export type EstadoDaValidade =
  | { estado: 'vigente'; diasRestantes: number }
  /** Últimos dias: é quando vale começar a preparar o próximo. */
  | { estado: 'acabando'; diasRestantes: number }
  | { estado: 'vencido'; diasVencido: number };

/** A partir daqui a tela começa a falar. Uma semana dá tempo de gerar e revisar. */
export const DIAS_PARA_AVISAR = 7;

export function validadeDoPlano(endDate: string | null | undefined, hoje = new Date()): EstadoDaValidade | null {
  if (!endDate) return null;
  const fim = new Date(endDate);
  if (Number.isNaN(fim.getTime())) return null;

  /*
   A conta é por DIA, não por instante: um plano que vence às 23h de hoje não
   está "vencido há 0,4 dia" para quem olha a tela de manhã, e arredondar para
   baixo faria "vence hoje" virar "venceu".
  */
  const diaDe = (d: Date) => Math.floor(new Date(d).setHours(0, 0, 0, 0) / 86_400_000);
  const dias = diaDe(fim) - diaDe(hoje);

  if (dias < 0) return { estado: 'vencido', diasVencido: -dias };
  if (dias <= DIAS_PARA_AVISAR) return { estado: 'acabando', diasRestantes: dias };
  return { estado: 'vigente', diasRestantes: dias };
}

/** A frase da tela, escrita para quem não pensa em "validade de plano". */
export function frasedaValidade(v: EstadoDaValidade): string {
  if (v.estado === 'vencido') {
    return v.diasVencido === 1
      ? 'Este plano venceu ontem. Ele continua aqui, mas depois de quatro semanas o corpo já se adaptou: um plano novo é o que faz a carga seguir subindo.'
      : `Este plano venceu há ${v.diasVencido} dias. Ele continua aqui, mas depois de quatro semanas o corpo já se adaptou: um plano novo é o que faz a carga seguir subindo.`;
  }
  if (v.estado === 'acabando') {
    if (v.diasRestantes === 0) return 'Este plano termina hoje. Vale gerar o próximo para não ficar sem.';
    return v.diasRestantes === 1
      ? 'Este plano termina amanhã. Vale gerar o próximo para não ficar sem.'
      : `Este plano termina em ${v.diasRestantes} dias. Vale gerar o próximo para não ficar sem.`;
  }
  return '';
}
