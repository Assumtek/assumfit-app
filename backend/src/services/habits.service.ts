/**
 * O que uma escrita de hábito diário pode alterar.
 *
 * O app manda o TOTAL do dia a cada mudança, não o gole. Isso é simples e
 * resistente a app fechado, e tem um preço: duas escritas do mesmo dia são duas
 * versões do mesmo número, e a rede não garante a ordem em que chegam. Em
 * produção, uma rajada de goles produziu cinco `PUT /habits` no mesmo segundo
 * (24/08/2026), e bastava a de total menor ser processada por último para o dia
 * inteiro voltar no tempo. O testador viu a água cair para o primeiro copo.
 *
 * A guarda é o carimbo do APARELHO. Do servidor não serviria: o instante em que
 * a requisição chega é exatamente o que a rede embaralha.
 *
 * Só a água passa por aqui. Sono e humor não são contador, não chegam em
 * rajada, e a última palavra sobre eles é mesmo a mais recente a chegar.
 */

export type HabitoGravado = {
  waterMl: number;
  waterAt: Date | null;
};

export type EscritaDeHabito = {
  waterMl?: number;
  sleepScore?: number;
  sleepMinutes?: number;
  mood?: string;
};

/**
 * A escrita chegou atrasada em relação ao que já está gravado?
 *
 * Sem carimbo dos dois lados não há como saber, e nesse caso a escrita vale:
 * app antigo continua funcionando, e recusar por precaução perderia água de
 * verdade para evitar um problema hipotético.
 */
export function aguaAtrasada(atual: HabitoGravado | null, at: Date | null): boolean {
  if (!atual?.waterAt || !at) return false;
  return at < atual.waterAt;
}

/**
 * Os campos que devem ser gravados, já descontado o que chegou atrasado.
 *
 * Devolver o objeto de update inteiro, e não um booleano, é o que mantém a rota
 * sem regra: ela persiste o que sair daqui.
 */
export function camposParaGravar(
  atual: HabitoGravado | null,
  entrada: EscritaDeHabito,
  at: Date | null): EscritaDeHabito & { waterAt?: Date } {
  const { waterMl, ...resto } = entrada;

  if (waterMl !== undefined && aguaAtrasada(atual, at)) {
    // A água atrasada sai, o resto da escrita continua: uma noite de sono que
    // viajou junto não tem por que ser descartada por causa do contador.
    return resto;
  }

  return {
    ...entrada,
    // O carimbo só avança quando a água avança com ele: uma escrita de sono
    // não pode marcar a água como recém-atualizada.
    ...(at && waterMl !== undefined ? { waterAt: at } : {}),
  };
}
