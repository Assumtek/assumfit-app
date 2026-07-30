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
  startSportActivity?(label: string, symbol: string, startedAtMs: number, endsAtMs: number | null): boolean;
  updateSportActivity?(
    startedAtMs: number,
    pausedAtMs: number | null,
    distanceKm: number | null,
    bpm: number | null,
    endsAtMs: number | null,
    phase: string | null,
  ): void;
  endSportActivity?(): void;
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

// ============================================================================
// Live Activity da sessão de esporte — a Dynamic Island conta o tempo sozinha.
// ============================================================================

export function iniciarIlhaDeEsporte(
  label: string,
  startedAtMs: number,
  opcoes?: { symbol?: string; endsAtMs?: number },
): boolean {
  try {
    return (
      nativo?.startSportActivity?.(label, opcoes?.symbol ?? 'figure.run', startedAtMs, opcoes?.endsAtMs ?? null) ??
      false
    );
  } catch {
    return false;
  }
}

export function atualizarIlhaDeEsporte(input: {
  startedAtMs: number;
  pausedAtMs?: number | null;
  distanceKm?: number | null;
  bpm?: number | null;
  endsAtMs?: number | null;
  phase?: string | null;
}) {
  try {
    nativo?.updateSportActivity?.(
      input.startedAtMs,
      input.pausedAtMs ?? null,
      input.distanceKm ?? null,
      input.bpm ?? null,
      input.endsAtMs ?? null,
      input.phase ?? null,
    );
  } catch {
    // Ilha é enfeite de luxo: falhar aqui não pode tocar na sessão.
  }
}

export function encerrarIlhaDeEsporte() {
  try {
    nativo?.endSportActivity?.();
  } catch {
    // idem
  }
}
