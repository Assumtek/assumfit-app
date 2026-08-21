/**
 * O que o USO ensina sobre a pessoa — horários e lugares que se repetem.
 *
 * Pedido de dois testadores (ago/2026): "aprender com os hábitos de uso e
 * mandar notificações personalizadas — horário das refeições, do treino, de
 * ir para a cama", e "reconhecer pelo GPS quando chega no lugar do treino e
 * lembrar do check-in". Tudo aqui é estatística pequena e legível: mediana de
 * horários, agrupamento por proximidade. Nada é inferido com menos de três
 * ocorrências — duas vezes é coincidência, e lembrete baseado em coincidência
 * é ruído que ensina a ignorar o app.
 *
 * Domínio puro: recebe instantes e pontos, devolve horários e lugares.
 */

export const MINIMO_DE_OCORRENCIAS = 3;

/** `HH:MM` do instante, no relógio local. */
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const minutosDoDia = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};

/** Arredonda para o quarto de hora mais próximo — lembrete às 12:23 soa aleatório; 12:30, intencional. */
function aoQuartoDeHora(min: number): string {
  const m = Math.round(min / 15) * 15;
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * O horário típico de uma lista de instantes: a MEDIANA dos minutos do dia.
 * Mediana e não média — um jantar às 23h numa semana não arrasta o lembrete
 * das 19h30. `null` sem ocorrências suficientes.
 */
export function horarioTipico(instantes: number[]): string | null {
  if (instantes.length < MINIMO_DE_OCORRENCIAS) return null;
  const mins = instantes.map(minutosDoDia).sort((a, b) => a - b);
  return aoQuartoDeHora(mins[Math.floor(mins.length / 2)]);
}

/** As faixas do dia em que uma refeição cai. */
export type Refeicao = 'cafe' | 'almoco' | 'lanche' | 'jantar';

export function faixaDaRefeicao(ms: number): Refeicao {
  const h = new Date(ms).getHours();
  if (h < 10) return 'cafe';
  if (h < 14) return 'almoco';
  if (h < 18) return 'lanche';
  return 'jantar';
}

/**
 * Os horários típicos de refeição, um por faixa que se repete.
 *
 * Agrupar por faixa antes de tirar a mediana evita a mediana do dia inteiro —
 * que cairia no meio da tarde, hora em que ninguém come.
 */
export function horariosDeRefeicao(instantes: number[]): string[] {
  const porFaixa = new Map<Refeicao, number[]>();
  for (const ms of instantes) {
    const f = faixaDaRefeicao(ms);
    porFaixa.set(f, [...(porFaixa.get(f) ?? []), ms]);
  }
  const horarios: string[] = [];
  for (const faixa of ['cafe', 'almoco', 'lanche', 'jantar'] as Refeicao[]) {
    const h = horarioTipico(porFaixa.get(faixa) ?? []);
    if (h) horarios.push(h);
  }
  return horarios;
}

/** `HH:MM` menos N minutos, girando o dia. */
export function menosMinutos(hora: string, minutos: number): string {
  const [h, m] = hora.split(':').map(Number);
  const total = (h * 60 + m - minutos + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export type Lugar = { lat: number; lon: number; vezes: number };

/** Distância aproximada em metros — bastante para "é o mesmo lugar". */
function metrosEntre(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * 111_195;
  const dLon = (b.lon - a.lon) * 111_195 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

/**
 * Os lugares onde as sessões COMEÇAM, agrupados num raio.
 *
 * Agrupamento guloso por proximidade: cada ponto entra no primeiro grupo a
 * menos de `raioM`, ou abre um novo. O centro é a média dos pontos do grupo.
 * Só volta o que se repete — e os mais frequentes primeiro.
 */
export function lugaresFrequentes(
  pontos: { lat: number; lon: number }[],
  raioM = 150,
  minimo = MINIMO_DE_OCORRENCIAS,
): Lugar[] {
  const grupos: { soma: { lat: number; lon: number }; centro: { lat: number; lon: number }; vezes: number }[] = [];
  for (const p of pontos) {
    const g = grupos.find((x) => metrosEntre(x.centro, p) <= raioM);
    if (g) {
      g.vezes += 1;
      g.soma = { lat: g.soma.lat + p.lat, lon: g.soma.lon + p.lon };
      g.centro = { lat: g.soma.lat / g.vezes, lon: g.soma.lon / g.vezes };
    } else {
      grupos.push({ soma: { ...p }, centro: { ...p }, vezes: 1 });
    }
  }
  return grupos
    .filter((g) => g.vezes >= minimo)
    .sort((a, b) => b.vezes - a.vezes)
    .map((g) => ({ lat: g.centro.lat, lon: g.centro.lon, vezes: g.vezes }));
}

export const _teste = { hhmm, aoQuartoDeHora, metrosEntre };
