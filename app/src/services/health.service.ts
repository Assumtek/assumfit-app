import { Platform } from 'react-native';

import { dataDaNoite, nightFrom } from '../domain/sleep';
import type { SleepNight, SleepPhase, SleepSegment } from '../domain/types';

/**
 * Apple HealthKit — SOMENTE sono, SOMENTE leitura.
 *
 * O recorte é deliberado. O sono é o único dado que a pulseira não entrega de
 * forma alguma, e ele pesa 0,25 no score de energia — era o maior buraco. Ler
 * mais que isso traria um problema sério junto: **HRV não é número universal**.
 * O Apple Watch reporta SDNN, a nossa pulseira reporta RMSSD, e para a mesma
 * pessoa no mesmo instante os valores não são comparáveis. Misturar produziria
 * uma linha de base que não corresponde a nenhum dos dois métodos — e ela é o
 * denominador do score inteiro (ver `hrvBaseline` no backend).
 *
 * Enquanto este arquivo pedir só `SleepAnalysis`, esse risco não existe.
 *
 * Escrita também está fora: publicar no app Saúde exige outro consentimento e
 * cria o risco de laço — escrever o que depois leríamos de volta como se fosse
 * de outra fonte.
 */

/** `false` no Android e no simulador, onde não há HealthKit. */
export function isHealthAvailable(): boolean {
  return Platform.OS === 'ios';
}

/**
 * `require` sob guarda, e não import estático.
 *
 * O módulo é nativo: num binário sem ele — Android, um dev client anterior à
 * dependência — o import estático derruba o arquivo inteiro e leva a árvore
 * junto. Mesma razão do `services/ble/index.ts`.
 */
function lib() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@kingstinct/react-native-healthkit') as typeof import('@kingstinct/react-native-healthkit');
  } catch (err) {
    console.warn('[health] módulo nativo indisponível:', err);
    return null;
  }
}

/**
 * Pede permissão de leitura do sono.
 *
 * O iOS NÃO informa se a pessoa recusou: por privacidade, negar e não ter dado
 * são indistinguíveis para o app. Por isso a resposta aqui não é "autorizado",
 * é "o diálogo foi apresentado" — quem decide se há dado é a consulta.
 */
export async function requestSleepAccess(): Promise<boolean> {
  const hk = lib();
  if (!hk || !isHealthAvailable()) {
    console.warn(`[health] indisponível: módulo=${hk ? 'ok' : 'ausente'} plataforma=${Platform.OS}`);
    return false;
  }
  try {
    /*
     `isHealthDataAvailable` responde por HARDWARE, não por permissão.

     É falso no iPad e no simulador. Sem esta checagem, `requestAuthorization`
     rejeita com uma mensagem genérica e o app não sabe distinguir "aparelho não
     tem HealthKit" de "a pessoa recusou".
     */
    const disponivel = await hk.isHealthDataAvailableAsync();
    console.log(`[health] HealthKit disponível no aparelho: ${disponivel}`);
    if (!disponivel) return false;
    // `toShare` vazio de propósito: leitura apenas. Pedir escrita traria outro
    // diálogo e outra promessa ao usuário — e não é o que fazemos com o dado.
    const resposta = await hk.requestAuthorization({ toRead: ['HKCategoryTypeIdentifierSleepAnalysis'] });
    console.log(`[health] diálogo de permissão apresentado: ${resposta}`);
    return true;
  } catch (err) {
    // Erro aqui não pode sumir: foi o silêncio deste bloco que fez o toque em
    // "Conectar app Saúde" não produzir efeito nem explicação.
    console.warn('[health] falha ao pedir permissão:', err);
    return false;
  }
}

/**
 * Traduz o estágio do HealthKit para o do domínio.
 *
 * `inBed` fica de FORA de propósito, e isso não é detalhe: ele é um invólucro
 * que se sobrepõe às amostras de sono. Contá-lo somaria o mesmo intervalo duas
 * vezes e inflaria a noite — alguém que dormiu 7h apareceria com 14h.
 */
function toPhase(value: number): SleepPhase | null {
  switch (value) {
    case 4:
      return 'deep';
    case 5:
      return 'rem';
    case 3: // asleepCore
    case 1: // asleepUnspecified — Apple Watch antigo e apps de terceiros
      return 'light';
    case 2:
      return 'awake';
    default:
      return null; // 0 = inBed
  }
}

