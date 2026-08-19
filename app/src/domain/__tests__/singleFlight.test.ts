import { umaPorVez } from '../singleFlight';

/**
 * O defeito que isto impede derrubava a sessão de quem estava usando o app.
 *
 * Oito telas pediam dado ao mesmo tempo, todas pegavam 401 e todas renovavam o
 * token com o mesmo refresh. O servidor rotaciona e trata reapresentação como
 * roubo — revogando TODAS as sessões da pessoa. A primeira renovação passava, as
 * outras sete acionavam a trava contra o próprio dono.
 */
describe('umaPorVez', () => {
  it('oito chamadas simultâneas executam UMA vez', async () => {
    let execucoes = 0;
    const compartilhar = umaPorVez<string>();
    let liberar: (v: string) => void = () => undefined;
    const fn = () => {
      execucoes += 1;
      return new Promise<string>((r) => {
        liberar = r;
      });
    };

    const todas = Promise.all(Array.from({ length: 8 }, () => compartilhar(fn)));
    liberar('token-novo');
    const resultados = await todas;

    expect(execucoes).toBe(1);
    // E todas recebem o MESMO resultado — não sobra ninguém com token velho.
    expect(resultados).toEqual(Array(8).fill('token-novo'));
  });

  it('depois de terminar, a próxima chamada executa de novo', async () => {
    let execucoes = 0;
    const compartilhar = umaPorVez<number>();
    const fn = async () => ++execucoes;

    await compartilhar(fn);
    await compartilhar(fn);
    expect(execucoes).toBe(2);
  });

  it('a falha chega a TODOS os que esperavam, e não trava a próxima', async () => {
    let execucoes = 0;
    const compartilhar = umaPorVez<number>();
    const falha = () => {
      execucoes += 1;
      return Promise.reject(new Error('401'));
    };

    const a = compartilhar(falha).catch((e) => (e as Error).message);
    const b = compartilhar(falha).catch((e) => (e as Error).message);
    expect(await a).toBe('401');
    expect(await b).toBe('401');
    expect(execucoes).toBe(1);

    // Sessão nova depois do fracasso: não fica preso no erro anterior.
    await compartilhar(falha).catch(() => undefined);
    expect(execucoes).toBe(2);
  });
});
