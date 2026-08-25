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
  setTodayWater?(json: string): void;
  consumeWaterPours?(): { ml: number; atMs: number }[];
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
  consumeSportActions?(): { action: string; atMs: number }[];
  addListener?(evento: 'onSportAction', ouvinte: () => void): { remove(): void };
  podeAbrirInstagramStories?(): boolean;
  abrirInstagramStories?(caminho: string): boolean;
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
// Widget de água — o total de hoje, e os goles que o botão dele registrou.
// ============================================================================

/** O que o widget de água desenha. Precisa casar com `AguaDeHoje` do Swift. */
export type AguaDoWidget = {
  ml: number;
  metaMl: number;
  copoMl: number;
  /** `yyyy-MM-dd` local — o widget zera o total quando a data não é hoje. */
  data: string;
};

export function publicarAguaDeHoje(agua: AguaDoWidget) {
  if (!nativo?.isSupported()) return;
  try {
    nativo.setTodayWater?.(JSON.stringify({ ...agua, gravadoEm: Date.now() / 1000 }));
  } catch {
    // Widget é enfeite: falha aqui não pode derrubar o registro de água.
  }
}

/** Drena os goles do botão do widget. Chamar UMA vez por volta ao primeiro plano. */
export function consumirGolesDoWidget(): { ml: number; atMs: number }[] {
  if (!nativo?.isSupported()) return [];
  try {
    return nativo.consumeWaterPours?.() ?? [];
  } catch {
    return [];
  }
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

// ============================================================================
// Botões DA ilha — pausar/retomar/encerrar tocados sem abrir o app.
// ============================================================================

export type AcaoDaIlha = { action: 'pause' | 'resume' | 'end'; atMs: number };

/**
 * Drena a fila de toques nos botões da ilha (devolve e apaga numa chamada só).
 *
 * O toque roda em NATIVO e já ajustou a própria ilha; o que fica na fila é o
 * que a TELA ainda precisa aplicar no estado dela — com o instante real do
 * toque, porque entre ele e o app acordar podem ter passado minutos.
 */
export function consumirAcoesDaIlha(): AcaoDaIlha[] {
  try {
    return (nativo?.consumeSportActions?.() ?? []).filter(
      (a): a is AcaoDaIlha =>
        (a.action === 'pause' || a.action === 'resume' || a.action === 'end') &&
        Number.isFinite(a.atMs),
    );
  } catch {
    return [];
  }
}

/**
 * A campainha: avisa que a fila tem coisa nova enquanto o JS está vivo. O
 * payload fica de fora de propósito — quem aplica lê SEMPRE da fila, para o
 * caminho do evento e o do retorno ao app serem um só.
 */
export function aoTocarNaIlha(ouvinte: () => void): () => void {
  try {
    const sub = nativo?.addListener?.('onSportAction', ouvinte);
    return () => sub?.remove();
  } catch {
    return () => {};
  }
}

// ============================================================================
// Instagram Stories — o caminho curto do cartão para o story.
// ============================================================================

/**
 * O Instagram está instalado e aceita story deste app?
 *
 * `false` também quando a checagem não pode ser feita (Android, build sem o
 * módulo). O botão não aparece, e o "Compartilhar" comum continua ali: nunca
 * se oferece um atalho que pode não levar a lugar nenhum.
 */
export function podeIrParaOInstagram(): boolean {
  try {
    return nativo?.podeAbrirInstagramStories?.() ?? false;
  } catch {
    return false;
  }
}

/**
 * Abre o Instagram Stories com a imagem já como fundo.
 *
 * Pedido de testador (Bruno, 24/08/2026): "vincular botão direto com o
 * Instagram, pra facilitar o post". Devolve `false` quando não deu, e aí a
 * tela cai no compartilhamento comum em vez de não fazer nada.
 */
export function irParaOInstagram(caminhoDaImagem: string): boolean {
  try {
    return nativo?.abrirInstagramStories?.(caminhoDaImagem) ?? false;
  } catch {
    return false;
  }
}
