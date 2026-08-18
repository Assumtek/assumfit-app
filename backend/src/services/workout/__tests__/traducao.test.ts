import { modalidadesDoPlano, traduzirParaAnamnese } from '../conversation';
import { deriveFlags, parseAnamnesis } from '../context-builder';

/*
 O caso que motivou este arquivo: uma conta SEM lesão nenhuma saiu da entrevista
 conversacional com `injuries: "cirurgia: —"` — o placeholder de pergunta pulada
 embrulhado num template escapava do filtro ("cirurgia: —" ≠ "—"), o deriveFlags
 acendia `lesao-ortopedica`, o tier subia para TIER_2 e o avaliador zerava o
 plano por não tratar uma lesão que não existe. Rodada de testes 1, jul/2026.
*/

const BASE = {
  opening: 'Quero ganhar massa',
  weightKg: '70',
  heightCm: '170',
  experience: 'Nunca treinei',
  goal: 'Ganhar massa muscular',
  daysPerWeek: '2',
  minutesPerSession: '30 minutos',
  heartCondition: 'Não',
  chestPain: 'Não',
  dizziness: 'Não',
  boneJoint: 'Não',
  bloodPressureMed: 'Não',
};

describe('tradução da conversa para a anamnese', () => {
  it('pergunta pulada ("—") não vira lesão', () => {
    const anamnese = traduzirParaAnamnese({ ...BASE, boneJointWhere: '—', cirurgias: '—' });
    expect(anamnese.injuries).toBeNull();
  });

  it('negativa pura em campo livre não vira lesão nem remédio', () => {
    const anamnese = traduzirParaAnamnese({
      ...BASE,
      injuries: 'Não',
      cirurgias: 'nenhuma',
      medications: 'não tenho',
    });
    expect(anamnese.injuries).toBeNull();
    expect(anamnese.medications).toBeNull();
  });

  it('negativa com conteúdo depois É conteúdo e permanece', () => {
    // A pergunta de lesão em texto livre saiu (ago/2026): produzia a mesma flag
    // que o PAR-Q e acendia por lesão antiga já resolvida. Quem descreve a
    // região agora é `boneJointWhere`, e a regra do "não, mas…" continua valendo.
    const anamnese = traduzirParaAnamnese({
      ...BASE,
      boneJoint: 'Sim',
      boneJointWhere: 'Não, mas sinto o joelho direito ao agachar',
    });
    expect(anamnese.injuries).toContain('joelho direito');
  });

  it('lesão de verdade continua acendendo a flag ortopédica', () => {
    const anamnese = traduzirParaAnamnese({
      ...BASE,
      boneJoint: 'Sim',
      boneJointWhere: 'Rompi o LCA em 2023',
    });
    const flags = deriveFlags(parseAnamnesis(anamnese), { sex: 'f', birthDate: new Date('1996-01-01') });
    expect(flags).toContain('lesao-ortopedica');
  });

  it('perfil limpo não carrega flag de lesão — o caso da rodada 1', () => {
    const anamnese = traduzirParaAnamnese({ ...BASE, injuries: '—', cirurgias: '—' });
    const flags = deriveFlags(parseAnamnesis(anamnese), { sex: 'f', birthDate: new Date('1996-01-01') });
    expect(flags).not.toContain('lesao-ortopedica');
  });

  it('placeholder embrulhado não vaza para as notas', () => {
    const anamnese = traduzirParaAnamnese({ ...BASE, observacaoFinal: '—', alimentacao: '—' });
    expect(anamnese.notes ?? '').not.toContain('—');
  });
});

describe('modalidades do plano — a decisão da pessoa na anamnese', () => {
  it('sem esporte declarado, o plano é de musculação (comportamento antigo)', () => {
    expect(modalidadesDoPlano({ ...BASE })).toEqual(['musculacao']);
  });

  it('"Musculação e meu esporte" une as duas modalidades', () => {
    expect(
      modalidadesDoPlano({ ...BASE, praticaEsporte: 'Sim', qualEsporte: 'Corrida', planoCobre: 'Musculação e meu esporte' }),
    ).toEqual(['musculacao', 'corrida']);
  });

  it('"Só meu esporte" gera plano só do esporte', () => {
    expect(
      modalidadesDoPlano({ ...BASE, praticaEsporte: 'Sim', qualEsporte: 'Natação', planoCobre: 'Só meu esporte' }),
    ).toEqual(['natacao']);
  });

  it('esporte declarado mas pergunta pulada mantém o padrão de musculação', () => {
    expect(
      modalidadesDoPlano({ ...BASE, praticaEsporte: 'Sim', qualEsporte: 'Futebol' }),
    ).toEqual(['musculacao']);
  });

  it('quem NÃO pratica esporte ainda pode pedir um plano de esporte — o caso do primeiro dia', () => {
    expect(
      modalidadesDoPlano({
        ...BASE,
        praticaEsporte: 'Não',
        planoCobre: 'Só um esporte',
        esporteDoPlano: 'Corrida',
      }),
    ).toEqual(['corrida']);
  });

  it('o esporte do plano vence o esporte praticado', () => {
    expect(
      modalidadesDoPlano({
        ...BASE,
        praticaEsporte: 'Sim',
        qualEsporte: 'Futebol',
        planoCobre: 'Musculação e um esporte',
        esporteDoPlano: 'Corrida',
      }),
    ).toEqual(['musculacao', 'corrida']);
  });

  it('a decisão viaja na anamnese em planModalities', () => {
    const anamnese = traduzirParaAnamnese({
      ...BASE,
      praticaEsporte: 'Sim',
      qualEsporte: 'Lutas',
      planoCobre: 'Musculação e meu esporte',
    });
    expect(anamnese.planModalities).toEqual(['musculacao', 'lutas']);
    const lido = parseAnamnesis(anamnese);
    expect(lido.planModalities).toEqual(['musculacao', 'lutas']);
  });
});
