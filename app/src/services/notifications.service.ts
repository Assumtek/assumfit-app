import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { useAlertsStore } from '../store/alerts.store';

/**
 * Notificações locais.
 *
 * **Locais, e não remotas, de propósito.** Push remoto exige APNs, servidor de
 * envio e um token por aparelho — e nada do que este app precisa avisar hoje
 * vem de fora: fim de descanso, fim do tempo de alongamento e lembrete de
 * treino são todos decididos no aparelho, com hora conhecida no momento em que
 * o evento começa. Um servidor no meio só adicionaria latência e um lugar a
 * mais para o dado de saúde passar.
 *
 * ## A regra que vale para todo texto daqui
 *
 * **Nenhuma notificação carrega valor biométrico.** A tela de bloqueio é vista
 * por quem passa perto do celular, e "seu HRV caiu para 22 ms" é dado pessoal
 * sensível exibido para terceiros sem consentimento de ninguém. O texto diz o
 * que fazer, nunca o que foi medido.
 */

/**
 * Como a notificação se comporta com o app ABERTO.
 *
 * Banner mesmo em primeiro plano: o caso principal é o descanso terminando com
 * o celular na mão e a tela apagada por inatividade — sem banner, o único aviso
 * seria o som, que muita gente mantém desligado na academia.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Identificadores fixos: agendar de novo SUBSTITUI, nunca empilha. */
const DESCANSO = 'descanso';
const TEMPO = 'tempo-exercicio';

let permissaoPedida = false;

/**
 * Pede permissão uma vez, e só quando houver o que notificar.
 *
 * Não no primeiro abrir do app: pedir antes de existir motivo é o jeito mais
 * rápido de ser negado para sempre — o iOS só apresenta o diálogo uma vez, e
 * "não" ali é definitivo até alguém ir nas Configurações do sistema.
 */
export async function ensurePermission(): Promise<boolean> {
  const atual = await Notifications.getPermissionsAsync();
  if (atual.granted) return true;
  if (!atual.canAskAgain || permissaoPedida) return false;

  permissaoPedida = true;
  const pedido = await Notifications.requestPermissionsAsync();
  return pedido.granted;
}

/**
 * Avisa quando o descanso acabar.
 *
 * O alvo vem em epoch, como o resto do descanso: o agendamento é por SEGUNDOS
 * a partir de agora, e converter aqui — em vez de guardar um contador — é o que
 * mantém o aviso certo mesmo se o app for para segundo plano no meio.
 */
export async function scheduleRestEnd(endsAt: number, proximo?: string | null) {
  const segundos = Math.round((endsAt - Date.now()) / 1000);
  // Abaixo de três segundos não vale notificar: o banner chegaria junto com a
  // pessoa já olhando a tela.
  if (segundos < 3) return;
  if (!(await ensurePermission())) return;

  await cancelRestEnd();
  await Notifications.scheduleNotificationAsync({
    identifier: DESCANSO,
    content: {
      title: 'Descanso terminou',
      body: proximo ? `A seguir: ${proximo}` : 'Hora da próxima série.',
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: segundos },
  });
}

export async function cancelRestEnd() {
  await Notifications.cancelScheduledNotificationAsync(DESCANSO).catch(() => undefined);
}

/** Avisa quando o tempo de um alongamento ou cardio acabar. */
export async function scheduleTimedEnd(seconds: number, nome: string) {
  if (seconds < 3) return;
  if (!(await ensurePermission())) return;

  await cancelTimedEnd();
  await Notifications.scheduleNotificationAsync({
    identifier: TEMPO,
    content: { title: 'Tempo cumprido', body: nome, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
  });
}

export async function cancelTimedEnd() {
  await Notifications.cancelScheduledNotificationAsync(TEMPO).catch(() => undefined);
}

/**
 * Canal do Android.
 *
 * Sem canal, o Android 8+ entrega a notificação sem som nem vibração e não diz
 * por quê — falha silenciosa clássica. No iOS a chamada não faz nada.
 */
export async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('treino', {
    name: 'Treino',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
    lightColor: '#877BF0',
  });
}

