import { frasedaValidade, validadeDoPlano } from '../validadeDoPlano';

/**
 * "O projeto de treino venceu e morreu por falta de acompanhamento" (pedido de
 * testador). O plano nasce com 30 dias e nada olhava para isso.
 */
const hoje = new Date('2026-09-25T10:00:00');
const emDias = (n: number) => new Date(hoje.getTime() + n * 86_400_000).toISOString();

describe('validade do plano', () => {
  it('plano novo está vigente e não fala nada', () => {
    const v = validadeDoPlano(emDias(20), hoje)!;
    expect(v.estado).toBe('vigente');
    expect(frasedaValidade(v)).toBe('');
  });

  it('na última semana, avisa com os dias que faltam', () => {
    const v = validadeDoPlano(emDias(5), hoje)!;
    expect(v.estado).toBe('acabando');
    expect(frasedaValidade(v)).toContain('5 dias');
  });

  it('a conta é por DIA, não por instante', () => {
    // Vence às 23h de hoje: para quem olha de manhã, termina HOJE, não venceu.
    const v = validadeDoPlano(new Date('2026-09-25T23:00:00').toISOString(), hoje)!;
    expect(v.estado).toBe('acabando');
    expect(frasedaValidade(v)).toContain('hoje');
  });

  it('vencido diz há quantos dias, e não esconde o plano', () => {
    const v = validadeDoPlano(emDias(-3), hoje)!;
    expect(v).toEqual({ estado: 'vencido', diasVencido: 3 });
    expect(frasedaValidade(v)).toContain('continua aqui');
  });

  it('singular e plural saem certos', () => {
    expect(frasedaValidade(validadeDoPlano(emDias(-1), hoje)!)).toContain('ontem');
    expect(frasedaValidade(validadeDoPlano(emDias(1), hoje)!)).toContain('amanhã');
  });

  it('sem data, não inventa estado', () => {
    expect(validadeDoPlano(null)).toBeNull();
    expect(validadeDoPlano('data inválida')).toBeNull();
  });
});
