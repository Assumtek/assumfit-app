import { FORMATO_DA_FOTO } from '../workout/chat';

/**
 * O nome do arquivo da foto do chat vem do APARELHO e volta para ele, que o
 * usa para montar um caminho local. A trava existe porque um nome com "../"
 * viraria leitura fora da pasta do app.
 */
describe('formato do nome da foto do chat', () => {
  it('aceita o nome que o app gera', () => {
    expect(FORMATO_DA_FOTO.test('chat-m1k2j3-a9f0z1.jpg')).toBe(true);
  });

  it('recusa caminho', () => {
    expect(FORMATO_DA_FOTO.test('../../etc/passwd')).toBe(false);
    expect(FORMATO_DA_FOTO.test('chat-../segredo.jpg')).toBe(false);
    expect(FORMATO_DA_FOTO.test('/tmp/chat-abc.jpg')).toBe(false);
  });

  it('recusa outra extensão e outro prefixo', () => {
    expect(FORMATO_DA_FOTO.test('chat-abc.png')).toBe(false);
    expect(FORMATO_DA_FOTO.test('refeicao-abc.jpg')).toBe(false);
  });

  it('recusa nome sem limite', () => {
    expect(FORMATO_DA_FOTO.test(`chat-${'a'.repeat(200)}.jpg`)).toBe(false);
  });
});
