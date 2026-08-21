/**
 * "Parece que você começou a se exercitar" — a detecção, sem a notificação.
 *
 * Pedido de um testador (21/08/2026): quando o batimento sobe de repente, em
 * geral a pessoa começou uma atividade; se não há treino nem sessão aberta,
 * vale perguntar se ela quer registrar. O que este módulo decide é SÓ o
 * "parece exercício"; quem avisa e quem abre a tela são o store e o serviço
 * de notificações.
 *
 * Três condições, e por que cada uma:
 *
 * - **Batimento alto E movimento.** Batimento alto parado já tem dono — é o
 *   convite de respiração e o aviso de atenção. Exercício é batimento alto
 *   COM passos; sem os passos, a pergunta "você está treinando?" para alguém
 *   sentado seria a pior versão do aviso.
 * - **Sustentado por três minutos.** Subir uma escada dispara 110 bpm por
 *   trinta segundos; corrida, bicicleta e funcional sustentam.
 * - **Nada aberto.** Com treino guiado ou sessão de esporte em curso, a
 *   pergunta já foi respondida.
 *
 * Módulo de domínio puro: recebe o estado e a leitura, devolve o estado novo e
 * se é hora de perguntar. Nada de relógio, nada de React — testável sem
 * simular o tempo.
 */

/** Acima disto, com movimento, é esforço — não caminhada até a cozinha. */
export const BPM_EXERCICIO = 110;
/** Quanto tempo o esforço precisa durar antes de virar pergunta. */
export const EXERCICIO_SUSTENTADO_MS = 3 * 60_000;
/** Entre uma pergunta e a próxima. Quem disse "não" não quer ouvir de novo em 10 min. */
export const COOLDOWN_EXERCICIO_MS = 2 * 3600_000;

export type EstadoDeExercicio = {
  /** Desde quando o batimento está alto com movimento; `null` quando não está. */
  esforcoDesde: number | null;
  /** Quando a última pergunta foi feita; `null` é "nunca" — não é "no instante zero". */
  ultimaPergunta: number | null;
};

export const ESTADO_INICIAL: EstadoDeExercicio = { esforcoDesde: null, ultimaPergunta: null };

export type LeituraParaExercicio = {
  heartRate: number;
  /** Passos subindo nos últimos minutos — `emMovimento` do store. */
  emMovimento: boolean;
  /** Treino guiado em execução ou sessão de esporte aberta. */
  emAtividadeRegistrada: boolean;
  agora: number;
};

/**
 * Avança o estado com uma leitura e diz se é hora de perguntar.
 *
 * `perguntar` só é verdadeiro UMA vez por episódio: ao disparar, o relógio do
 * esforço zera, e a próxima pergunta exige novo período sustentado E o
 * cooldown vencido.
 */
export function avaliarInicioDeExercicio(
  estado: EstadoDeExercicio,
  leitura: LeituraParaExercicio,
): { estado: EstadoDeExercicio; perguntar: boolean } {
  const { heartRate, emMovimento, emAtividadeRegistrada, agora } = leitura;

  if (emAtividadeRegistrada || heartRate < BPM_EXERCICIO || !emMovimento) {
    return { estado: { ...estado, esforcoDesde: null }, perguntar: false };
  }

  const desde = estado.esforcoDesde ?? agora;
  const sustentado = agora - desde >= EXERCICIO_SUSTENTADO_MS;
  const cooldownVencido = estado.ultimaPergunta === null || agora - estado.ultimaPergunta >= COOLDOWN_EXERCICIO_MS;

  if (sustentado && cooldownVencido) {
    return { estado: { esforcoDesde: null, ultimaPergunta: agora }, perguntar: true };
  }
  return { estado: { ...estado, esforcoDesde: desde }, perguntar: false };
}
