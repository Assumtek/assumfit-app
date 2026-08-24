/**
 * O que a pulseira está REGISTRANDO sozinha, em português.
 *
 * Cada grandeza tem, no firmware, um interruptor separado da capacidade:
 * `getFeatures` diz que o aparelho sabe medir, o agendamento diz se ele está
 * medindo. Desligada, a grandeza não entra na memória, e a medição sob demanda
 * ainda assim conclui com sucesso e devolve vazio.
 *
 * Isto existe porque o estado precisava chegar à TELA. Enquanto foi só linha de
 * log, uma pulseira que parou de registrar era indistinguível de um app
 * quebrado: um testador passou dois dias sem sono, sem batimento, sem oxigênio
 * e sem estresse (só o contador de passos, que é acelerômetro e não depende de
 * agendamento, continuou enchendo) e reportou o app três vezes, porque não
 * havia nada em lugar nenhum que dissesse o que estava acontecendo.
 *
 * O sono entra na lista sem ter interruptor próprio: o estadiamento depende do
 * sensor óptico, então ele acompanha o batimento. Sem batimento agendado não há
 * noite para fechar, e essa é a ligação que ninguém adivinha olhando a tela.
 */

export type Grandeza = {
  chave: string;
  rotulo: string;
  /** O que deixa de existir quando esta grandeza não está agendada. */
  consequencia: string;
};

export const GRANDEZAS: Grandeza[] = [
  { chave: 'heartRate', rotulo: 'Batimento', consequencia: 'sem ele não há noite de sono nem recuperação' },
  { chave: 'hrv', rotulo: 'Variabilidade (HRV)', consequencia: 'é o que puxa o score de prontidão' },
  { chave: 'stress', rotulo: 'Estresse', consequencia: 'o anel de stress fica em traço' },
  { chave: 'spo2', rotulo: 'Oxigenação', consequencia: 'a curva de SpO₂ fica vazia' },
  { chave: 'bloodPressure', rotulo: 'Pressão', consequencia: 'a tendência de pressão não se forma' },
];

export type LinhaDoAgendamento = Grandeza & { ligado: boolean };

export function linhasDoAgendamento(estado: Record<string, boolean> | null): LinhaDoAgendamento[] {
  if (!estado) return [];
  return GRANDEZAS.map((g) => ({ ...g, ligado: estado[g.chave] === true }));
}

/** As que estão desligadas. É por elas que a tela começa a falar. */
export function desligadas(estado: Record<string, boolean> | null): LinhaDoAgendamento[] {
  return linhasDoAgendamento(estado).filter((l) => !l.ligado);
}

/**
 * A frase que resume o estado, escrita para quem não sabe o que é agendamento.
 *
 * Sem estado lido não se afirma nada: dizer "tudo certo" porque a conferência
 * ainda não aconteceu é o mesmo erro de tratar ausência como zero.
 */
export function resumoDoAgendamento(estado: Record<string, boolean> | null): string {
  if (!estado) return 'Ainda não conferimos o que a pulseira está registrando.';
  const fora = desligadas(estado);
  if (fora.length === 0) return 'A pulseira está registrando todas as grandezas sozinha.';
  if (fora.length === GRANDEZAS.length) {
    return 'A pulseira não está registrando nada sozinha. É por isso que as telas ficam em traço.';
  }
  const nomes = fora.map((l) => l.rotulo.toLowerCase());
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  return `A pulseira parou de registrar ${lista}. Enquanto estiver assim, esses dados não entram no app.`;
}
