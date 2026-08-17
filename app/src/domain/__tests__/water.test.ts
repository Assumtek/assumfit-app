import { waterNudge } from '../water';

const META = 2500;
const COPO = 200;

describe('waterNudge', () => {
  it('nenhuma água hoje: o lembrete DIZ isso, e não uma frase genérica', () => {
    const n = waterNudge(0, META, COPO);
    expect(n?.title).toBe('Você ainda não bebeu água hoje');
    expect(n?.body).toContain('200 ml');
    expect(n?.body).toContain('2,5 L');
  });

  it('meta batida não gera lembrete', () => {
    expect(waterNudge(META, META, COPO)).toBeNull();
    expect(waterNudge(META + 500, META, COPO)).toBeNull();
  });

  it('longe da meta, fala em volume — "12 copos" desanima', () => {
    const n = waterNudge(500, META, COPO);
    expect(n?.title).toBe('Hora da água');
    expect(n?.body).toContain('0,5 L de 2,5 L');
    expect(n?.body).toContain('2,0 L');
  });

  it('no último terço, fala em copos — é o que resta de gesto', () => {
    const n = waterNudge(1800, META, COPO);
    expect(n?.title).toBe('Faltam 0,7 L para a meta');
    expect(n?.body).toContain('4 copos');
  });

  it('um copo só de diferença usa o singular', () => {
    const n = waterNudge(2400, META, COPO);
    expect(n?.body).toContain('1 copo');
    expect(n?.body).not.toContain('1 copos');
  });

  it('a conta segue o copo CADASTRADO, não o padrão', () => {
    const n = waterNudge(1800, META, 350);
    expect(n?.body).toContain('2 copos');
  });

  it('a fronteira do terço separa as duas vozes, sem buraco entre elas', () => {
    // Um mililitro de cada lado: a fronteira não pode deixar faixa sem texto,
    // e comparar float com float na borda exata é armadilha, não requisito.
    expect(waterNudge(META - META / 3 - 1, META, COPO)?.title).toBe('Hora da água');
    expect(waterNudge(META - META / 3 + 1, META, COPO)?.title).toContain('Faltam');
  });
});