/**
 * Última noite registrada no app Saúde.
 *
 * A janela vai de 18h de ontem até agora, e não "hoje": quem dorme às 23h teria
 * a noite cortada ao meio por um recorte à meia-noite, e quem trabalha à noite
 * perderia tudo. Devolve `null` quando não há amostra — sem noite, a tela diz
 * que não há, em vez de mostrar uma inventada.
 */
/** Distância entre amostras que separa uma noite da seguinte. */
const INTERVALO_ENTRE_NOITES_MS = 4 * 60 * 60 * 1000;

/**
 * A noite mais recente que existir nos últimos dias — não obrigatoriamente a de
 * ontem.
 *
 * A primeira versão olhava só das 18h de ontem até agora, e devolvia nada para
 * quem não usou o relógio na noite anterior. Mas quem carregou o Apple Watch
 * ontem tem a noite de anteontem gravada, e mostrá-la com a data certa é mais
 * útil que uma tela vazia — o `SleepNight` carrega `date` justamente para isso.
 *
 * Sete dias é o alcance: além disso o dado deixa de descrever o estado atual, e
 * o score de energia estaria comparando a pessoa com uma semana atrás.
 */
export async function fetchLastNight(now = new Date()): Promise<SleepNight | null> {
  const hk = lib();
  if (!hk || !isHealthAvailable()) return null;

  const inicio = new Date(now);
  inicio.setDate(inicio.getDate() - 7);

  try {
    const amostras = await hk.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      filter: { date: { startDate: inicio, endDate: now } },
      // Ordem cronológica: é ela que faz o hipnograma mostrar a arquitetura da
      // noite, com o profundo concentrado no início e o REM crescendo no fim.
      ascending: true,
      limit: 2000,
    });

    console.log(`[health] amostras de sono em 7 dias: ${amostras.length}`);
    if (!amostras.length) return null;

    /*
     Agrupa em noites por INTERVALO, não por data civil.

     Quem dorme às 23h atravessa a meia-noite, e quem trabalha à noite dorme de
     manhã. Cortar por dia partiria a primeira em duas e jogaria a segunda no
     dia errado. Um vão de quatro horas entre amostras é o que separa dormir de
     ter cochilado.
     */
    const noites: (typeof amostras)[] = [];
    let atual: typeof amostras = [];
    let fimAnterior = 0;

    for (const a of amostras) {
      const inicioAmostra = new Date(a.startDate).getTime();
      if (atual.length && inicioAmostra - fimAnterior > INTERVALO_ENTRE_NOITES_MS) {
        noites.push(atual);
        atual = [];
      }
      atual.push(a);
      fimAnterior = new Date(a.endDate).getTime();
    }
    if (atual.length) noites.push(atual);

    const ultima = noites[noites.length - 1];
    const segments: SleepSegment[] = [];
    for (const a of ultima) {
      const phase = toPhase(Number(a.value));
      if (!phase) continue;
      const minutos = Math.round(
        (new Date(a.endDate).getTime() - new Date(a.startDate).getTime()) / 60_000);
      // Amostras de menos de um minuto viram ruído no gráfico sem mudar total.
      if (minutos < 1) continue;
      segments.push({ phase, minutes: minutos });
    }

    if (!segments.length) return null;

    // A data é a do INÍCIO da noite: quem dormiu 28/07 às 23h e acordou 29/07
    // reconhece aquela como a noite do dia 28.
    // Local, pela tarde em que começou — `toISOString` é UTC e empurrava 23h
    // de Brasília para o dia seguinte.
    const noite = nightFrom(dataDaNoite(new Date(ultima[0].startDate).getTime()), segments);
    console.log(
      `[health] noites encontradas: ${noites.length}, usando ${noite.date}, ${noite.totalMin} min`);
    return noite;
  } catch (err) {
    // Permissão negada e ausência de dado são indistinguíveis por design do
    // iOS. Nos dois casos o resultado é o mesmo — mas o motivo vai para o log,
    // senão não há como separar isso de um erro de programação.
    console.warn('[health] consulta de sono falhou:', err);
    return null;
  }
}
