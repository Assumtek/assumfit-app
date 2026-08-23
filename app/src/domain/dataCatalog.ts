/**
 * Todos os dados de saúde, num lugar só, com a PROCEDÊNCIA de cada um.
 *
 * As métricas moram em telas espalhadas pelo menu, e não havia onde ver o
 * conjunto: o que o app mede, quando mediu pela última vez e de onde veio.
 *
 * A procedência não é enfeite. Dado biométrico é dado pessoal sensível, e a
 * pessoa tem direito de saber o que é medição do aparelho, o que é estimativa
 * calculada e o que foi ela mesma quem digitou. O HRV é o exemplo mais duro:
 * pulseira e relógio medem a mesma coisa por métodos diferentes, com escalas
 * diferentes, e sem a fonte à vista o número parece universal quando não é.
 */

export type Origem = 'pulseira' | 'iphone' | 'voce' | 'calculado';

export type ItemDeDado = {
  chave: string;
  rotulo: string;
  origem: Origem;
  /** O valor já formatado com unidade, ou `null` quando nunca houve medição. */
  valor: string | null;
  /** Instante da última medição, para a tela dizer "há 2 h". */
  em: number | null;
  rota: string | null;
};

export const NOME_DA_ORIGEM: Record<Origem, string> = {
  pulseira: 'Medido pela pulseira',
  iphone: 'Vindo do iPhone',
  voce: 'Registrado por você',
  calculado: 'Calculado pelo app',
};

export const EXPLICACAO_DA_ORIGEM: Record<Origem, string> = {
  pulseira: 'Sensores do AssumFit Watch, no seu pulso.',
  iphone: 'Lido do app Saúde da Apple, com a sua autorização, e só leitura.',
  voce: 'O que você registra na mão, como água, refeição e ciclo.',
  calculado: 'Derivado das medições acima, nunca medido diretamente.',
};

export type EntradaDoCatalogo = {
  agora: number;
  batimento: { valor: number | null; em: number | null };
  hrv: { valor: number | null; em: number | null };
  oxigenio: { valor: number | null; em: number | null };
  estresse: { valor: number | null; em: number | null };
  passos: { valor: number | null; em: number | null };
  pressao: { sistolica: number | null; diastolica: number | null; em: number | null };
  sono: { minutos: number | null; em: number | null; doIphone: boolean };
  agua: { ml: number | null; em: number | null };
  refeicoes: { quantidade: number; em: number | null };
  energia: { valor: number | null; em: number | null };
  idadeBiologica: { valor: number | null; em: number | null };
};

function duracao(min: number): string {
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${String(Math.round(min % 60)).padStart(2, '0')} min` : `${Math.round(min)} min`;
}

/**
 * O catálogo inteiro, na ordem de leitura. Item sem medição CONTINUA na lista,
 * com valor nulo: sumir com ele daria a impressão de que o app não mede aquilo,
 * quando o certo é dizer que ainda não mediu.
 */
export function catalogoDeDados(e: EntradaDoCatalogo): ItemDeDado[] {
  return [
    {
      chave: 'batimento',
      rotulo: 'Batimento',
      origem: 'pulseira',
      valor: e.batimento.valor != null ? `${Math.round(e.batimento.valor)} bpm` : null,
      em: e.batimento.em,
      rota: 'HeartRate',
    },
    {
      chave: 'hrv',
      rotulo: 'Variabilidade (HRV)',
      origem: 'pulseira',
      valor: e.hrv.valor != null ? `${Math.round(e.hrv.valor)} ms` : null,
      em: e.hrv.em,
      rota: 'Hrv',
    },
    {
      chave: 'oxigenio',
      rotulo: 'Oxigenação',
      origem: 'pulseira',
      valor: e.oxigenio.valor != null ? `${Math.round(e.oxigenio.valor)}%` : null,
      em: e.oxigenio.em,
      rota: 'Oxygen',
    },
    {
      chave: 'estresse',
      rotulo: 'Estresse',
      origem: 'pulseira',
      valor: e.estresse.valor != null ? `${Math.round(e.estresse.valor)} de 100` : null,
      em: e.estresse.em,
      rota: 'Stress',
    },
    {
      chave: 'passos',
      rotulo: 'Passos',
      origem: 'pulseira',
      valor: e.passos.valor != null ? `${Math.round(e.passos.valor).toLocaleString('pt-BR')} passos` : null,
      em: e.passos.em,
      rota: 'Activity',
    },
    {
      chave: 'pressao',
      rotulo: 'Pressão',
      origem: 'pulseira',
      valor:
        e.pressao.sistolica != null && e.pressao.diastolica != null
          ? `${Math.round(e.pressao.sistolica)}/${Math.round(e.pressao.diastolica)} mmHg`
          : null,
      em: e.pressao.em,
      rota: 'Pressure',
    },
    {
      chave: 'sono',
      rotulo: 'Sono',
      origem: e.sono.doIphone ? 'iphone' : 'pulseira',
      valor: e.sono.minutos != null ? duracao(e.sono.minutos) : null,
      em: e.sono.em,
      rota: 'Sleep',
    },
    {
      chave: 'agua',
      rotulo: 'Água',
      origem: 'voce',
      valor: e.agua.ml != null ? `${(e.agua.ml / 1000).toFixed(1).replace('.', ',')} L hoje` : null,
      em: e.agua.em,
      rota: 'Habits',
    },
    {
      chave: 'refeicoes',
      rotulo: 'Refeições',
      origem: 'voce',
      valor: e.refeicoes.quantidade > 0
        ? `${e.refeicoes.quantidade} ${e.refeicoes.quantidade === 1 ? 'registro hoje' : 'registros hoje'}`
        : null,
      em: e.refeicoes.em,
      rota: 'Meals',
    },
    {
      chave: 'energia',
      rotulo: 'Score de energia',
      origem: 'calculado',
      valor: e.energia.valor != null ? `${Math.round(e.energia.valor)} de 100` : null,
      em: e.energia.em,
      rota: 'Health',
    },
    {
      chave: 'idade',
      rotulo: 'Idade biológica',
      origem: 'calculado',
      valor: e.idadeBiologica.valor != null ? `${e.idadeBiologica.valor.toFixed(1).replace('.', ',')} anos` : null,
      em: e.idadeBiologica.em,
      rota: 'BioAge',
    },
  ];
}

export type GrupoDeDados = { origem: Origem; itens: ItemDeDado[] };

/** Agrupado por procedência, na ordem em que a tela mostra. */
export function porOrigem(itens: ItemDeDado[]): GrupoDeDados[] {
  const ordem: Origem[] = ['pulseira', 'iphone', 'voce', 'calculado'];
  return ordem
    .map((origem) => ({ origem, itens: itens.filter((i) => i.origem === origem) }))
    .filter((g) => g.itens.length > 0);
}

/** Filtro da busca: sem acento, sem caixa, casando por pedaço do nome. */
export function filtrar(itens: ItemDeDado[], busca: string): ItemDeDado[] {
  const alvo = normalizarTexto(busca);
  if (!alvo) return itens;
  return itens.filter((i) => normalizarTexto(i.rotulo).includes(alvo));
}

function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Quantas medidas têm valor, para o cabeçalho da tela. */
export function comMedicao(itens: ItemDeDado[]): number {
  return itens.filter((i) => i.valor != null).length;
}