// ============================================================================
// As notificações de rotina — todas LOCAIS, todas decididas no aparelho.
// ============================================================================

const AGUA_PREFIXO = 'agua-';
const TREINO_15H = 'treino-15h';
const BOM_DIA = 'bom-dia';

/**
 * Água no CELULAR, espelhando os horários da pulseira.
 *
 * Os dois canais juntos são deliberados: a pulseira vibra no pulso de quem a
 * está usando; a notificação alcança quem a deixou carregando — que é
 * exatamente o dia em que ninguém lembra da água.
 */
export async function scheduleWaterNotifications(times: string[]) {
  if (!(await ensurePermission())) return;
  await cancelWaterNotifications();
  for (let i = 0; i < times.length; i++) {
    const [hour, minute] = times[i].split(':').map(Number);
    await Notifications.scheduleNotificationAsync({
      identifier: `${AGUA_PREFIXO}${i}`,
      content: { title: 'Hora da água', body: 'Um copo agora conta para a meta de hoje.', sound: false },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour,
        minute,
        repeats: true,
      },
    });
  }
}

export async function cancelWaterNotifications() {
  for (let i = 0; i < 8; i++) {
    await Notifications.cancelScheduledNotificationAsync(`${AGUA_PREFIXO}${i}`).catch(() => undefined);
  }
}


const CICLO_PROXIMO = 'ciclo-proximo';

/**
 * Aviso de que um novo ciclo se aproxima — dois dias antes da data prevista.
 *
 * Rearmado a cada previsão nova (registro novo move a data). O texto é
 * discreto de propósito: a tela de bloqueio é vista por quem passa perto, e
 * "ciclo" sem número nem data já diz o suficiente para quem pediu o aviso.
 */
export async function scheduleCycleHeadsUp(nextStartIso: string) {
  if (!(await ensurePermission())) return;
  await Notifications.cancelScheduledNotificationAsync(CICLO_PROXIMO).catch(() => undefined);

  const alvo = new Date(`${nextStartIso}T09:00:00`);
  alvo.setDate(alvo.getDate() - 2);
  if (alvo.getTime() <= Date.now()) return;

  await Notifications.scheduleNotificationAsync({
    identifier: CICLO_PROXIMO,
    content: {
      title: 'Previsão do mês',
      body: 'Pela sua previsão, um novo ciclo começa em poucos dias. Abra para ver os detalhes.',
      sound: false,
      data: { route: 'Cycle' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alvo },
  });
}

/** O interruptor da tela lê daqui a verdade do CELULAR — a pulseira é espelho. */
export async function waterNotificationsScheduled(): Promise<boolean> {
  const agendadas = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  return agendadas.some((n) => n.identifier.startsWith(AGUA_PREFIXO));
}

/**
 * "Ainda dá tempo de treinar" — um tiro às 15h, rearmado por quem sabe.
 *
 * NÃO é gatilho de calendário repetitivo: o iOS não avalia condição na hora de
 * disparar, e um repetitivo tocaria também no dia em que a pessoa treinou de
 * manhã — cobrança injusta é o jeito mais rápido de ela desligar tudo. O
 * agendamento é sempre de UM disparo, e concluir um treino cancela e rearma
 * para amanhã.
 */
export async function armTrainingNudge(fromTomorrow = false) {
  if (!(await ensurePermission())) return;
  const alvo = new Date();
  alvo.setHours(15, 0, 0, 0);
  if (fromTomorrow || alvo.getTime() <= Date.now()) alvo.setDate(alvo.getDate() + 1);

  await Notifications.cancelScheduledNotificationAsync(TREINO_15H).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
    identifier: TREINO_15H,
    content: {
      title: 'Ainda dá tempo hoje',
      body: 'Seu treino de hoje continua te esperando — e à tarde ainda cabe.',
      sound: false,
      data: { route: 'Plan' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alvo },
  });
}

