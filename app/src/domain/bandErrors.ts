/**
 * O que o firmware diz quando uma medição falha, em português e com saída.
 *
 * A pulseira SEMPRE soube o motivo. Ela devolve a causa em
 * `NSError.userInfo["message"]`, em chinês, e o app descartava isso: chegava à
 * tela o `localizedDescription`, que sem tabela de tradução vira "The operation
 * couldn't be completed. (MeasuringError error -3.)". Na prática a pessoa lia
 * um palpite nosso — "costuma ser contato com a pele" — enquanto o aparelho
 * afirmava exatamente isso com certeza.
 *
 * Medido em campo (ago/2026): as três medições da conexão — batimento, estresse
 * e HRV — falhavam com `未正确佩戴手环`, e nenhuma tela dizia à pessoa que
 * bastava encaixar a pulseira melhor.
 *
 * A regra de cada mensagem: dizer o QUE houve e o que fazer agora. "Erro na
 * medição" não é nenhum dos dois.
 */

export type FalhaDeMedicao = {
  /** Frase curta do que aconteceu. */
  titulo: string;
  /** O que fazer, em uma ação concreta. */
  corpo: string;
  /** Vale tentar de novo sem mudar nada? Falso quando depende de uma ação. */
  automatico: boolean;
};

/**
 * As mensagens do firmware, pelo texto que ele manda.
 *
 * Comparadas por CONTEÚDO e não por igualdade: a mesma causa aparece com e sem
 * prefixo entre versões do SDK (`未正确佩戴手环` e `手环未正确佩戴`), e casar a
 * string inteira faria a tradução falhar em silêncio na próxima atualização.
 */
const DICIONARIO: { marca: string; falha: FalhaDeMedicao }[] = [
  {
    /*
     Ao pé da letra é "a pulseira não está sendo usada corretamente" — e a
     tradução literal engana.

     Medido em campo (ago/2026): o firmware devolve esta MESMA mensagem quando o
     sensor está OCUPADO, e não só quando falta contato com a pele. Foi o que
     aconteceu com a pulseira firme no pulso, medindo normalmente no app do
     fabricante: a recusa era de disputa, e a tela mandava apertar uma pulseira
     que já estava apertada.

     Por isso o texto cobre as duas causas, na ordem em que compensa tentar. Não
     é hedge: é o que a evidência sustenta.
    */
    marca: '未正确佩戴',
    falha: {
      titulo: 'A pulseira não aceitou medir agora',
      corpo:
        'Ela recusa quando o sensor já está ocupado — feche o app do fabricante se ele ' +
        'estiver medindo — e quando falta contato com a pele. Aguarde alguns segundos, ' +
        'ajuste a pulseira um dedo acima do osso do pulso e tente de novo.',
      automatico: true,
    },
  },
  {
    // "bateria fraca"
    marca: '电量',
    falha: {
      titulo: 'A pulseira está com pouca bateria',
      corpo: 'Medir consome bastante. Carregue-a e tente de novo.',
      automatico: false,
    },
  },
  {
    // "medindo" — já há uma medição em curso no aparelho
    marca: '正在测量',
    falha: {
      titulo: 'A pulseira já está medindo',
      corpo: 'Ela mede uma grandeza por vez. Aguarde a medição atual terminar.',
      automatico: true,
    },
  },
];

/**
 * Traduz a falha de uma medição. `null` quando a mensagem não é do firmware —
 * aí quem responde é o texto genérico de quem chamou.
 *
 * Nunca devolve a mensagem crua traduzida ao pé da letra: o firmware descreve o
 * ESTADO ("não está corretamente usada"), e o que a tela precisa é a ação.
 */
export function falhaDeMedicao(mensagem: string | null | undefined): FalhaDeMedicao | null {
  if (!mensagem) return null;
  for (const { marca, falha } of DICIONARIO) {
    if (mensagem.includes(marca)) return falha;
  }
  return null;
}

/**
 * A frase única para uma tela que só tem uma linha para gastar.
 *
 * Existe porque `measureError` é uma string só, e reescrever a tela inteira
 * para dois campos não vale a pena por enquanto.
 */
export function textoDaFalha(mensagem: string | null | undefined): string | null {
  const f = falhaDeMedicao(mensagem);
  return f ? `${f.titulo}. ${f.corpo}` : null;
}
