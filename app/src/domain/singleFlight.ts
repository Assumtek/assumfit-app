/**
 * Uma execução por vez, compartilhada por quem chegar durante ela.
 *
 * Existe por causa de um incidente real (ago/2026). O interceptor de 401
 * renovava o token uma vez POR REQUISIÇÃO — protegia contra laço numa
 * requisição, e nada contra oito telas pedindo dado ao mesmo tempo. As oito
 * pegavam 401 juntas e disparavam oito renovações com o MESMO refresh token.
 *
 * O servidor rotaciona o refresh e detecta reapresentação: token já usado é
 * sinal de roubo, e a resposta é revogar TODAS as sessões da pessoa. Ou seja, a
 * primeira renovação passava e as outras sete acionavam a trava de segurança
 * contra o próprio dono — que era deslogado e ficava sem conseguir enviar nada,
 * com o app lendo cache. No log de produção: 11 respostas 200 e 13 respostas
 * 401 no mesmo endpoint, no mesmo segundo.
 *
 * A correção não é afrouxar a detecção de reuso — ela está certa. É o cliente
 * parar de reapresentar: uma renovação em voo, e quem chegar espera a mesma.
 */
export function umaPorVez<T>(): (fn: () => Promise<T>) => Promise<T> {
  let emVoo: Promise<T> | null = null;
  return (fn) => {
    if (!emVoo) {
      /*
       O `finally` limpa DEPOIS de assentar, e quem esperava já segurou a
       referência — então ninguém fica preso num resultado velho, e a próxima
       chamada depois do fim começa uma execução nova.
      */
      emVoo = fn().finally(() => {
        emVoo = null;
      });
    }
    return emVoo;
  };
}
