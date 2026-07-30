import { requireOptionalNativeModule } from 'expo';

/**
 * Ponte para o widget do treino de hoje.
 *
 * O widget vive em outro processo e não enxerga nada do app: o App Group é a
 * única superfície compartilhada. Este módulo é o lado de escrita dela.
 *
 * `requireOptionalNativeModule` e não `requireNativeModule`: no Android e em
 * qualquer build sem o entitlement do App Group o módulo não existe, e o app
 * não pode quebrar por causa disso — widget é enfeite, não função crítica.
 */
declare class WidgetBridgeNativeModule {
  isSupported(): boolean;
  setTodayWorkout(json: string): void;
  clear(): void;
}

const nativo = requireOptionalNativeModule<WidgetBridgeNativeModule>('WidgetBridge');

/** O que o widget desenha. Precisa casar com o `TreinoDoDia` do Swift. */
export type TreinoDoWidget = {
  nome: string;
  detalhe: string;
  minutos: number | null;
  descanso: boolean;
};

export function publicarTreinoDeHoje(treino: TreinoDoWidget | null) {
  if (!nativo?.isSupported()) return;
  if (!treino) return nativo.clear();
  nativo.setTodayWorkout(
    JSON.stringify({ ...treino, gravadoEm: Date.now() / 1000 }),
  );
}

export function limparWidget() {
  if (nativo?.isSupported()) nativo.clear();
}
