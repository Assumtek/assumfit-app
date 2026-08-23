import { requireOptionalNativeModule } from 'expo-modules-core';
import { create } from 'zustand';

import { api, fetchMorningForecast, fetchMorningGreeting, isAuthenticated } from '../services/api.service';
import { scheduleMorningGreeting } from '../services/notifications.service';
import { useAlertsStore } from './alerts.store';
import { armarBomDiaLocal } from './workout.store';

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
  /** Instante da última busca concluída — é ele que define o que é dado velho. */
  fetchedAt: number | null;
  refresh: () => Promise<void>;
  refreshIfStale: () => Promise<void>;
};

/**
 * Idade máxima da posição guardada pelo sistema.
 *
 * Sem limite, `getLastKnownPositionAsync` aceita QUALQUER posição em cache,
 * de qualquer idade — quem viajou ontem recebe o clima da cidade de ontem, com
 * cara de leitura de agora. Meia hora é o mesmo horizonte do cache do servidor;
 * acima disso vale pagar um fix novo.
 */
const POSITION_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Raio de incerteza aceitável na posição em cache, em metros. Casa com a
 * `Accuracy.Low` pedida no fix novo — o servidor arredonda a coordenada para
 * ~11 km antes de consultar o provedor, então nada mais fino muda a resposta.
 */
const POSITION_MAX_ACCURACY_M = 5000;

/**
 * Enquanto a leitura for mais nova que isto, voltar ao app não refaz a busca.
 * Clima não muda em minutos, e cada refresh custa um fix de GPS e uma consulta;
 * puxar para atualizar continua forçando, sem esperar o prazo.
 */
const STALE_AFTER_MS = 15 * 60 * 1000;

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
export const useAmbientStore = create<AmbientState>((set, get) => ({
  ambient: null,
  city: null,
  permission: 'unknown',
  loading: false,
  fetchedAt: null,

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

      const position = await Location.getLastKnownPositionAsync({
        maxAge: POSITION_MAX_AGE_MS,
        requiredAccuracy: POSITION_MAX_ACCURACY_M,
      })
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
        fetchedAt: Date.now(),
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
            position.coords.longitude);
          /*
           Quem REDIGE é a IA, no servidor: ela cruza esta previsão com o
           plano de amanhã e a sequência de movimento. O aparelho continua
           dono da entrega — agenda local, funciona offline depois de armada.
           Sem rede, a notificação de ontem segue valendo: apagá-la para não
           errar o texto deixaria a manhã em silêncio, que é pior.
          */
          const texto = await fetchMorningGreeting({
            temperature: previsao.temperatureC,
            humidity: previsao.humidityPct,
            city: get().city,
            // Os bons-dias já entregues: o modelo recebe para não repetir
            // (pedido de testador, 22/08).
            recent: useAlertsStore
              .getState()
              .feed.filter((n) => n.titulo === 'Bom dia')
              .slice(0, 7)
              .map((n) => n.corpo),
          });
          await scheduleMorningGreeting(texto, 'ia');
        } catch {
          // Sem previsão ou sem servidor, o molde local garante a manhã: cita
          // o treino de amanhã pelo plano que o aparelho já tem.
          await armarBomDiaLocal();
        }
      })();
    } catch {
      set({ loading: false });
    }
  },

  /**
   * Reatualiza só quando o dado já envelheceu.
   *
   * É o que a volta ao primeiro plano chama: sem o corte por idade, alternar
   * de app duas vezes seguidas dispararia um fix de GPS e uma consulta a cada
   * troca. Sem leitura nenhuma (ou com a permissão ainda negada) não há idade
   * a respeitar e a busca acontece — quem concedeu a permissão nas
   * Configurações do sistema volta com a linha de clima já preenchida.
   */
  refreshIfStale: async () => {
    const { loading, fetchedAt, refresh } = get();
    if (loading) return;
    if (fetchedAt !== null && Date.now() - fetchedAt < STALE_AFTER_MS) return;
    await refresh();
  },
}));
