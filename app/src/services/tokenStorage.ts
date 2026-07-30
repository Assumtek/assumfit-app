export type Tokens = { accessToken: string; refreshToken: string };

const KEY = 'assumfit.tokens';

/**
 * Token no Keychain (iOS) / Keystore (Android), nunca em AsyncStorage.
 *
 * A diferença não é cosmética: AsyncStorage é texto claro no sandbox do app, e
 * num aparelho com root ou num backup não criptografado o token sai junto. Com
 * ele, um terceiro lê o histórico biométrico inteiro da pessoa.
 *
 * Sobre o fallback: `expo-secure-store` é módulo nativo, então um dev client
 * compilado antes dele não o tem. Import estático derrubaria o app inteiro, o
 * que é pior. Mas degradar para memória em PRODUÇÃO seria uma regressão de
 * segurança escondida atrás de um `catch` — por isso o fallback vale só em
 * desenvolvimento, e em produção a ausência do módulo é erro fatal e explícito.
 */
type SecureStoreModule = {
  setItemAsync: (key: string, value: string, options?: Record<string, unknown>) => Promise<void>;
  getItemAsync: (key: string) => Promise<string | null>;
  deleteItemAsync: (key: string) => Promise<void>;
  WHEN_UNLOCKED_THIS_DEVICE_ONLY?: unknown;
};

const secureStore: SecureStoreModule | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-secure-store') as SecureStoreModule;
    // Tocar num método confirma que o nativo respondeu, não só que o JS existe.
    if (typeof mod?.setItemAsync !== 'function') return null;
    return mod;
  } catch {
    return null;
  }
})();

if (!secureStore && !__DEV__) {
  throw new Error(
    'expo-secure-store indisponível. O app não pode guardar credenciais sem armazenamento seguro do sistema.',
  );
}

/** Só existe em desenvolvimento, quando o dev client ainda não tem o nativo. */
let devFallback: string | null = null;

if (!secureStore && __DEV__) {
  console.warn(
    '[tokenStorage] expo-secure-store ausente: usando memória. Reconstrua o dev client — em produção isto é erro fatal.',
  );
}

/**
 * Keychain recusou a gravação. Erro com nome próprio porque o genérico vira
 * "Sem conexão com o servidor" na tela de login — foi o que transformou um
 * build de simulador sem assinatura numa caça a problema de rede.
 */
export class KeychainSaveError extends Error {
  constructor(cause: unknown) {
    super('Keychain recusou gravar a sessão');
    this.name = 'KeychainSaveError';
    this.cause = cause;
  }
}

export async function saveTokens(tokens: Tokens): Promise<void> {
  const serialized = JSON.stringify(tokens);
  if (!secureStore) {
    devFallback = serialized;
    return;
  }
  try {
    await secureStore.setItemAsync(KEY, serialized, {
      keychainAccessible: secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch (err) {
    throw new KeychainSaveError(err);
  }
}

export async function loadTokens(): Promise<Tokens | null> {
  try {
    const raw = secureStore ? await secureStore.getItemAsync(KEY) : devFallback;
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    // Item corrompido ou Keychain indisponível: trata como sessão ausente.
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  devFallback = null;
  if (secureStore) await secureStore.deleteItemAsync(KEY).catch(() => undefined);
}

/** Verdadeiro quando as credenciais estão no armazenamento seguro do sistema. */
export const usingSecureStorage = secureStore !== null;
