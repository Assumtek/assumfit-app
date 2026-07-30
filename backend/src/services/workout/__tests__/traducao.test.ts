import { traduzirParaAnamnese } from '../conversation';
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
    const anamnese = traduzirParaAnamnese({ ...BASE, injuries: '—', cirurgias: '—' });
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
    const anamnese = traduzirParaAnamnese({
      ...BASE,
      injuries: 'Não, mas sinto o joelho direito ao agachar',
    });
    expect(anamnese.injuries).toContain('joelho direito');
  });

  it('lesão de verdade continua acendendo a flag ortopédica', () => {
    const anamnese = traduzirParaAnamnese({ ...BASE, injuries: 'Rompi o LCA em 2023' });
    const flags = deriveFlags(parseAnamnesis(anamnese), { sex: 'f', birthDate: new Date('1996-01-01') });
    expect(flags).toContain('lesao-ortopedica');
  });

  it('perfil limpo não carrega flag de lesão — o caso da rodada 1', () => {
    const anamnese = traduzirParaAnamnese({ ...BASE, injuries: '—', cirurgias: '—' });
    const flags = deriveFlags(parseAnamnesis(anamnese), { sex: 'f', birthDate: new Date('1996-01-01') });
    expect(flags).not.toContain('lesao-ortopedica');
  });

  it('placeholder embrulhado não vaza para as notas', () => {
    const anamnese = traduzirParaAnamnese({ ...BASE, cuidadoEspecial: '—', alimentacao: '—' });
    expect(anamnese.notes ?? '').not.toContain('—');
  });
});
