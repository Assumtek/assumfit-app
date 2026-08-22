import { ladosDoExercicio } from '../exerciseSides';

describe('ladosDoExercicio', () => {
  it('o alongamento do relato — "gire o corpo para o lado oposto" — tem dois lados', () => {
    expect(
      ladosDoExercicio(
        'Alongamento de Bíceps na Parede',
        'Apoie a palma da mão na parede com os dedos apontados para baixo e o braço estendido. Gire o corpo para o lado oposto até sentir o alongamento no bíceps e ombro. Segure de 20 a 30 segundos.',
      ),
    ).toBe(2);
  });

  it('o quadríceps em pé do plano de teste — "dobre um joelho… mão do mesmo lado" — também', () => {
    expect(
      ladosDoExercicio(
        'Alongamento de Quadríceps em Pé',
        'Em pé, dobre um joelho levando o calcanhar ao glúteo e segure o pé com a mão do mesmo lado. Mantenha o joelho apontado para baixo e o tronco ereto. Segure de 20 a 30 segundos.',
      ),
    ).toBe(2);
  });

  it('"unilateral" no nome basta', () => {
    expect(ladosDoExercicio('Remada Unilateral (Serrote)')).toBe(2);
  });

  it('perna ou braço no singular é um lado de cada vez', () => {
    expect(ladosDoExercicio('Alongamento de quadríceps', 'Segure uma perna pelo tornozelo e puxe o calcanhar ao glúteo.')).toBe(2);
    expect(ladosDoExercicio('Alongamento de tríceps', 'Leve o braço direito atrás da cabeça e empurre o cotovelo.')).toBe(2);
  });

  it('alongamento simétrico tem um lado só', () => {
    expect(ladosDoExercicio('Alongamento de peito na porta', 'Apoie os dois antebraços no batente e incline o tronco à frente.')).toBe(1);
    expect(ladosDoExercicio('Prancha', 'Mantenha o corpo alinhado, apoiado nos antebraços.')).toBe(1);
    expect(ladosDoExercicio('Corrida leve')).toBe(1);
  });

  it('"lados" no plural não é pista — "mãos nos lados do corpo" é bilateral', () => {
    expect(ladosDoExercicio('Elevação de ombros', 'Braços estendidos nos lados do corpo.')).toBe(1);
  });
});
