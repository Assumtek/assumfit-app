import { RiskTier } from '@prisma/client';

import { buildContext, deriveFlags, parseAnamnesis, type UserForContext } from '../context-builder';
import { canAutoGenerate, classify, isReferral } from '../risk-tier';
import { localDayOfWeek } from '../execution';

/**
 * O portão de segurança.
 *
 * Estas duas funções decidem se alguém recebe um treino gerado por máquina ou
 * um encaminhamento a um profissional. Elas são função pura justamente para
 * poderem ser verificadas sem banco, sem rede e sem modelo — e é o único
 * pedaço do backend onde um erro silencioso tem consequência física.
 */

const BIRTH_1990 = new Date('1990-06-15T00:00:00Z');
const BIRTH_1955 = new Date('1955-06-15T00:00:00Z');

const user = (overrides: Partial<UserForContext> = {}): UserForContext => ({
  sex: 'f',
  birthDate: BIRTH_1990, ...overrides,
});

describe('derivação de flags clínicas', () => {
  it('PAR-Q positivo para coração vira cardiopata', () => {
    const flags = deriveFlags({ parq: { heartCondition: true } }, user());
    expect(flags).toContain('cardiopata');
  });

  it.each([['chestPain'], ['dizziness']])(
    '%s vira dor torácica não investigada',
    (field) => {
      const flags = deriveFlags({ parq: { [field]: true } }, user());
      expect(flags).toContain('dor-toracica-nao-investigada');
    });

  it('remédio de pressão vira hipertensão', () => {
    expect(deriveFlags({ parq: { bloodPressureMedication: true } }, user())).toContain('hipertensao');
  });

  it('não responder é diferente de responder não', () => {
    // A distinção que mata se for perdida: `undefined` não pode virar `false`.
    expect(deriveFlags({}, user())).not.toContain('cardiopata');
    expect(deriveFlags({ parq: { heartCondition: false } }, user())).not.toContain('cardiopata');
    expect(deriveFlags({ parq: { heartCondition: true } }, user())).toContain('cardiopata');
  });

  it('condições declaradas viram flags', () => {
    const flags = deriveFlags({ conditions: ['diabetes', 'asma'] }, user());
    expect(flags).toEqual(expect.arrayContaining(['diabetico', 'asma']));
  });

  it('idade acima de 60 vira idoso', () => {
    expect(deriveFlags({}, user({ birthDate: BIRTH_1955 }))).toContain('idoso');
  });

  it('IMC a partir de 30 vira obeso', () => {
    expect(deriveFlags({ weightKg: 95, heightCm: 170 }, user())).toContain('obeso');
    expect(deriveFlags({ weightKg: 65, heightCm: 170 }, user())).not.toContain('obeso');
  });

  it('peso sem altura não deriva IMC nenhum', () => {
    // Meio dado não pode virar conclusão: sem altura não há IMC.
    expect(deriveFlags({ weightKg: 130 }, user())).not.toContain('obeso');
  });

  describe('análogos de GLP-1', () => {
    // A flag existe porque quem usa Ozempic ESCREVE o nome do remédio — nunca
    // marca uma caixa "uso GLP-1". Sem detectar no texto livre, a perda
    // acelerada de massa magra não entra na prescrição.
    it.each([
      ['Ozempic 0,5mg semanal'],
      ['uso mounjaro'],
      ['semaglutida'],
      ['Wegovy'],
      ['tirzepatida injetável'],
    ])('detecta %s', (text) => {
      expect(deriveFlags({ medications: text }, user())).toContain('glp1');
    });

    it('não confunde com outro medicamento', () => {
      expect(deriveFlags({ medications: 'losartana 50mg' }, user())).not.toContain('glp1');
    });
  });

  it('gestação vem do campo ou do texto livre', () => {
    expect(deriveFlags({ pregnant: true }, user())).toContain('gestante');
    expect(deriveFlags({ notes: 'estou grávida de 12 semanas' }, user())).toContain('gestante');
  });

  it('lesão descrita vira flag ortopédica', () => {
    expect(deriveFlags({ injuries: 'joelho direito' }, user())).toContain('lesao-ortopedica');
  });

  it('não repete flag vinda de duas origens', () => {
    const flags = deriveFlags(
      { parq: { heartCondition: true }, conditions: ['cardiopatia'] },
      user());
    expect(flags.filter((f) => f === 'cardiopata')).toHaveLength(1);
  });

  it('anamnese corrompida não derruba a derivação', () => {
    // Leitura tolerante de propósito: o objetivo é LER dado guardado, não
    // validar entrada. Um campo inesperado não pode impedir a geração.
    expect(() => deriveFlags(parseAnamnesis('lixo'), user())).not.toThrow();
    expect(() => deriveFlags(parseAnamnesis(null), user())).not.toThrow();
  });
});