/**
 * O "bom dia" com a PREVISÃO de amanhã cedo, não o clima de agora.
 *
 * Agendada hoje para as 7h30 de amanhã, com a temperatura que o Open-Meteo
 * prevê para as 7h — usar a leitura atual escreveria "bom dia com 28°" numa
 * manhã de 12. Rearmada a cada abertura do app, então a previsão nunca tem
 * mais de um dia.
 */
export async function scheduleMorningGreeting(temperatureC: number, humidityPct: number, treina: boolean) {
  if (!(await ensurePermission())) return;
  const alvo = new Date(Date.now() + 86_400_000);
  alvo.setHours(7, 30, 0, 0);

  const t = Math.round(temperatureC);
  const frio = t < 15;
  const calor = t >= 27;
  const abafado = humidityPct >= 80;

  let corpo: string;
  if (frio) {
    corpo = treina
      ? `${t}° lá fora — tá frio, eu sei, mas o treino de hoje conta em dobro.`
      : `${t}° lá fora — dia de descanso com café passa rápido.`;
  } else if (calor) {
    corpo = treina
      ? `Solzão de ${t}° — bora garantir o treino antes do calor apertar?`
      : `Solzão de ${t}° — hidrate bem mesmo no descanso.`;
  } else {
    corpo = treina
      ? `${t}° e céu tranquilo — ótimo pra dar aquele treino.`
      : `${t}° e céu tranquilo — bom dia pro corpo descansar direito.`;
  }
  if (abafado) corpo += ' Ar abafado: capriche na água.';

  await Notifications.cancelScheduledNotificationAsync(BOM_DIA).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
    identifier: BOM_DIA,
    content: { title: 'Bom dia!', body: corpo, sound: false, data: { route: 'Main' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alvo },
  });
}

/**
 * Medição fora da faixa — atenção SEM o valor.
 *
 * O corpo do texto não diz qual métrica nem quanto: a tela de bloqueio é vista
 * por quem passa perto, e "SpO₂ 88%" ali é dado clínico exposto a terceiros. O
 * toque abre a tela de Saúde, onde o dado mora protegido pelo desbloqueio.
 *
 * Cooldown de 6 h POR MÉTRICA, no chamador: a mesma medição ruim relida a cada
 * cinco minutos viraria metralhadora — e alerta repetido é alerta ignorado.
 */
export async function notifyAttention() {
  if (!(await ensurePermission())) return;
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Vale uma olhada',
      body: 'Uma das suas medições de hoje merece atenção. Abra para ver com calma.',
      sound: true,
      data: { route: 'Health' },
    },
    trigger: null,
  });
  registrarNoFeed(id, 'Vale uma olhada', 'Uma das suas medições de hoje merece atenção. Abra para ver com calma.', 'Health');
}

/**
 * Ritmo acelerado → convite à respiração guiada.
 *
 * "Convite", e a palavra importa: o produto não é dispositivo médico, e o
 * texto não afirma taquicardia nem cita número — oferece uma pausa. Quem toca
 * cai direto no exercício de respiração, não numa tela de números.
 */
export async function notifyBreathing() {
  if (!(await ensurePermission())) return;
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Momento de pausa?',
      body: 'Seu ritmo está acelerado já faz alguns minutos. Dois minutos de respiração ajudam a baixar.',
      sound: true,
      data: { route: 'Breathing' },
    },
    trigger: null,
  });
  registrarNoFeed(id, 'Momento de pausa?', 'Seu ritmo está acelerado já faz alguns minutos. Dois minutos de respiração ajudam a baixar.', 'Breathing');
}

/**
 * Registro no feed da tela de Avisos, na hora do envio.
 *
 * Só para as IMEDIATAS: as agendadas (água, treino, bom-dia) são registradas
 * quando ENTREGUES — pelos listeners do App e pela sincronização com a central
 * — porque registrar no agendamento marcaria como recebido um aviso que ainda
 * não aconteceu, e que pode nem acontecer se for cancelado antes.
 */
function registrarNoFeed(id: string, titulo: string, corpo: string, rota: string) {
  useAlertsStore.getState().registrar({ id, titulo, corpo, rota });
}

