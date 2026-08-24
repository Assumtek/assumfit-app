import { reconciliarDia } from '../aguaSync';

const hoje = '2026-08-24';

describe('reconciliar a água do dia', () => {
  it('servidor à frente manda, e nada é reenviado', () => {
    // Registro feito em outro aparelho, ou antes de esta sessão existir.
    const r = reconciliarDia({ date: hoje, waterMl: 200 }, { date: hoje, waterMl: 1000 });
    expect(r).toEqual({ waterMl: 1000, reenviar: false, motivo: 'servidor' });
  });

  it('local à frente vence, e a diferença volta para o servidor', () => {
    // O relato do Leonardo (24/08/2026): o app tinha a água registrada, o
    // servidor tinha menos porque uma gravação se perdeu, e a regra antiga
    // adotava o servidor sem olhar o valor. A tela baixava sozinha.
    const r = reconciliarDia({ date: hoje, waterMl: 1000 }, { date: hoje, waterMl: 200 });
    expect(r).toEqual({ waterMl: 1000, reenviar: true, motivo: 'local-maior' });
  });

  it('empate não gera reenvio', () => {
    const r = reconciliarDia({ date: hoje, waterMl: 800 }, { date: hoje, waterMl: 800 });
    expect(r.reenviar).toBe(false);
  });

  it('dia que o servidor não tem não vale zero', () => {
    // Ausência não é o mesmo que zero: é gravação que ainda não subiu.
    const r = reconciliarDia({ date: hoje, waterMl: 600 }, null);
    expect(r).toEqual({ waterMl: 600, reenviar: true, motivo: 'sem-servidor' });
  });

  it('dia novo sem nada local nem no servidor não pede reenvio', () => {
    expect(reconciliarDia({ date: hoje, waterMl: 0 }, null).reenviar).toBe(false);
  });

  it('resposta de outro dia não encosta no total de hoje', () => {
    // A virada da meia-noite com resposta em voo: o servidor responde sobre
    // ontem enquanto o app já rolou o dia.
    const r = reconciliarDia({ date: hoje, waterMl: 400 }, { date: '2026-08-23', waterMl: 3000 });
    expect(r.waterMl).toBe(400);
    expect(r.motivo).toBe('outro-dia');
  });
});
