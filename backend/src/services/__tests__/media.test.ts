import { FORMATO_DA_CHAVE, chaveEhDoUsuario } from '../media.service';

/**
 * A chave da imagem viaja até o aparelho e volta em pedidos de leitura e de
 * exclusão. Estas travas são o que impede uma chave forjada de ler a foto de
 * outra pessoa, ou de apontar para fora do nosso prefixo.
 */
const DONO = '11111111-1111-4111-8111-111111111111';
const OUTRO = '22222222-2222-4222-8222-222222222222';

describe('chave de imagem', () => {
  it('aceita a chave que o serviço gera', () => {
    expect(FORMATO_DA_CHAVE.test(`img/${DONO}/refeicao/m1k2j3-a9f0z1b2.jpg`)).toBe(true);
    expect(FORMATO_DA_CHAVE.test(`img/${DONO}/evolucao/m1k2j3-a9f0z1b2.png`)).toBe(true);
  });

  it('recusa escopo inventado e extensão fora da lista', () => {
    expect(FORMATO_DA_CHAVE.test(`img/${DONO}/backup/abc.jpg`)).toBe(false);
    expect(FORMATO_DA_CHAVE.test(`img/${DONO}/chat/abc.svg`)).toBe(false);
  });

  it('recusa caminho e prefixo de fora', () => {
    expect(FORMATO_DA_CHAVE.test(`img/${DONO}/chat/../../../etc/passwd`)).toBe(false);
    expect(FORMATO_DA_CHAVE.test('audio/x/y.jpg')).toBe(false);
  });

  it('a foto de uma conta não é legível por outra', () => {
    const chave = `img/${DONO}/evolucao/m1k2j3-a9f0z1b2.jpg`;
    expect(chaveEhDoUsuario(chave, DONO)).toBe(true);
    expect(chaveEhDoUsuario(chave, OUTRO)).toBe(false);
  });
});
