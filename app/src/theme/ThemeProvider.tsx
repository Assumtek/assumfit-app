import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';

import { darkPalette, lightPalette, type Palette } from './palette';

/**
 * `system` é o padrão, e isso não é indecisão.
 *
 * Quem já configurou o aparelho para escurecer à noite espera que TODO app
 * acompanhe; um app de saúde que ignora isso e brilha branco às 3h contradiz o
 * próprio produto — ele existe para cuidar do sono da pessoa. `light` e `dark`
 * são a saída para quem quer fixar, não o caminho principal.
 */
export type ThemeMode = 'system' | 'light' | 'dark' | 'auto';
/** Janela do claro no modo automático, em minutos do dia (Leonardo, 22/08). */
export type AutoHoras = { claroDesde: number; escuroDesde: number };
export const AUTO_PADRAO: AutoHoras = { claroDesde: 7 * 60, escuroDesde: 19 * 60 };
export type Scheme = 'light' | 'dark';

export type Theme = {
  mode: ThemeMode;
  /** O esquema efetivamente aplicado depois de resolver `system`. */
  scheme: Scheme;
  /**
   * O que o APARELHO está usando, independente da escolha no app.
   *
   * Importa para os efeitos nativos: o vidro do iOS 26 se adapta à aparência do
   * sistema, não à nossa. Quando os dois divergem, o efeito nativo sai errado e
   * quem precisa desenhar tem que saber disso.
   */
  systemScheme: Scheme;
  colors: Palette;
  setMode: (mode: ThemeMode) => void;
  autoHoras: AutoHoras;
  setAutoHoras: (h: AutoHoras) => void;
};

const PREF_KEY = 'assumfit.theme';

/**
 * Preferência de tema no mesmo armazenamento seguro dos tokens.
 *
 * Não é segredo — é escolha visual. Está ali só porque é o único armazenamento
 * persistente que o app já tem, e puxar uma dependência nova para guardar uma
 * string de sete caracteres não se paga. Diferente do token, a ausência do
 * nativo aqui não é erro: perder a preferência degrada para "segue o sistema",
 * que é o padrão de qualquer forma.
 */
type Store = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
};

const store: Store | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-secure-store') as Store;
    return typeof mod?.getItemAsync === 'function' ? mod : null;
  } catch {
    return null;
  }
})();

const isMode = (value: unknown): value is ThemeMode =>
  value === 'system' || value === 'light' || value === 'dark' || value === 'auto';

/**
 * O sistema tem TRÊS respostas: 'light', 'dark' e 'unspecified' — esta última
 * quando o aparelho não expressa preferência. Escuro é o padrão da marca, então
 * tudo que não é explicitamente claro cai no escuro.
 */
const normalize = (system: string | null | undefined): Scheme =>
  system === 'light' ? 'light' : 'dark';

const resolve = (mode: ThemeMode, system: Scheme, minutoDoDia: number, auto: AutoHoras): Scheme => {
  if (mode === 'system') return system;
  if (mode !== 'auto') return mode;
  // Claro dentro da janela [claroDesde, escuroDesde); fora dela, escuro.
  const { claroDesde, escuroDesde } = auto;
  const claro =
    claroDesde <= escuroDesde
      ? minutoDoDia >= claroDesde && minutoDoDia < escuroDesde
      : minutoDoDia >= claroDesde || minutoDoDia < escuroDesde;
  return claro ? 'light' : 'dark';
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [system, setSystem] = useState<Scheme>(() => normalize(Appearance.getColorScheme()));
  const [autoHoras, setAutoHorasState] = useState<AutoHoras>(AUTO_PADRAO);
  const [minutoDoDia, setMinutoDoDia] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      const m = d.getHours() * 60 + d.getMinutes();
      setMinutoDoDia((atual) => (atual === m ? atual : m));
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    let alive = true;
    store
      ?.getItemAsync(`${PREF_KEY}-auto`)
      .then((saved) => {
        if (!alive || !saved) return;
        const h = JSON.parse(saved) as Partial<AutoHoras>;
        if (typeof h.claroDesde === 'number' && typeof h.escuroDesde === 'number') setAutoHorasState({ claroDesde: h.claroDesde, escuroDesde: h.escuroDesde });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const setAutoHoras = useCallback((h: AutoHoras) => {
    setAutoHorasState(h);
    store?.setItemAsync(`${PREF_KEY}-auto`, JSON.stringify(h)).catch(() => undefined);
  }, []);

  // Só faz sentido escutar o sistema; quando o modo é fixo o valor é ignorado
  // no `resolve`, e desinscrever/reinscrever a cada troca não economiza nada.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(normalize(colorScheme)));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let alive = true;
    store
      ?.getItemAsync(PREF_KEY)
      .then((saved) => {
        if (alive && isMode(saved)) setModeState(saved);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    // Aplica antes de gravar: o toque precisa responder no mesmo quadro, e a
    // escrita no Keychain é assíncrona. Se a gravação falhar, o tema vale para
    // esta sessão e volta ao padrão na próxima — degradação aceitável.
    setModeState(next);
    store?.setItemAsync(PREF_KEY, next).catch(() => undefined);
  }, []);

  const scheme = resolve(mode, system, minutoDoDia, autoHoras);

  const value = useMemo<Theme>(() => {
    const colors = scheme === 'light' ? lightPalette : darkPalette;
    return { mode, scheme, systemScheme: system, colors, setMode, autoHoras, setAutoHoras };
  }, [mode, scheme, system, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme fora do ThemeProvider.');
  return theme;
}

/** Atalho para quem só precisa da paleta. */
export const useColors = (): Palette => useTheme().colors;
