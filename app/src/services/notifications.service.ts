import * as Notifications from 'expo-notifications';

import { WATER_NUDGE_PADRAO, waterNudge } from '../domain/water';
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
/**
 * A permissão foi negada e o sistema não vai perguntar de novo.
 *
 * Distinto de "ainda não pedimos": negado é um beco silencioso — nenhum aviso
 * chega, nada na tela explica, e a pessoa conclui que o app não notifica. Só as
 * Ajustes do sistema revertem, e para oferecer esse caminho é preciso primeiro
 * saber que se está nele.
 */
export async function notificacoesBloqueadas(): Promise<boolean> {
  const atual = await Notifications.getPermissionsAsync().catch(() => null);
  if (!atual) return false;
  return !atual.granted && !atual.canAskAgain;
}

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
 * Quantos dias à frente o lembrete de água é agendado.
 *
 * Notificação repetida guarda o texto do dia em que foi criada — era isso que
 * fazia "um copo agora conta para a meta" chegar igual todo dia, inclusive
 * depois da meta batida. Aqui cada disparo é agendado com data e texto
 * próprios, e o app reagenda a cada gole. Três dias é o compromisso: cobre o
 * fim de semana sem abrir o app e cabe no teto de 64 notificações do iOS,
 * dividido com treino, ciclo e sono.
 */
const AGUA_DIAS = 3;

/**
 * Água no CELULAR, espelhando os horários da pulseira.
 *
 * Os dois canais juntos são deliberados: a pulseira vibra no pulso de quem a
 * está usando; a notificação alcança quem a deixou carregando — que é
 * exatamente o dia em que ninguém lembra da água.
 *
 * O `estado` é o consumo de HOJE: com ele, o lembrete de hoje diz quanto
 * falta (ou some, se a meta já foi batida) e o dos próximos dias fica no
 * texto genérico, porque o consumo deles ainda não aconteceu.
 */
export async function scheduleWaterNotifications(
  times: string[],
  estado?: { waterMl: number; goalMl: number; copoMl: number },
) {
  if (!(await ensurePermission())) return;
  await cancelWaterNotifications();

  const agora = new Date();
  const hojeTexto = estado
    ? waterNudge(estado.waterMl, estado.goalMl, estado.copoMl)
    : WATER_NUDGE_PADRAO;

  let slot = 0;
  // Lista longa (modo por intervalo: até 30 por dia) cabe em menos dias — o
  // sistema aceita poucas dezenas de notificações pendentes. A volta ao
  // primeiro plano reagenda, então um dia de cobertura já basta.
  const dias = Math.max(1, Math.min(AGUA_DIAS, Math.floor(60 / Math.max(1, times.length))));
  for (let dia = 0; dia < dias; dia++) {
    for (const hhmm of times) {
      const [hour, minute] = hhmm.split(':').map(Number);
      const quando = new Date(agora);
      quando.setDate(quando.getDate() + dia);
      quando.setHours(hour, minute, 0, 0);
      // Horário que já passou hoje não vira notificação imediata.
      if (quando <= agora) continue;

      const conteudo = dia === 0 ? hojeTexto : WATER_NUDGE_PADRAO;
      // Meta batida silencia o RESTO do dia — e só o de hoje.
      if (!conteudo) continue;

      await Notifications.scheduleNotificationAsync({
        identifier: `${AGUA_PREFIXO}${slot++}`,
        content: { title: conteudo.title, body: conteudo.body, sound: false },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: quando },
      });
    }
  }
}

const REFEICAO_PREFIXO = 'refeicao-';
const REFEICAO_DIAS = 3;
export const MAX_HORARIOS_REFEICAO = 6;

/**
 * Que refeição é, pela hora — só para o texto do lembrete ter nome.
 * O loop do hábito (pedido de um testador, ago/2026): o aviso chega na hora
 * em que a pessoa costuma comer e abre a tela de Refeições para registrar.
 */
