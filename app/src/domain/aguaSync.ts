/**
 * Quem ganha quando o app e o servidor discordam sobre a água do dia.
 *
 * A pergunta parece boba e não é. O app registra água de forma otimista: o
 * número muda no toque e a gravação vai atrás, porque travar a tela num gesto
 * repetido faria a pessoa parar de registrar. Isso cria dois totais para o
 * mesmo dia, e uma regra de desempate mal escrita apaga água que a pessoa
 * bebeu.
 *
 * Foi o que aconteceu (Leonardo, 24/08/2026: "minha água baixou a quantidade
 * consumida sozinho"). A regra antiga era "sem gole nesta sessão, o servidor
 * manda", sem olhar os valores. Bastava uma gravação não chegar para o total
 * seguinte voltar no tempo, e o log de produção mostra as duas formas de isso
 * acontecer: cinco `PUT /habits` disparados no mesmo segundo, que chegam fora
 * de ordem, e requisições que voltam 401 quando o token vence no meio do uso.
 *
 * A regra nova tem duas partes:
 *
 * 1. **Água só desce por decisão de gente.** Remover um gole e ajustar o total
 *    descem; releitura, não. Dentro do dia, o total é um contador que só cresce,
 *    e entre duas leituras discordantes a maior é a que tem registro por trás.
 * 2. **Discordar significa que falta gravar.** Se o app tem mais que o servidor,
 *    a diferença não é ruído: é gravação que se perdeu, e ela é reenviada.
 */

export type EstadoDoDia = {
  /** `YYYY-MM-DD` local. */
  date: string;
  waterMl: number;
};

export type Reconciliacao = {
  /** O total que vale a partir de agora. */
  waterMl: number;
  /** O app precisa reenviar este total ao servidor. */
  reenviar: boolean;
  /**
   * Por que, para o log e para o teste. Nunca vai à tela: a pessoa não deve
   * precisar saber que houve divergência, só não pode perder água.
   */
  motivo: 'servidor' | 'local-maior' | 'sem-servidor' | 'outro-dia';
};

/**
 * Reconcilia o dia local com o que o servidor devolveu.
 *
 * `servidor` é `null` quando o servidor não tem o dia, o que é diferente de ter
 * zero: dia inexistente no servidor com total local é gravação que ainda não
 * subiu, e adotar zero ali apagaria tudo o que foi registrado antes da primeira
 * gravação bem-sucedida.
 */
export function reconciliarDia(local: EstadoDoDia, servidor: EstadoDoDia | null): Reconciliacao {
  if (!servidor) {
    return { waterMl: local.waterMl, reenviar: local.waterMl > 0, motivo: 'sem-servidor' };
  }
  if (servidor.date !== local.date) {
    return { waterMl: local.waterMl, reenviar: local.waterMl > 0, motivo: 'outro-dia' };
  }
  if (local.waterMl > servidor.waterMl) {
    return { waterMl: local.waterMl, reenviar: true, motivo: 'local-maior' };
  }
  return { waterMl: servidor.waterMl, reenviar: false, motivo: 'servidor' };
}
