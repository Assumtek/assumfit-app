import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

import { lugaresFrequentes, type Lugar } from '../domain/habitos';
import { notifyNow } from './notifications.service';

/**
 * Lembrar de registrar ao CHEGAR no lugar do treino.
 *
 * Pedido de testador (ago/2026): "pelo GPS, reconhecer quando chega no local
 * onde normalmente pratica a atividade e lembrar do check-in". O app guarda
 * onde cada sessão de esporte começou (só coordenadas, só neste aparelho), e
 * os lugares que se repetem viram cercas de 150 m. Entrar numa cerca dispara
 * uma notificação local que abre o check-in.
 *
 * Cerca geográfica exige localização "Sempre" no iOS — é mais do que a sessão
 * de esporte pede, e por isso é opcional e pedido só quando a pessoa liga.
 * Desligado, as cercas são removidas e os lugares ficam guardados.
 */
const ARQUIVO = 'lugares-de-treino.v1.json';
const TAREFA = 'assumfit-lembrete-por-local';
const MAX_LUGARES = 5;
const RAIO_M = 150;

type Ponto = { lat: number; lon: number; at: number };
type State = {
  ligado: boolean;
  pontos: Ponto[];
  lugares: Lugar[];
  carregado: boolean;
  carregar: () => Promise<void>;
  registrarInicio: (p: { lat: number; lon: number }) => Promise<void>;
  ligar: (ligado: boolean) => Promise<boolean>;
};

function gravar(estado: { ligado: boolean; pontos: Ponto[] }) {
  try {
    new File(Paths.document, ARQUIVO).write(JSON.stringify(estado));
  } catch {
    // Perder os pontos custa reaprender os lugares; não pode derrubar a tela.
  }
}

TaskManager.defineTask(TAREFA, async ({ data, error }) => {
  if (error || !data) return;
  const { eventType, region } = data as { eventType: Location.GeofencingEventType; region: Location.LocationRegion };
  if (eventType !== Location.GeofencingEventType.Enter) return;
  // Uma por chegada, por lugar: o identificador da região evita empilhar.
  await notifyNow(`local-${region.identifier ?? 'x'}`, {
    title: 'Chegou no lugar do treino?',
    body: 'Toque para fazer o check-in e registrar a sessão.',
    route: 'Checkin',
  });
});

async function aplicarCercas(lugares: Lugar[]): Promise<void> {
  const rodando = await Location.hasStartedGeofencingAsync(TAREFA).catch(() => false);
  if (rodando) await Location.stopGeofencingAsync(TAREFA).catch(() => undefined);
  if (lugares.length === 0) return;
  await Location.startGeofencingAsync(
    TAREFA,
    lugares.slice(0, MAX_LUGARES).map((l, i) => ({
      identifier: `lugar-${i}`,
      latitude: l.lat,
      longitude: l.lon,
      radius: RAIO_M,
      notifyOnEnter: true,
      notifyOnExit: false,
    })),
  );
}

export const useLocalReminderStore = create<State>((set, get) => ({
  ligado: false,
  pontos: [],
  lugares: [],
  carregado: false,

  carregar: async () => {
    if (get().carregado) return;
    try {
      const f = new File(Paths.document, ARQUIVO);
      if (f.exists) {
        const salvo = JSON.parse(await f.text()) as { ligado: boolean; pontos: Ponto[] };
        const pontos = salvo.pontos ?? [];
        set({ ligado: salvo.ligado, pontos, lugares: lugaresFrequentes(pontos) });
      }
    } catch {
      // Arquivo corrompido = recomeça.
    }
    set({ carregado: true });
  },

  registrarInicio: async (p) => {
    if (!get().carregado) await get().carregar();
    // Os últimos 60 inícios bastam para achar os lugares; mais é só disco.
    const pontos = [...get().pontos, { ...p, at: Date.now() }].slice(-60);
    const lugares = lugaresFrequentes(pontos);
    set({ pontos, lugares });
    gravar({ ligado: get().ligado, pontos });
    if (get().ligado) await aplicarCercas(lugares).catch(() => undefined);
  },

  ligar: async (ligado) => {
    if (!get().carregado) await get().carregar();
    if (ligado) {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') return false;
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== 'granted') return false;
    }
    set({ ligado });
    gravar({ ligado, pontos: get().pontos });
    if (ligado) await aplicarCercas(get().lugares).catch(() => undefined);
    else await Location.stopGeofencingAsync(TAREFA).catch(() => undefined);
    return true;
  },
}));