function nomeDaRefeicao(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  if (h < 10) return 'café da manhã';
  if (h < 14) return 'almoço';
  if (h < 18) return 'lanche';
  return 'jantar';
}

export async function scheduleMealNotifications(times: string[]) {
  if (!(await ensurePermission())) return;
  await cancelMealNotifications();
  const agora = new Date();
  let slot = 0;
  for (let dia = 0; dia < REFEICAO_DIAS; dia++) {
    for (const hhmm of times) {
      const [hour, minute] = hhmm.split(':').map(Number);
      const quando = new Date(agora);
      quando.setDate(quando.getDate() + dia);
      quando.setHours(hour, minute, 0, 0);
      if (quando <= agora) continue;
      const nome = nomeDaRefeicao(hhmm);
      await Notifications.scheduleNotificationAsync({
        identifier: `${REFEICAO_PREFIXO}${slot++}`,
        content: {
          title: `Hora do ${nome}?`,
          body: 'Registre o prato em dois toques — é o que mantém o hábito no loop.',
          sound: false,
          data: { route: 'Meals' },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: quando },
      });
    }
  }
}

export async function cancelMealNotifications() {
  for (let i = 0; i < REFEICAO_DIAS * MAX_HORARIOS_REFEICAO + 6; i++) {
    await Notifications.cancelScheduledNotificationAsync(`${REFEICAO_PREFIXO}${i}`).catch(() => undefined);
  }
}

/**
 * Lembretes PERSONALIZADOS — os horários vêm do uso, não de uma lista fixa.
 *
 * Mesma mecânica dos de água e refeição: notificação de data fixa, três dias
 * à frente, refeita a cada volta ao primeiro plano. `prefixo` separa as
 * famílias (treino, cama, relatório) para cancelar uma sem tocar nas outras.
 */
export async function scheduleDailyAt(
  prefixo: string,
  hhmm: string,
  conteudo: { title: string; body: string; route: string },
  dias = 3,
) {
  if (!(await ensurePermission())) return;
  await cancelPrefix(prefixo, dias + 2);
  const agora = new Date();
  const [hour, minute] = hhmm.split(':').map(Number);
  for (let dia = 0; dia < dias; dia++) {
    const quando = new Date(agora);
    quando.setDate(quando.getDate() + dia);
    quando.setHours(hour, minute, 0, 0);
    if (quando <= agora) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `${prefixo}${dia}`,
      content: { title: conteudo.title, body: conteudo.body, sound: false, data: { route: conteudo.route } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: quando },
    });
  }
}

/** Uma notificação no próximo `weekday` (0 = domingo) às `hhmm`. */
export async function scheduleWeeklyAt(
  id: string,
  weekday: number,
  hhmm: string,
  conteudo: { title: string; body: string; route: string },
) {
  if (!(await ensurePermission())) return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
  const agora = new Date();
  const [hour, minute] = hhmm.split(':').map(Number);
  const quando = new Date(agora);
  quando.setDate(quando.getDate() + ((weekday - quando.getDay() + 7) % 7));
  quando.setHours(hour, minute, 0, 0);
  if (quando <= agora) quando.setDate(quando.getDate() + 7);
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title: conteudo.title, body: conteudo.body, sound: false, data: { route: conteudo.route } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: quando },
  });
}

export async function cancelPrefix(prefixo: string, ate = 8) {
  for (let i = 0; i < ate; i++) {
    await Notifications.cancelScheduledNotificationAsync(`${prefixo}${i}`).catch(() => undefined);
  }
}

/** Dispara agora — usado pelo lembrete por local, que nasce de um evento e não de um horário. */
export async function notifyNow(id: string, conteudo: { title: string; body: string; route: string }) {
  if (!(await ensurePermission())) return;
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title: conteudo.title, body: conteudo.body, sound: false, data: { route: conteudo.route } },
    trigger: null,
  });
}

