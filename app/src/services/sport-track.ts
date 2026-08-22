import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { create } from 'zustand';

import type { GeoPoint } from '../domain/sport';

/**
 * O rastreio de percurso da sessão de esporte, em PRIMEIRO e SEGUNDO plano.
 *
 * O `watchPositionAsync` de antes morria com a tela: trocar de app ou apagar
 * a tela congelava a distância — e a versão 1 punia a distração com um treino
 * pela metade. Aqui o SO entrega os pontos por uma tarefa registrada no
 * módulo (obrigatório: fora de componente, no escopo global), o iOS mostra o
 * indicador de localização do sistema e o Android segura o processo com uma
 * notificação de serviço — os dois são o custo honesto de medir com o app de
 * lado.
 *
 * A trilha continua morrendo no aparelho: nada daqui sobe por conta própria.
 */

const TAREFA = 'assumfit-percurso-esporte';

type SportTrackState = {
  /** Pontos desde o `iniciarRastreio` — a tela consome com um cursor. */
  points: GeoPoint[];
};

export const useSportTrackStore = create<SportTrackState>(() => ({ points: [] }));

TaskManager.defineTask(TAREFA, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations?.length) return;
  useSportTrackStore.setState((s) => ({
    points: [
      ...s.points, ...locations.map((l) => ({
        lat: l.coords.latitude,
        lon: l.coords.longitude,
        at: l.timestamp,
      })),
    ],
  }));
});

/** Limpa o buffer e liga as atualizações. Lança se a permissão faltar. */
export async function iniciarRastreio(): Promise<void> {
  useSportTrackStore.setState({ points: [] });
  await Location.startLocationUpdatesAsync(TAREFA, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 5,
    // iOS: o indicador do sistema é o aviso de que o GPS segue vivo — é a
    // versão honesta de medir em segundo plano.
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    // Android: sem serviço em primeiro plano o SO mata o rastreio em minutos.
    foregroundService: {
      notificationTitle: 'Sessão de esporte em andamento',
      notificationBody: 'O AssumFit está medindo sua distância e o percurso do treino.',
      notificationColor: '#877BF0',
    },
  });
}

/** Desliga com segurança — inclusive se nunca ligou nesta abertura do app. */
export async function pararRastreio(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TAREFA)) {
      await Location.stopLocationUpdatesAsync(TAREFA);
    }
  } catch {
    // Sem rastreio ativo não há o que parar.
  }
}
