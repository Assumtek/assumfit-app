import { requireOptionalNativeModule } from 'expo';

/**
 * Despertador pelo AlarmKit (iOS 26+).
 *
 * `requireOptionalNativeModule`: no Android e em build sem o módulo ele não
 * existe, e o planejador de sono volta ao caminho de abrir o app de relógio.
 */
declare class AlarmKitNativeModule {
  isSupported(): boolean;
  schedule(hour: number, minute: number, title: string): Promise<'scheduled' | 'denied' | 'unsupported'>;
}

const nativo = requireOptionalNativeModule<AlarmKitNativeModule>('AlarmKitBridge');

export function alarmeNativoDisponivel(): boolean {
  try {
    return nativo?.isSupported() ?? false;
  } catch {
    return false;
  }
}

/** Marca o alarme na próxima ocorrência de `hora:minuto`. */
export async function marcarAlarme(
  hora: number,
  minuto: number,
  titulo: string,
): Promise<'scheduled' | 'denied' | 'unsupported' | 'error'> {
  if (!nativo) return 'unsupported';
  try {
    return await nativo.schedule(hora, minuto, titulo);
  } catch {
    return 'error';
  }
}