export async function cancelWaterNotifications() {
  // O teto acompanha AGUA_DIAS × MAX_HORARIOS do lembrete (8), com folga:
  // cancelar id inexistente é no-op, deixar um vivo é notificação fantasma.
  for (let i = 0; i < AGUA_DIAS * 30 + 8; i++) {
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
/** Desliga o aviso de previsão — o interruptor da tela de Ciclo. */
export async function cancelCycleHeadsUp() {
  await Notifications.cancelScheduledNotificationAsync(CICLO_PROXIMO).catch(() => undefined);
}

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
 * O "bom dia" das 7h30 — o TEXTO vem pronto de quem o redigiu.
 *
 * Era um molde de seis frases decidido aqui por faixa de temperatura, e
 * chegava igual todo dia. Agora a redação é da IA (rota `/insights/morning`,
 * que conhece a previsão E o plano de amanhã) e este arquivo volta ao que
 * sabe fazer: entregar no horário certo. Rearmada a cada abertura do app, e
 * por isso a previsão nunca tem mais de um dia.
 */
export async function scheduleMorningGreeting(texto: { title: string; body: string }) {
  if (!(await ensurePermission())) return;
  const alvo = new Date(Date.now() + 86_400_000);
  alvo.setHours(7, 30, 0, 0);

  await Notifications.cancelScheduledNotificationAsync(BOM_DIA).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
    identifier: BOM_DIA,
    content: { title: texto.title, body: texto.body, sound: false, data: { route: 'Main' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alvo },
  });
}

/** As métricas que disparam o aviso de atenção — e para onde cada uma leva. */
const ATENCAO = {
  spo2: { nome: 'oxigenação', route: 'Oxygen' },
  pressao: { nome: 'pressão', route: 'Pressure' },
  hr: { nome: 'frequência cardíaca', route: 'HeartRate' },
} as const;

export type MetricaDeAtencao = keyof typeof ATENCAO;

/**
 * Medição fora da faixa — atenção COM a métrica, SEM o valor.
 *
 * O corpo NOMEIA o que merece a olhada ("sua oxigenação…") — decisão de
 * jul/2026: o aviso genérico obrigava a caçar qual dos nove indicadores era —
 * mas o NÚMERO continua fora: a tela de bloqueio é vista por quem passa
 * perto, e "SpO₂ 88%" ali é dado clínico exposto a terceiros. O toque abre a
 * tela DA métrica, onde o valor mora protegido pelo desbloqueio.
 *
 * Cooldown de 6 h POR MÉTRICA, no chamador: a mesma medição ruim relida a cada
 * cinco minutos viraria metralhadora — e alerta repetido é alerta ignorado.
 */
export async function notifyAttention(metrica: MetricaDeAtencao) {
  if (!(await ensurePermission())) return;
  const { nome, route } = ATENCAO[metrica];
  const corpo = `Sua ${nome} de hoje merece atenção. Abra para ver com calma.`;
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Vale uma olhada',
      body: corpo,
      sound: true,
      data: { route },
    },
    trigger: null,
  });
  registrarNoFeed(id, 'Vale uma olhada', corpo, route);
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
 * "Parece que você começou a se exercitar" — pergunta, não afirma.
 *
 * Pedido de um testador (21/08/2026): batimento que sobe de repente com
 * movimento costuma ser atividade começando. Quem decide que PARECE exercício
 * é `domain/exerciseOnset.ts`; aqui só se pergunta, e o toque abre a tela de
 * esporte, onde registrar é um botão. Sem som: é um convite, não um alerta.
 */
export async function notifyExerciseDetected() {
  if (!(await ensurePermission())) return;
  const titulo = 'Começou a treinar?';
  const corpo = 'Seu batimento subiu e você está em movimento. Se for exercício, registre para contar no seu dia.';
  const id = await Notifications.scheduleNotificationAsync({
    content: { title: titulo, body: corpo, sound: false, data: { route: 'Sport' } },
    trigger: null,
  });
  registrarNoFeed(id, titulo, corpo, 'Sport');
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

