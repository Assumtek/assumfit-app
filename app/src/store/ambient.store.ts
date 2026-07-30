import { requireOptionalNativeModule } from 'expo-modules-core';
import { create } from 'zustand';

import { api, fetchMorningForecast, isAuthenticated } from '../services/api.service';
import { scheduleMorningGreeting } from '../services/notifications.service';
import { useWorkoutStore } from './workout.store';

/**
 * Checa o lado NATIVO antes de tocar no pacote JS.
 *
 * Um `require('expo-location')` dentro de try/catch não basta: quando o nativo
 * falta, o módulo estoura já na inicialização, e o `guardedLoadModule` do Metro
 * reporta a falha ao handler global de erros ANTES de o catch agir — o app
 * segue funcionando, mas o desenvolvedor leva uma tela vermelha de "Uncaught
 * Error" que não corresponde a nada quebrado.
 *
 * `requireOptionalNativeModule` devolve `null` em vez de lançar, então dá para
 * decidir sem nunca carregar o pacote.
 */
const hasNativeLocation = requireOptionalNativeModule('ExpoLocation') !== null;

export type Ambient = {
  temperatureC: number;
  apparentC: number;
  humidityPct: number;
  heatStress: boolean;
  observedAt: string;
  provider: string;
};

type Permission = 'unknown' | 'granted' | 'denied';

type AmbientState = {
  ambient: Ambient | null;
  /** Nome da cidade, resolvido no aparelho. Nunca sai dele. */
  city: string | null;
  permission: Permission;
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Clima ambiente.
 *
 * Duas escolhas que valem explicação:
 *
 * **Precisão baixa de propósito.** Pede `Accuracy.Low` — cerca de 1 a 3 km. Para
 * dizer "está 31°C e úmido" a posição de rua não acrescenta nada, e pedir
 * precisão alta num app de saúde cria passivo sem contrapartida. O servidor
 * ainda arredonda de novo antes de consultar o provedor.
 *
 * **Falha em silêncio.** Sem permissão, sem rede ou com o provedor fora do ar, o
 * estado fica nulo e a interface simplesmente não mostra a linha de contexto.
 * Clima é enriquecimento; nada no produto depende dele para funcionar.
 */
export const useAmbientStore = create<AmbientState>((set) => ({
  ambient: null,
  city: null,
  permission: 'unknown',
  loading: false,

  refresh: async () => {
    if (!isAuthenticated()) return;
    set({ loading: true });

    // Sem o nativo — Expo Go, ou dev client anterior ao expo-location — o app
    // simplesmente não mostra a linha de clima.
    if (!hasNativeLocation) {
      set({ permission: 'denied', loading: false });
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Location = require('expo-location') as typeof import('expo-location');

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        set({ permission: 'denied', loading: false });
        return;
      }

      const position = await Location.getLastKnownPositionAsync({})
        .then((last) => last ?? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }))
        .catch(() => null);

      if (!position) {
        set({ permission: 'granted', loading: false });
        return;
      }

      const [{ data }, place] = await Promise.all([
        api.get<Ambient>('/weather', {
          params: { lat: position.coords.latitude, lon: position.coords.longitude },
        }),
        // Geocodificação reversa acontece no APARELHO, pelo serviço do sistema.
        // A cidade nunca é enviada ao servidor — ele só recebe a coordenada
        // arredondada, e nem essa é guardada.
        Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }).catch(() => []),
      ]);

      const first = place[0];
      set({
        ambient: data,
        city: first?.city ?? first?.subregion ?? first?.region ?? null,
        permission: 'granted',
        loading: false,
      });

      /*
       Aproveita a coordenada JÁ em mãos para armar o "bom dia" de amanhã.

       Aqui, e não num agendador próprio: este é o único lugar do app que tem
       lat/lon com permissão concedida, e a notificação precisa da PREVISÃO —
       agendada com a leitura de agora, "bom dia com 28°" tocaria numa manhã de
       12. Rearmada a cada refresh, a previsão nunca envelhece mais que um dia.
       Falha em silêncio: o bom dia é enfeite, não requisito.
      */
      void (async () => {
        try {
          const previsao = await fetchMorningForecast(
            position.coords.latitude,
            position.coords.longitude,
          );
          const plano = useWorkoutStore.getState().plan;
          const amanha = new Date(Date.now() + 86_400_000)
            .toLocaleDateString('en-US', { weekday: 'long' })
            .toUpperCase();
          const treinaAmanha =
            plano?.days.some((d) => d.dayOfWeek === amanha && d.dayType === 'WORKOUT') ?? false;
          await scheduleMorningGreeting(previsao.temperatureC, previsao.humidityPct, treinaAmanha);
        } catch {
          // sem previsão, sem bom dia — nunca um bom dia errado
        }
      })();
    } catch {
      set({ loading: false });
    }
  },
}));
