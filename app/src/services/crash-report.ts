import { Platform } from 'react-native';

import { api, isAuthenticated } from './api.service';

/**
 * O relator de erro de JavaScript — manda ao servidor o que o iOS não manda.
 *
 * Um crash chegou pelo TestFlight (22/08/2026) como "RCTFatal — Unhandled JS
 * Exception", sem mensagem nem pilha: o log nativo do iOS não carrega o erro
 * do JS, e a linha que derrubou o app ficou desconhecida. Aqui o tratador
 * global do React Native recebe o erro ANTES de o app morrer e dispara um
 * POST com mensagem, pilha e versão; a rede pode não completar num crash
 * fatal, mas na maioria das vezes completa — e um erro não fatal sempre chega.
 *
 * O tratador anterior continua sendo chamado: é ele que mostra a tela
 * vermelha em desenvolvimento e mata o app em produção. Este módulo só
 * observa.
 */

const app = require('../../app.json') as { expo: { version: string; ios?: { buildNumber?: string } } };
export const APP_VERSION = app.expo.version;
export const APP_BUILD = app.expo.ios?.buildNumber ?? '?';

let telaAtual: string | null = null;
/** A tela em foco, para o relato dizer onde foi. Alimentado pela navegação. */
export function marcarTela(nome: string | null) {
  telaAtual = nome;
}

type ErrorUtilsLike = {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

export function relatarErro(error: unknown, fatal: boolean, origem?: string) {
  if (!isAuthenticated()) return;
  const e = error as { message?: string; stack?: string } | null;
  const message = (e?.message ?? String(error)).slice(0, 2000);
  const stack = (e?.stack ?? '').slice(0, 8000);
  void api
    .post(
      '/client-errors',
      {
        message,
        stack,
        fatal,
        version: APP_VERSION,
        build: APP_BUILD,
        platform: Platform.OS,
        screen: origem ?? telaAtual ?? undefined,
        at: new Date().toISOString(),
      },
      { timeout: 4000 },
    )
    .catch(() => undefined);
}

let instalado = false;

/**
 * O erro fatal mais recente, para a raiz mostrar a tela de recuperação.
 *
 * Três crashes em dois builds (22/08) tinham a mesma assinatura — RCTFatal,
 * erro de JS não tratado — em momentos diferentes: cancelar check-in,
 * concluir treino, desconectar a pulseira. Em produção o tratador padrão do
 * React Native ABORTA o processo. Aqui, em produção, o erro é relatado e a
 * raiz troca a árvore pela tela de recuperação: o estado das stores continua
 * de pé e "Tentar de novo" devolve o app. Em desenvolvimento o comportamento
 * antigo fica — a tela vermelha é a ferramenta certa ali.
 */
let ouvintesDeFatal: ((erro: unknown) => void)[] = [];
export function aoErroFatal(ouvinte: (erro: unknown) => void): () => void {
  ouvintesDeFatal.push(ouvinte);
  return () => {
    ouvintesDeFatal = ouvintesDeFatal.filter((o) => o !== ouvinte);
  };
}

/** Instala o observador uma vez. Chamar na raiz do app. */
export function instalarRelatorDeErros() {
  if (instalado) return;
  instalado = true;
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  const anterior = utils?.getGlobalHandler?.();
  utils?.setGlobalHandler?.((error, isFatal) => {
    try {
      relatarErro(error, !!isFatal);
    } catch {
      // relatar nunca pode ser a causa de um segundo erro
    }
    if (__DEV__ || !isFatal) {
      anterior?.(error, isFatal);
      return;
    }
    // Produção, fatal: não aborta. A raiz mostra a recuperação.
    for (const ouvinte of ouvintesDeFatal) {
      try {
        ouvinte(error);
      } catch {
        // idem
      }
    }
  });
}
