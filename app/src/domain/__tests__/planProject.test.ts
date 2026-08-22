import {
  alternaEmpurrarEPuxar,
  fatosDoProjeto,
  frequenciaPorGrupo,
  semanaDoProjeto,
  type TreinoDoProjeto,
} from '../planProject';

/**
 * O projeto por trás do plano.
 *
 * Nasceu de uma pergunta real: "não sei qual a metodologia, ele fica
 * intercalando peito e costas". A ordem estava CERTA — pareamento
 * agonista-antagonista — e mesmo assim chegou como relato de defeito. Escolha
 * deliberada que não se explica é indistinguível de erro.
 */

const ex = (name: string, muscleGroup: string) => ({ name, muscleGroup, subtype: 'STRENGTH' });

/** O treino de segunda do plano que originou tudo, na ordem real do banco. */
const upperA: TreinoDoProjeto = {
  name: 'Upper A: Peito, Costas e Ombro',
  temPreparo: true,
  principais: [
    ex('Supino Máquina', 'PEITO'),
    ex('Puxada Alta', 'COSTAS'),
    ex('Supino Inclinado', 'PEITO'),
    ex('Remada Cavalinho', 'COSTAS'),
    ex('Elevação Lateral', 'OMBROS'),
    ex('Face Pull', 'OMBROS'),
  ],
};

describe('alternaEmpurrarEPuxar', () => {
  it('reconhece o caso do relato: peito, costas, peito, costas', () => {
    expect(alternaEmpurrarEPuxar(upperA.principais)).toBe(true);
  });

  it('sequência agrupada NÃO é alternância', () => {
    const agrupado = [
      ex('Supino', 'PEITO'),
      ex('Supino Inclinado', 'PEITO'),
      ex('Puxada', 'COSTAS'),
      ex('Remada', 'COSTAS'),
    ];
    expect(alternaEmpurrarEPuxar(agrupado)).toBe(false);
  });

  it('uma troca só é sequência, não padrão', () => {
    // "peito, peito, costas, costas" tem uma virada — acontece por acaso em
    // qualquer treino de superiores. Afirmar método aí seria inventar intenção.
    const umaTroca = [
      ex('Supino', 'PEITO'),
      ex('Crucifixo', 'PEITO'),
      ex('Puxada', 'COSTAS'),
      ex('Remada', 'COSTAS'),
    ];
    expect(alternaEmpurrarEPuxar(umaTroca)).toBe(false);
  });

  it('treino curto demais não sustenta a afirmação', () => {
    expect(alternaEmpurrarEPuxar([ex('Supino', 'PEITO'), ex('Puxada', 'COSTAS')])).toBe(false);
  });

  it('grupo fora do par empurrar/puxar não conta nem atrapalha', () => {
    const comAbdomen = [
      ex('Supino', 'PEITO'),
      ex('Prancha', 'ABDOMEN'),
      ex('Puxada', 'COSTAS'),
      ex('Supino Inclinado', 'PEITO'),
      ex('Remada', 'COSTAS'),
    ];
    expect(alternaEmpurrarEPuxar(comAbdomen)).toBe(true);
  });
});

describe('frequenciaPorGrupo', () => {
  it('conta o dia UMA vez por grupo, mesmo com dois exercícios dele', () => {
    // Peito aparece duas vezes na segunda: é um dia de peito, não dois.
    expect(frequenciaPorGrupo([upperA]).get('PEITO')).toBe(1);
  });

  it('soma os dias em que o grupo volta', () => {
    expect(frequenciaPorGrupo([upperA, upperA]).get('COSTAS')).toBe(2);
  });
});

describe('fatosDoProjeto', () => {
  it('afirma a alternância quando ela existe, com o porquê', () => {
    const fatos = fatosDoProjeto([upperA, upperA]);
    const alternancia = fatos.find((f) => f.chave === 'alternancia');
    expect(alternancia?.porque).toContain('descansa enquanto o outro trabalha');
    // A frase precisa desarmar a leitura de defeito, que é o que motivou a tela.
    expect(alternancia?.porque).toContain('de propósito');
  });

  it('NÃO afirma alternância num plano que agrupa', () => {
    const agrupado: TreinoDoProjeto = {
      ...upperA,
      principais: [
        ex('Supino', 'PEITO'),
        ex('Crucifixo', 'PEITO'),
        ex('Puxada', 'COSTAS'),
        ex('Remada', 'COSTAS'),
      ],
    };
    expect(fatosDoProjeto([agrupado]).some((f) => f.chave === 'alternancia')).toBe(false);
  });

  it('só afirma preparo quando TODAS as sessões o têm', () => {
    const sem = { ...upperA, temPreparo: false };
    expect(fatosDoProjeto([upperA, sem]).some((f) => f.chave === 'preparo')).toBe(false);
    expect(fatosDoProjeto([upperA, upperA]).some((f) => f.chave === 'preparo')).toBe(true);
  });

  it('plano vazio não inventa fato nenhum', () => {
    expect(fatosDoProjeto([])).toEqual([]);
  });
});

describe('semanaDoProjeto', () => {
  it('segunda a domingo, na ordem da semana, com descanso nos dias sem treino', () => {
    const semana = semanaDoProjeto([
      { dayOfWeek: 'THURSDAY', dayType: 'WORKOUT', workout: { name: 'Superior B' } },
      { dayOfWeek: 'SUNDAY', dayType: 'WORKOUT', workout: { name: 'Inferior B' } },
      { dayOfWeek: 'MONDAY', dayType: 'WORKOUT', workout: { name: 'Sprints' } },
      { dayOfWeek: 'FRIDAY', dayType: 'OFF' },
    ]);
    expect(semana.map((d) => d.dayOfWeek)).toEqual(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
    expect(semana.map((d) => d.nome)).toEqual(['Sprints', null, null, 'Superior B', null, null, 'Inferior B']);
  });
});

describe('fatosDoProjeto com anamnese', () => {
  const treino = (name: string, n: number) => ({
    name,
    temPreparo: true,
    principais: Array.from({ length: n }, (_, i) => ({ name: `e${i}`, muscleGroup: i % 2 ? 'PEITO' : 'COSTAS', subtype: 'STRENGTH' as const })),
  });
  it('cita os dias informados quando o plano os obedece, e o tempo por sessão', () => {
    const fatos = fatosDoProjeto([treino('A', 4), treino('B', 4), treino('C', 4)], { daysPerWeek: 3, minutesPerSession: 45, experience: 'intermediario' });
    expect(fatos.find((f) => f.chave === 'frequencia')?.porque).toContain('3 dias por semana que você informou');
    expect(fatos.find((f) => f.chave === 'tempo')?.porque).toContain('45 minutos por sessão');
    expect(fatos.find((f) => f.chave === 'nivel')?.titulo).toContain('constância');
  });
  it('dias que não batem não viram promessa', () => {
    const fatos = fatosDoProjeto([treino('A', 4), treino('B', 4)], { daysPerWeek: 4 });
    expect(fatos.find((f) => f.chave === 'frequencia')?.porque ?? '').not.toContain('informou');
  });
  it('sem anamnese, nada muda', () => {
    expect(fatosDoProjeto([treino('A', 4), treino('B', 4)]).some((f) => f.chave === 'nivel' || f.chave === 'tempo')).toBe(false);
  });
});
