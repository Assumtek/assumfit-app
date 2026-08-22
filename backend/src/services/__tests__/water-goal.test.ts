import { waterGoalMl } from '../water-goal';

describe('waterGoalMl (espelho da regra do app)', () => {
  it('60 kg, mulher → 2.100 ml — o mesmo número da tela de Água', () => {
    expect(waterGoalMl(60, 'f')).toBe(2100);
  });
  it('70 kg, homem → 2.500', () => {
    expect(waterGoalMl(70, 'm')).toBe(2500);
  });
  it('sem peso usa a referência por sexo', () => {
    expect(waterGoalMl(null, 'f')).toBe(2000);
    expect(waterGoalMl(undefined, 'm')).toBe(2500);
  });
  it('pessoa leve não desce abaixo do piso', () => {
    expect(waterGoalMl(45, 'f')).toBe(2000);
  });
  it('respeita o teto', () => {
    expect(waterGoalMl(200, 'm', 600)).toBe(4000);
  });
});
