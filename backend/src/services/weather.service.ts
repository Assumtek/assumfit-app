import axios from 'axios';

/**
 * Clima ambiente.
 *
 * Existe menos para "dar mais um dado" e mais para desfazer uma ambiguidade que
 * o produto já tem: a temperatura de pele que o app mostra pode subir por
 * febre, por pico circadiano ou porque o quarto está quente. Sem contexto
 * ambiental não há como distinguir, e o app apresenta o número como se fosse
 * limpo.
 *
 * Roda no servidor, não no app, por três razões: a chave do provedor nunca vai
 * no bundle, a resposta é cacheável entre usuários da mesma região, e o serviço
 * de modelo precisa do mesmo dado sem ter de pedir ao celular.
 */

export type Ambient = {
  temperatureC: number;
  /** Sensação térmica: combina temperatura, umidade e vento. É ela que importa
   *  para carga fisiológica, não a temperatura seca. */
  apparentC: number;
  humidityPct: number;
  /** true quando as condições provavelmente afetam HRV e FC de repouso. */
  heatStress: boolean;
  observedAt: string;
  provider: string;
};

/**
 * Acima disto o corpo passa a gastar energia com termorregulação de forma
 * mensurável — FC de repouso sobe, HRV cai. Não é um limiar clínico exato: é o
 * ponto a partir do qual vale AVISAR que o ambiente pode estar confundindo a
 * leitura, nunca corrigir o número em silêncio.
 */
const HEAT_STRESS_APPARENT_C = 28;

export interface WeatherProvider {
  readonly name: string;
  fetch(lat: number, lon: number): Promise<Ambient>;
}

/**
 * Open-Meteo. Não exige chave e é o que permite desenvolver hoje.
 *
 * ⚠️ O plano gratuito é EXPLICITAMENTE não comercial. Antes do lançamento é
 * preciso trocar por um plano pago do Open-Meteo ou pelo WeatherKit da Apple —
 * este último vem incluído na conta de desenvolvedor, mas exige exibir a marca
 * "Weather" e o link de atribuição na tela, e cobre só iOS.
 * Decisão registrada em PLANO.md.
 */
class OpenMeteoProvider implements WeatherProvider {
  readonly name = 'open-meteo';

  async fetch(lat: number, lon: number): Promise<Ambient> {
    const { data } = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature',
        timezone: 'auto',
      },
      timeout: 6000,
    });

    const current = data?.current;
    if (!current) throw new Error('resposta do provedor sem leitura atual');

    const apparentC = Number(current.apparent_temperature);
    return {
      temperatureC: Number(current.temperature_2m),
      apparentC,
      humidityPct: Number(current.relative_humidity_2m),
      heatStress: apparentC >= HEAT_STRESS_APPARENT_C,
      observedAt: String(current.time),
      provider: this.name,
    };
  }
}

export type MorningForecast = { temperatureC: number; humidityPct: number; hour: string };

/**
 * A previsão de AMANHÃ às 7h — o insumo do "bom dia" agendado.
 *
 * Previsão, e não leitura atual: a notificação é agendada hoje para tocar
 * amanhã cedo, e usar a temperatura de agora escreveria "bom dia com 28°" numa
 * manhã de 12. O Open-Meteo entrega as horas de amanhã na mesma API, de graça.
 */
export async function fetchMorningForecast(lat: number, lon: number): Promise<MorningForecast> {
  const { data } = await axios.get('https://api.open-meteo.com/v1/forecast', {
    params: {
      latitude: lat,
      longitude: lon,
      hourly: 'temperature_2m,relative_humidity_2m',
      forecast_days: 2,
      timezone: 'auto',
    },
    timeout: 6000,
  });
  const horas: string[] = data?.hourly?.time ?? [];
  const amanha = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const alvo = `${amanha}T07:00`;
  const i = horas.indexOf(alvo);
  if (i === -1) throw new Error('previsão sem a manhã de amanhã');
  return {
    temperatureC: Number(data.hourly.temperature_2m[i]),
    humidityPct: Number(data.hourly.relative_humidity_2m[i]),
    hour: alvo,
  };
}

export const weatherProvider: WeatherProvider = new OpenMeteoProvider();

/**
 * Cache em memória por célula geográfica e hora.
 *
 * A coordenada é arredondada para 1 casa decimal — cerca de 11 km. Isso serve a
 * dois propósitos ao mesmo tempo: corta drasticamente as chamadas ao provedor,
 * porque todos os assinantes da mesma cidade compartilham a entrada, e evita
 * que o servidor guarde a posição exata de alguém. Para dizer "está 31°C e
 * úmido" a precisão de rua não acrescenta nada e só cria passivo.
 */
type CacheEntry = { value: Ambient; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30 * 60 * 1000;

const cellKey = (lat: number, lon: number) => `${lat.toFixed(1)},${lon.toFixed(1)}`;

export async function getAmbient(lat: number, lon: number): Promise<Ambient> {
  const key = cellKey(lat, lon);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const value = await weatherProvider.fetch(Number(lat.toFixed(1)), Number(lon.toFixed(1)));
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });

  prune();
  return value;
}

/** Teto absoluto de células vivas. 500 cobre o Brasil inteiro com folga. */
const MAX_ENTRIES = 500;

/**
 * Poda com teto real.
 *
 * A versão anterior só removia entradas VENCIDAS, e apenas quando o mapa
 * passava de 500. Com 500 células ativas dentro da janela de 30 minutos — o que
 * um único crawler consegue produzir pedindo coordenadas espalhadas — nenhuma
 * estava vencida, nada era removido, e o mapa crescia sem limite até derrubar o
 * processo. O teto precisa valer mesmo quando tudo está válido.
 */
function prune(): void {
  if (cache.size <= MAX_ENTRIES) return;

  const now = Date.now();
  for (const [k, entry] of cache) if (entry.expiresAt <= now) cache.delete(k);
  if (cache.size <= MAX_ENTRIES) return;

  // Ainda acima do teto: descarta as mais antigas. `Map` preserva ordem de
  // inserção, então as primeiras chaves são as que entraram há mais tempo.
  const excess = cache.size - MAX_ENTRIES;
  let removed = 0;
  for (const k of cache.keys()) {
    cache.delete(k);
    if (++removed >= excess) break;
  }
}
