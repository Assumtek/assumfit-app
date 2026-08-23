import { catalogoDeDados, comMedicao, filtrar, porOrigem, type EntradaDoCatalogo } from '../dataCatalog';

const AGORA = Date.parse('2026-08-23T15:00:00-03:00');

const vazio: EntradaDoCatalogo = {
  agora: AGORA,
  batimento: { valor: null, em: null },
  hrv: { valor: null, em: null },
  oxigenio: { valor: null, em: null },
  estresse: { valor: null, em: null },
  passos: { valor: null, em: null },
  pressao: { sistolica: null, diastolica: null, em: null },
  sono: { minutos: null, em: null, doIphone: false },
  agua: { ml: null, em: null },
  refeicoes: { quantidade: 0, em: null },
  energia: { valor: null, em: null },
  idadeBiologica: { valor: null, em: null },
};

describe('catalogoDeDados', () => {
  it('métrica sem medição continua na lista, com valor nulo', () => {
    const itens = catalogoDeDados(vazio);
    expect(itens.length).toBeGreaterThan(8);
    expect(itens.every((i) => i.valor === null)).toBe(true);
    expect(comMedicao(itens)).toBe(0);
  });

  it('formata cada valor com a unidade da métrica, sem a tela montar string', () => {
    const itens = catalogoDeDados({
      ...vazio,
      batimento: { valor: 62.4, em: AGORA },
      hrv: { valor: 48.7, em: AGORA },
      passos: { valor: 8432, em: AGORA },
      pressao: { sistolica: 118, diastolica: 76, em: AGORA },
      sono: { minutos: 447, em: AGORA, doIphone: false },
      agua: { ml: 1800, em: AGORA },
      idadeBiologica: { valor: 31.2, em: AGORA },
    });
    const v = (chave: string) => itens.find((i) => i.chave === chave)?.valor;
    expect(v('batimento')).toBe('62 bpm');
    expect(v('hrv')).toBe('49 ms');
    expect(v('passos')).toBe('8.432 passos');
    expect(v('pressao')).toBe('118/76 mmHg');
    expect(v('sono')).toBe('7 h 27 min');
    expect(v('agua')).toBe('1,8 L hoje');
    expect(v('idade')).toBe('31,2 anos');
  });

  it('o sono muda de origem conforme quem mediu', () => {
    const daPulseira = catalogoDeDados({ ...vazio, sono: { minutos: 400, em: AGORA, doIphone: false } });
    const doIphone = catalogoDeDados({ ...vazio, sono: { minutos: 400, em: AGORA, doIphone: true } });
    expect(daPulseira.find((i) => i.chave === 'sono')?.origem).toBe('pulseira');
    expect(doIphone.find((i) => i.chave === 'sono')?.origem).toBe('iphone');
  });

  it('uma refeição no singular, duas no plural', () => {
    const uma = catalogoDeDados({ ...vazio, refeicoes: { quantidade: 1, em: AGORA } });
    const duas = catalogoDeDados({ ...vazio, refeicoes: { quantidade: 2, em: AGORA } });
    expect(uma.find((i) => i.chave === 'refeicoes')?.valor).toBe('1 registro hoje');
    expect(duas.find((i) => i.chave === 'refeicoes')?.valor).toBe('2 registros hoje');
  });
});

describe('porOrigem', () => {
  it('agrupa na ordem: pulseira, iphone, você, calculado', () => {
    const grupos = porOrigem(catalogoDeDados(vazio));
    expect(grupos.map((g) => g.origem)).toEqual(['pulseira', 'voce', 'calculado']);
  });

  it('o grupo do iPhone só existe quando algo vem de lá', () => {
    const grupos = porOrigem(catalogoDeDados({ ...vazio, sono: { minutos: 400, em: AGORA, doIphone: true } }));
    expect(grupos.map((g) => g.origem)).toContain('iphone');
  });
});

describe('filtrar', () => {
  const itens = catalogoDeDados(vazio);

  it('busca sem acento encontra a métrica acentuada', () => {
    expect(filtrar(itens, 'oxigenacao').map((i) => i.chave)).toEqual(['oxigenio']);
    expect(filtrar(itens, 'AGUA').map((i) => i.chave)).toEqual(['agua']);
  });

  it('casa por pedaço do nome, e busca vazia devolve tudo', () => {
    expect(filtrar(itens, 'varia').map((i) => i.chave)).toEqual(['hrv']);
    expect(filtrar(itens, '   ')).toHaveLength(itens.length);
  });
});
