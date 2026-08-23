/**
 * O que aparece na Home, e em que ordem, decidido por quem usa.
 *
 * A Home mudou três vezes em agosto e cada versão agradou a uma pessoa
 * diferente: quem treina quer o anel de calorias, quem dorme mal quer o sono,
 * quem gosta de número quer o gráfico. Escolher por todo mundo é escolher
 * errado para quase todo mundo.
 *
 * Duas regras dão o limite:
 *
 * 1. **O cabeçalho não entra.** Saudação, estado da pulseira e os atalhos de
 *    ajuda e avisos são navegação, não conteúdo; sem eles a tela deixa de
 *    funcionar. Só o miolo é configurável.
 * 2. **Bloco novo entra pelo fim, e no estado padrão dele.** Quem já
 *    personalizou não tem a escolha desfeita por uma atualização, e quem nunca
 *    mexeu recebe a novidade como se fosse a Home de fábrica.
 */

export type ChaveDeBloco =
  | 'resumo'
  | 'aneis'
  | 'indicadores'
  | 'semana'
  | 'metas'
  | 'hrv'
  | 'tendencias'
  | 'conquistas'
  | 'atalhos';

export type Bloco = { chave: ChaveDeBloco; ligado: boolean };

export type DescricaoDeBloco = {
  chave: ChaveDeBloco;
  titulo: string;
  descricao: string;
  /** Estado de fábrica. */
  padrao: boolean;
};

/**
 * A ordem desta lista é a Home de fábrica. Os desligados são os que dependem
 * de série acumulada, de treino recente ou de meta configurada: ligados por
 * padrão, apareceriam vazios para quem acabou de instalar, que é a pior
 * primeira impressão possível.
 */
export const BLOCOS: DescricaoDeBloco[] = [
  {
    chave: 'resumo',
    titulo: 'Resumo de saúde',
    descricao: 'A leitura do seu dia em uma frase, com o porquê.',
    padrao: true,
  },
  {
    chave: 'aneis',
    titulo: 'Três anéis',
    descricao: 'Sono, estresse e recuperação, em anel, no alto da tela.',
    /*
     Ligado de fábrica. Os anéis tinham saído do padrão em 22/08/2026; um
     testador os pediu de volta no dia seguinte à home configurável (Leonardo,
     23/08: "a tela inicial tem que chamar atenção") e a fundadora decidiu que
     voltam a ser o padrão. Quem não os quiser desliga em Personalizar a home.
    */
    padrao: true,
  },
  {
    chave: 'indicadores',
    titulo: 'Indicadores do dia',
    descricao: 'Água, atividade, alimentação, sono e estresse, com seta.',
    padrao: true,
  },
  {
    chave: 'semana',
    titulo: 'A semana em anéis',
    descricao: 'Sete dias lado a lado, para ver se o ritmo se manteve.',
    padrao: true,
  },
  {
    chave: 'metas',
    titulo: 'Anel de calorias',
    descricao: 'Quanto você já se moveu hoje, sobre a meta do dia.',
    padrao: false,
  },
  {
    chave: 'hrv',
    titulo: 'Variabilidade',
    descricao: 'A curva de HRV do período, com a sua média.',
    padrao: true,
  },
  {
    chave: 'tendencias',
    titulo: 'Tendências',
    descricao: 'O último mês contra os três anteriores. Precisa de série acumulada.',
    padrao: false,
  },
  {
    chave: 'conquistas',
    titulo: 'Conquistas',
    descricao: 'O que você desbloqueou treinando, sem sair da tela inicial.',
    padrao: false,
  },
  {
    chave: 'atalhos',
    titulo: 'Atalhos',
    descricao: 'Plano de treino, esporte com GPS e evolução.',
    padrao: true,
  },
];

export function layoutPadrao(): Bloco[] {
  return BLOCOS.map((b) => ({ chave: b.chave, ligado: b.padrao }));
}

export function descricaoDe(chave: ChaveDeBloco): DescricaoDeBloco | undefined {
  return BLOCOS.find((b) => b.chave === chave);
}

/**
 * Conserta o que veio do disco: descarta bloco que não existe mais, mantém a
 * ordem escolhida e encaixa o que a versão nova trouxe.
 *
 * "Encaixa" e não "acrescenta no fim": o bloco novo entra ao lado do vizinho
 * que ele tem na ordem de FÁBRICA. Jogar tudo no fim parecia inofensivo até o
 * primeiro caso real, o bloco dos três anéis, cujo lugar é o alto da tela:
 * ligá-lo o fazia aparecer depois dos atalhos, no rodapé, e quem pediu anéis
 * no topo concluiria que a opção não funciona.
 *
 * A ordem que a pessoa escolheu continua intocada: o novo se posiciona em
 * relação a ela, nunca o contrário.
 */
export function normalizarLayout(salvo: unknown): Bloco[] {
  if (!Array.isArray(salvo)) return layoutPadrao();
  const validos: Bloco[] = [];
  const vistos = new Set<ChaveDeBloco>();
  for (const item of salvo) {
    const chave = (item as Bloco)?.chave;
    if (!chave || vistos.has(chave)) continue;
    if (!BLOCOS.some((b) => b.chave === chave)) continue;
    vistos.add(chave);
    validos.push({ chave, ligado: (item as Bloco).ligado !== false });
  }
  if (validos.length === 0) return layoutPadrao();
  for (let i = 0; i < BLOCOS.length; i++) {
    const b = BLOCOS[i];
    if (vistos.has(b.chave)) continue;
    // De trás para frente, o primeiro vizinho de fábrica que a pessoa já tem:
    // o bloco novo entra logo depois dele. Sem vizinho, vai para o fim.
    let posicao = validos.length;
    for (let j = i - 1; j >= 0; j--) {
      const onde = validos.findIndex((v) => v.chave === BLOCOS[j].chave);
      if (onde >= 0) {
        posicao = onde + 1;
        break;
      }
    }
    validos.splice(posicao, 0, { chave: b.chave, ligado: b.padrao });
    vistos.add(b.chave);
  }
  return validos;
}

export function alternarBloco(blocos: Bloco[], chave: ChaveDeBloco): Bloco[] {
  return blocos.map((b) => (b.chave === chave ? { ...b, ligado: !b.ligado } : b));
}

/** Move um bloco uma posição para cima ou para baixo. Nas pontas, não faz nada. */
export function moverBloco(blocos: Bloco[], chave: ChaveDeBloco, direcao: -1 | 1): Bloco[] {
  const i = blocos.findIndex((b) => b.chave === chave);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= blocos.length) return blocos;
  const novo = [...blocos];
  [novo[i], novo[j]] = [novo[j], novo[i]];
  return novo;
}

export function blocosLigados(blocos: Bloco[]): ChaveDeBloco[] {
  return blocos.filter((b) => b.ligado).map((b) => b.chave);
}

/** Quantos blocos a pessoa desligou, para a tela dizer que a Home está enxuta. */
export function ehPadrao(blocos: Bloco[]): boolean {
  const padrao = layoutPadrao();
  return (
    blocos.length === padrao.length &&
    blocos.every((b, i) => b.chave === padrao[i].chave && b.ligado === padrao[i].ligado)
  );
}
