import {
  formatDateBR,
  isValidBirthDate,
  maskBirthDate,
  toIsoBirthDate,
} from '../birthDate';

describe('formatDateBR', () => {
  it('ISO do servidor vira data brasileira', () => {
    expect(formatDateBR('1994-03-12')).toBe('12/03/1994');
    expect(formatDateBR('1994-03-12T00:00:00.000Z')).toBe('12/03/1994');
  });

  it('ausente vira vazio, não "null"', () => {
    expect(formatDateBR(null)).toBe('');
    expect(formatDateBR(undefined)).toBe('');
    expect(formatDateBR('')).toBe('');
  });
});

describe('toIsoBirthDate', () => {
  it('data brasileira vira ISO', () => {
    expect(toIsoBirthDate('12/03/1994')).toBe('1994-03-12');
    expect(toIsoBirthDate(' 01/01/2000 ')).toBe('2000-01-01');
  });

  it('recusa data que não existe no calendário', () => {
    expect(toIsoBirthDate('31/02/1994')).toBeNull();
    expect(toIsoBirthDate('32/01/1994')).toBeNull();
    expect(toIsoBirthDate('12/13/1994')).toBeNull();
  });

  it('recusa formato incompleto', () => {
    expect(toIsoBirthDate('12/03/94')).toBeNull();
    expect(toIsoBirthDate('1994-03-12')).toBeNull();
    expect(toIsoBirthDate('')).toBeNull();
  });

  it('ida e volta preserva a data', () => {
    expect(formatDateBR(toIsoBirthDate('29/02/2024')!)).toBe('29/02/2024');
  });
});

describe('maskBirthDate', () => {
  it('as barras entram sozinhas conforme se digita', () => {
    expect(maskBirthDate('1')).toBe('1');
    expect(maskBirthDate('12')).toBe('12');
    expect(maskBirthDate('123')).toBe('12/3');
    expect(maskBirthDate('1203')).toBe('12/03');
    expect(maskBirthDate('12031994')).toBe('12/03/1994');
  });

  it('ignora o que não é dígito e não passa de oito', () => {
    expect(maskBirthDate('12/03/1994')).toBe('12/03/1994');
    expect(maskBirthDate('120319945555')).toBe('12/03/1994');
    expect(maskBirthDate('abc')).toBe('');
  });
});

describe('isValidBirthDate', () => {
  it('aceita adulto', () => {
    const trintaAnos = new Date();
    trintaAnos.setFullYear(trintaAnos.getFullYear() - 30);
    const d = String(trintaAnos.getDate()).padStart(2, '0');
    const m = String(trintaAnos.getMonth() + 1).padStart(2, '0');
    expect(isValidBirthDate(`${d}/${m}/${trintaAnos.getFullYear()}`)).toBe(true);
  });

  it('recusa criança e idade impossível', () => {
    const ano = new Date().getFullYear();
    expect(isValidBirthDate(`01/01/${ano - 5}`)).toBe(false);
    expect(isValidBirthDate('01/01/1890')).toBe(false);
  });

  it('recusa data inexistente antes de olhar a idade', () => {
    expect(isValidBirthDate('31/02/1990')).toBe(false);
  });
});