describe('classificação de risco', () => {
  it('sem flag clínica é TIER_0', () => {
    expect(classify([])).toBe(RiskTier.TIER_0);
    expect(canAutoGenerate(classify([]))).toBe(true);
  });

  it('vale o MAIOR tier entre as flags, não o primeiro', () => {
    expect(classify(['diabetico', 'cardiopata', 'asma'])).toBe(RiskTier.TIER_3);
  });

  it('flag desconhecida não rebaixa o tier', () => {
    expect(classify(['cardiopata', 'flag-que-nao-existe'])).toBe(RiskTier.TIER_3);
  });

  describe('encaminhamento', () => {
    /**
     * Aqui está a diferença deliberada em relação ao sistema de onde a tabela
     * veio. Lá, TIER_3 ia para uma fila revisada por um profissional. Aqui não
     * existe esse profissional — o plano vai direto para quem executa, sozinho.
     *
     * Se algum destes testes começar a falhar, alguém reintroduziu a
     * possibilidade de prescrever para cardiopata sem revisor.
     */
    it.each([
      ['cardiopata', RiskTier.TIER_3],
      ['gestante', RiskTier.TIER_3],
      ['dor-toracica-nao-investigada', RiskTier.TIER_4],
    ])('%s encaminha', (flag, tier) => {
      expect(classify([flag])).toBe(tier);
      expect(isReferral(classify([flag]))).toBe(true);
      expect(canAutoGenerate(classify([flag]))).toBe(false);
    });

    it.each([['diabetico'], ['hipertensao'], ['obeso'], ['idoso'], ['glp1'], ['lesao-ortopedica']])(
      '%s NÃO encaminha, gera de forma cautelosa',
      (flag) => {
        expect(isReferral(classify([flag]))).toBe(false);
        expect(canAutoGenerate(classify([flag]))).toBe(true);
      });
  });

  it('caminho completo: PAR-Q positivo chega a encaminhamento', () => {
    const flags = deriveFlags({ parq: { chestPain: true } }, user());
    expect(isReferral(classify(flags))).toBe(true);
  });
});

describe('contexto enviado ao agente', () => {
  it('carrega a biometria medida junto do perfil', () => {
    // É o que o AssumFit tem e um app de treino comum não: o nível REAL,
    // observado, em vez do declarado.
    const context = buildContext({}, user(), { hrv_baseline_ms: 62, score_energia: 71 });
    expect(context.profile.hrv_baseline_ms).toBe(62);
    expect(context.profile.score_energia).toBe(71);
  });

  it('traduz o objetivo do perfil de rotina', () => {
    const context = buildContext({}, user({ goal: 'emagrecer' }));
    expect(context.profile.objetivo).toBe('emagrecimento');
  });

  it('objetivo desconhecido cai em saúde, não em undefined', () => {
    expect(buildContext({}, user({ goal: 'algo-novo' })).profile.objetivo).toBe('saude');
  });

  it('as restrições carregam o que limita a prescrição', () => {
    const context = buildContext(
      { equipment: 'halteres e banco', minutesPerSession: 30, injuries: 'ombro' },
      user({ trainPlace: 'casa' }));
    expect(context.constraints).toMatchObject({
      local: 'casa',
      equipamento: 'halteres e banco',
      minutos_por_sessao: 30,
      lesoes: 'ombro',
    });
  });
});

describe('dia da semana no fuso da pessoa', () => {
  it('22h de Brasília ainda é o mesmo dia', () => {
    // Sem o deslocamento, o servidor em UTC entregaria o treino de amanhã — e
    // a pessoa descobriria isso já na academia.
    const nightInBrazil = new Date('2026-07-28T01:00:00Z'); // 22h de 27/07 em -03
    expect(localDayOfWeek(-180, nightInBrazil)).toBe('MONDAY');
    expect(localDayOfWeek(0, nightInBrazil)).toBe('TUESDAY');
  });

  it('cobre fuso de meia hora', () => {
    const instant = new Date('2026-07-28T18:45:00Z');
    expect(localDayOfWeek(330, instant)).toBe('WEDNESDAY'); // Índia, +05:30
  });
});
