import { create } from 'zustand';

import { ble } from '../services/ble';

/**
 * Avisar no pulso: a preferência, e por que ela precisa existir.
 *
 * A tela do dispositivo tinha uma AÇÃO ("ligar avisos do AssumFit no pulso")
 * cujo resultado vivia no estado do componente. Sair da tela e voltar
 * desmontava o componente, o estado voltava ao início, e a linha reaparecia
 * como se nada tivesse sido feito: "eu seleciono, porém quando volto ele
 * desliga. Pode substituir o clique por um toggle pra elucidar se está ativo"
 * (Bruno, 25/08/2026). O comando tinha ido para a pulseira; o que se perdia era
 * a memória de tê-lo mandado.
 *
 * **O aviso no pulso tem dois caminhos, e o interruptor cobre os dois.**
 *
 * 1. Com o app vivo, quem manda vibrar é o app, no fim do descanso e do
 *    alongamento. Isso o app controla inteiramente.
 * 2. Com a tela apagada, quem entrega é o iOS pelo ANCS, e o firmware só LIGA:
 *    `setANCSFlag` não tem contrapartida. Desligar não desfaz o emparelhamento
 *    de sistema, e a tela não promete que desfaz.
 *
 * **O padrão é LIGADO**, e não é preferência estética: o app já vibrava no fim
 * do descanso desde sempre, e nascer desligado tiraria em silêncio um aviso que
 * as pessoas já usam. Quem não quiser desliga; ninguém perde nada sem pedir.
 */

const CHAVE = 'assumfit.avisosNoPulso';

type Estado = {
  /** `undefined` enquanto não leu do disco: a tela não deve piscar um valor. */
  ligado: boolean | undefined;
  /** A pulseira recusou o pedido de avisar com a tela apagada. */
  ancsRecusado: boolean;
  carregar: () => Promise<void>;
  definir: (ligado: boolean) => Promise<void>;
};

type Prefs = {
  getItemAsync: (k: string) => Promise<string | null>;
  setItemAsync: (k: string, v: string) => Promise<void>;
};

const prefs: Prefs | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-secure-store') as Prefs;
    return typeof mod?.getItemAsync === 'function' ? mod : null;
  } catch {
    return null;
  }
})();

/** O ANCS já foi pedido nesta execução? Ele é idempotente, mas o rádio não é de graça. */
let ancsPedido = false;

async function pedirAncs(): Promise<boolean> {
  ancsPedido = true;
  return (await ble.enableAncs?.().catch(() => false)) ?? false;
}

export const useAvisosNoPulsoStore = create<Estado>((set, get) => ({
  ligado: undefined,
  ancsRecusado: false,

  carregar: async () => {
    if (get().ligado !== undefined) return;
    let ligado = true; // ausente no disco = padrão de fábrica
    try {
      const salvo = await prefs?.getItemAsync(CHAVE);
      if (salvo != null) ligado = salvo === '1';
    } catch {
      // Preferência ilegível não pode desligar um aviso que já funcionava.
    }
    set({ ligado });
    /*
     Ligado e ainda sem ter pedido o ANCS nesta execução: pede agora, sem
     bloquear a tela. É o que faz a tela apagada funcionar para quem nunca
     tocou no interruptor, já que o padrão é ligado. Recusa não desliga a
     preferência: o caminho do app vivo continua valendo, e é metade do
     recurso.
    */
    if (ligado && !ancsPedido) {
      const ok = await pedirAncs();
      if (!ok) set({ ancsRecusado: true });
    }
  },

  definir: async (ligado) => {
    // O interruptor responde no mesmo quadro: esperar a pulseira o deixaria
    // preso enquanto o rádio conversa, e é gesto de configuração, não de dado.
    set({ ligado, ancsRecusado: false });
    void prefs?.setItemAsync(CHAVE, ligado ? '1' : '0').catch(() => undefined);
    if (!ligado) return;
    if (!(await pedirAncs())) set({ ancsRecusado: true });
  },
}));

/**
 * O app deve mandar a pulseira vibrar agora?
 *
 * `undefined` (preferência ainda não lida) conta como LIGADO, pelo mesmo motivo
 * do padrão: um treino que começa antes de o disco responder não pode perder o
 * aviso do fim do descanso.
 */
export function avisoNoPulsoLigado(): boolean {
  return useAvisosNoPulsoStore.getState().ligado !== false;
}
