import { Text } from '@tamagui/core';
import { useNavigation, useRoute } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Note, Row, Section } from '../components/Card';
import { DetailScreen, usePullRefresh } from '../components/DetailScreen';
import { Icon, type IconName } from '../components/Icon';
import { HexMosaic, type HexItem } from '../components/HexMosaic';
import { PhotoViewer } from '../components/PhotoViewer';
import { TrainingPanel } from '../components/TrainingPanel';
import { WeekRail } from '../components/WeekRail';
import { BarChart } from '../components/charts/BarChart';
import {
  Body,
  Button,
  Data,
  Display,
  Headline,
  Label,
  Readout,
  ReadoutCluster,
  SectionTitle,
} from '../components/ui';
import { Card } from '../components/ui/Card';
import { ScalePicker } from '../components/ScalePicker';
import { ConfirmDialog, Sheet } from '../components/ui/Dialog';
import { ShadowView } from '../components/ui/ShadowView';
import { useFabShadow } from '../components/ui/elevation';
import { buildMovementWeek, movementMinutes, treinoConta, weeklySeries } from '../domain/movement';
import { batimentoAoVivo } from '../domain/series';
import { montarSemanaDeTreino } from '../domain/trainingWeek';
import { formatDuration, isSportDay, modalityMeta, workoutMeta } from '../domain/workout';
import {
  SPORTS,
  kcalFor,
  searchSports,
  simplifyTrack,
  sportSections,
  kcalRangeLabel,
  paceMinPerKm,
  sportClock,
  trackDistanceM,
  type GeoPoint,
  type Sport,
  paceAtualMinPerKm,
} from '../domain/sport';
import { File, Paths } from 'expo-file-system';

import {
  aoTocarNaIlha,
  atualizarIlhaDeEsporte,
  consumirAcoesDaIlha,
  encerrarIlhaDeEsporte,
  iniciarIlhaDeEsporte,
} from '../../modules/widgetbridge';
import * as api from '../services/api.service';
import { ble } from '../services/ble';
import * as outbox from '../services/sport-outbox';
import { useLocalReminderStore } from '../services/local-reminder';
import { iniciarRastreio, pararRastreio, useSportTrackStore } from '../services/sport-track';
import { SportShare } from '../components/SportShare';
import { useBiometricStore } from '../store/biometric.store';
import { useWorkoutStore } from '../store/workout.store';
import { darkPalette } from '../theme/palette';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Sport record — escolhe a modalidade, inicia, e o cronômetro corre com
 * batimento ao vivo da pulseira, distância por GPS e caloria estimada.
 *
 * O tempo é EPOCH, nunca contador: `startedAt` + pausas acumuladas, como todo
 * timer do app. A trilha CHEIA fica no aparelho; para o servidor sobem os
 * agregados e o percurso SIMPLIFICADO (política de ago/2026), que é o que o
 * histórico usa para desenhar o mapa em qualquer aparelho.
 */

/** Peso para a conta de MET enquanto o cadastro não tem balança: referência adulta. */
const PESO_PADRAO_KG = 70;

/**
 * DEMONSTRAÇÃO do favo (pedido da fundadora, ago/2026): fotos de exemplo
 * ocupam a parede quando não há sessão registrada — SÓ em desenvolvimento,
 * para ver a peça montada. Sessão real substitui na hora; remover quando não
 * servir mais. As fotos são do Unsplash (licença livre), não são do produto.
 */
const DEMO_MOSAICO = __DEV__;

const FOTOS_DEMO = [
  require('../../assets/fotos/mosaico/corrida2.jpg'),
  require('../../assets/fotos/mosaico/bike.jpg'),
  require('../../assets/fotos/mosaico/natacao.jpg'),
  require('../../assets/fotos/mosaico/trilha-yoga.jpg'),
  require('../../assets/fotos/mosaico/montanha.jpg'),
  require('../../assets/fotos/mosaico/treino.jpg'),
];

type Sessao = {
  sport: Sport;
  startedAt: number;
  /** Pausas acumuladas em ms. */
  pausedMs: number;
  /** Instante em que a pausa corrente começou; null = correndo. */
  pausedSince: number | null;
  points: GeoPoint[];
  hrSamples: number[];
};

const elapsedOf = (s: Sessao, now: number): number =>
  (s.pausedSince ?? now) - s.startedAt - s.pausedMs;

export function SportScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const latest = useBiometricStore((s) => s.latest);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const fabShadow = useFabShadow();

  const plano = useWorkoutStore((st) => st.plan);
  const execucaoGuiada = useWorkoutStore((st) => st.execution);

  const [sessao, setSessao] = useState<Sessao | null>(null);
  /** Modalidade escolhida, ainda não iniciada — a tela intermediária. */
  const [preparando, setPreparando] = useState<Sport | null>(null);
  /** A folha de início, aberta pelo botão flutuante. */
  const [escolhendo, setEscolhendo] = useState(false);
  /** Segundo passo da folha: a grade de esportes do caminho "Registro". */
  const [passoRegistro, setPassoRegistro] = useState(false);
  /** Execuções do plano (90 dias) — alimentam a agenda de movimento. */
  const [execucoes, setExecucoes] = useState<api.ExecutionHistoryItem[] | null>(null);
  /** Sessões com trilha guardada no aparelho — o mosaico de percursos. */
  const [percursos, setPercursos] = useState<{ sessao: api.SportSession; points: GeoPoint[] }[]>([]);
  /**
   * O modal do "Finalizar treino": 'fim' confirma o encerramento normal;
   * 'descarte' avisa que menos de um minuto não entra no histórico — o
   * descarte mudo fazia o botão parecer quebrado (visto no primeiro teste).
   */
  const [confirmando, setConfirmando] = useState<'fim' | 'descarte' | null>(null);
  /** O "como foi" da tela de conclusão — mesmas perguntas do treino guiado. */
  const [esforco, setEsforco] = useState<number | null>(null);
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  /** Execução vinculada aguardando o como-foi para ser concluída. */
  const execucaoDoResumo = useRef<string | null>(null);
  /** Id da sessão salva no servidor — o lar do como-foi quando avulsa. */
  const sessaoSalva = useRef<string | null>(null);
  const [posicao, setPosicao] = useState<{ lat: number; lon: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [historico, setHistorico] = useState<api.SportSession[] | null>(null);
  /** A sessão recém-terminada — a tela de conclusão estilo Strava. */
  const [resumo, setResumo] = useState<{
    sport: Sport;
    elapsed: number;
    dist: number | null;
    kcal: number;
    avgHr: number | null;
    maxHr: number | null;
    points: GeoPoint[];
  } | null>(null);
  const [compartilhando, setCompartilhando] = useState(false);
  /** Sessão antiga aberta do histórico, com o percurso local se existir. */
  const [detalhe, setDetalhe] = useState<{ sessao: api.SportSession; points: GeoPoint[] | null } | null>(null);
  /** Compartilhar a partir do DETALHE — para quem saiu da conclusão sem compartilhar. */
  const [compartilhandoDetalhe, setCompartilhandoDetalhe] = useState(false);
  /** A foto do favo aberta em tela cheia, com salvar e compartilhar. */
  const [fotoAberta, setFotoAberta] = useState<{
    foto: number | { uri: string };
    legenda: string;
  } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  /** Encerramento pedido pelo botão da ilha — o instante do toque. */
  const [pedidoDeEncerrar, setPedidoDeEncerrar] = useState<number | null>(null);
  /** GPS ligado para ESTA sessão — decide entre "aguardando GPS" e "sem GPS". */
  const [rastreando, setRastreando] = useState(false);
  /** Quantos pontos do buffer de rastreio já entraram na sessão. */
  const cursorDoRastreio = useRef(0);
  /*
   Coexistência com o plano (ago/2026): quando a tela abre a partir do
   check-in de um dia de esporte, a sessão CUMPRE aquele dia — a execução do
   plano nasce no iniciar, conclui no encerrar e viaja na sessão como
   vínculo, para a contagem de movimento não somar o mesmo ato duas vezes.
   */
  const vinculo = useRef<{ workoutId: string; planDayId: string } | null>(null);
  const execucaoVinculada = useRef<string | null>(null);
  const route = useRoute();

  useEffect(() => {
    const params = route.params as
      | {
          vinculo?: { kind: string; workoutId: string; planDayId: string };
          /** Sessão do histórico consolidado para abrir direto no detalhe. */
          abrirSessao?: api.SportSession;
        }
      | undefined;

    if (params?.abrirSessao) {
      void abrirDetalhe(params.abrirSessao);
      return;
    }

    const pedido = params?.vinculo;
    if (!pedido) return;
    const sport = SPORTS.find((s) => s.kind === pedido.kind);
    if (!sport) return;
    vinculo.current = { workoutId: pedido.workoutId, planDayId: pedido.planDayId };
    void preparar(sport);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params]);

  /*
   Preparação: pede a localização JÁ na tela intermediária — o mapa centrado
   em você é a confirmação visual de que o GPS pegou, antes de o cronômetro
   existir. Negada, a tela diz o que se perde e o iniciar continua valendo.
  */
  const preparar = async (sport: Sport) => {
    setAviso(null);
    setPosicao(null);
    setPreparando(sport);
    if (!sport.gps) return;
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      setAviso('Sem acesso à localização, a distância e o mapa ficam de fora — o resto funciona.');
      return;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(
      () => null,
    );
    if (pos) setPosicao({ lat: pos.coords.latitude, lon: pos.coords.longitude });
  };

  const carregar = useCallback(async () => {
    // Primeiro o que ficou no aparelho; a lista do servidor já vem com elas.
    await outbox.reenviarPendentes().catch(() => undefined);
    void useWorkoutStore.getState().refresh();
    const [sessoes, treinos] = await Promise.all([
      api.fetchSportSessions(90).catch(() => null),
      // Execuções, não volume: corrida por blocos soma zero kg × reps e o
      // dia sumia da agenda de movimento.
      api.fetchExecutionHistory(90).catch(() => null),
    ]);
    setHistorico(sessoes ?? []);
    setExecucoes(treinos);

    // O mosaico: trilha local quando existe (fidelidade cheia); senão a
    // simplificada do servidor — sessão de outro aparelho também vira mapa.
    // Só sessões com distância pedem ao servidor: as demais não têm GPS.
    const candidatas = (sessoes ?? []).slice(0, 12);
    const resultados = await Promise.all(
      candidatas.map(async (s) => {
        try {
          const f = new File(Paths.document, `percurso-${s.id}.json`);
          if (f.exists) {
            const pts = JSON.parse(await f.text()) as GeoPoint[];
            if (pts.length >= 2) return { sessao: s, points: pts };
          }
        } catch {
          // Trilha local ilegível — tenta o servidor abaixo.
        }
        if (!s.distanceM) return null;
        try {
          const cheia = await api.fetchSportSession(s.id);
          if (cheia.track && cheia.track.length >= 2) {
            return { sessao: s, points: cheia.track.map((p) => ({ ...p, at: 0 })) };
          }
        } catch {
          // Sem rede o mosaico mostra só o que está no aparelho.
        }
        return null;
      }),
    );
    setPercursos(
      resultados.filter((x): x is { sessao: api.SportSession; points: GeoPoint[] } => x !== null),
    );
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);
  const refresh = usePullRefresh(carregar);

  useEffect(() => {
    if (!sessao || sessao.pausedSince !== null) return;
    let tique = 0;
    const id = setInterval(() => {
      setNow(Date.now());
      // A cada ~10 s a ilha recebe distância e batimento novos; o tempo ela
      // conta sozinha. Mais frequente só gastaria o orçamento de updates.
      tique += 1;
      if (tique % 10 === 0) {
        setSessao((s) => {
          if (s && s.pausedSince === null) {
            atualizarIlhaDeEsporte({
              startedAtMs: s.startedAt + s.pausedMs,
              distanceKm: s.sport.gps ? trackDistanceM(s.points) / 1000 : null,
              bpm: latest?.heartRate ? Math.round(latest.heartRate) : null,
            });
          }
          return s;
        });
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.pausedSince === null && sessao !== null]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  /*
   A sessão em curso vai para o DISCO a cada mudança.

   Ela vivia só aqui, em estado do React — e o iOS recolhe memória de app em
   segundo plano sem avisar. Uma partida de uma hora com o celular no bolso é
   justamente o caso em que ele recolhe, e o treino inteiro sumia. A Dynamic
   Island seguia contando, porque é nativa, então nada indicava a perda.

   Escrever no efeito e não em cada `setSessao` é de propósito: são muitos
   pontos de mudança (pausa, GPS, batimento, ilha), e um esquecido é uma sessão
   que volta truncada.
  */
  useEffect(() => {
    if (!sessao) return;
    outbox.guardarEmCurso({
      sport: sessao.sport.kind,
      startedAt: sessao.startedAt,
      pausedMs: sessao.pausedMs,
      pausedSince: sessao.pausedSince,
      points: sessao.points,
      hrSamples: sessao.hrSamples,
      vinculo: vinculo.current,
      execucaoVinculada: execucaoVinculada.current,
    });
  }, [sessao]);

  /*
   Retoma o que ficou pela metade, na abertura.

   Sem confirmação: a pessoa não escolheu perder a sessão, o sistema é que
   matou o app. Perguntar "quer retomar?" transformaria uma recuperação em mais
   uma decisão, no meio de um treino.
  */
  useEffect(() => {
    if (sessao) return;
    const salva = outbox.lerEmCurso();
    if (!salva) return;
    const sport = SPORTS.find((x) => x.kind === salva.sport);
    if (!sport) {
      outbox.descartarEmCurso();
      return;
    }
    vinculo.current = salva.vinculo ?? null;
    execucaoVinculada.current = salva.execucaoVinculada ?? null;
    cursorDoRastreio.current = salva.points.length;
    setNow(Date.now());
    setSessao({
      sport,
      startedAt: salva.startedAt,
      pausedMs: salva.pausedMs,
      pausedSince: salva.pausedSince,
      points: salva.points,
      hrSamples: salva.hrSamples,
    });
    // A ilha pode ter morrido junto com o app: reabre com o início já
    // descontado das pausas, que é o que o timer nativo entende.
    iniciarIlhaDeEsporte(sport.label, salva.startedAt + salva.pausedMs);
    // App reaberto com sessão em curso: a pulseira pode ter fechado a dela
    // (ou nunca ter aberto). Reabrir é idempotente para o firmware.
    void ble.setSportState?.(sport.kind, salva.pausedSince === null ? 'start' : 'pause');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   O batimento ao vivo entra como amostra a cada MEDIDA nova da pulseira.

   Antes bastava existir `latest.heartRate`, e a dependência era `recordedAt` —
   o instante em que a leitura CHEGOU. Como o serviço reemite a leitura inteira
   a cada evento de qualquer grandeza, e passos mudam a cada passada, a corrida
   acumulava dezenas de cópias do último batimento. A média e o máximo da sessão
   saíam da frequência de repouso.
  */
  useEffect(() => {
    const bpm = latest?.heartRate;
    if (!sessao || sessao.pausedSince !== null || !bpm) return;
    if (!batimentoAoVivo(latest, Date.now())) return;
    setSessao((s) => (s ? { ...s, hrSamples: [...s.hrSamples, Math.round(bpm)] } : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.heartRateAt]);

  const iniciar = async (sport: Sport) => {
    setAviso(null);
    setRastreando(false);
    if (sport.gps) {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status === 'granted') {
        // O rastreio corre por tarefa do sistema e SEGUE em segundo plano —
        // trocar de app ou apagar a tela não congela mais a distância.
        cursorDoRastreio.current = 0;
        try {
          await iniciarRastreio();
          setRastreando(true);
        } catch {
          setAviso('O GPS não ligou — a distância fica de fora; o resto funciona.');
        }
      } else {
        setAviso('Sem acesso à localização a distância não é medida — o resto funciona.');
      }
    }
    const stamp = Date.now();
    setNow(stamp);
    setPreparando(null);
    setSessao({ sport, startedAt: stamp, pausedMs: 0, pausedSince: null, points: [], hrSamples: [] });
    // A Dynamic Island conta o tempo sozinha a partir do início — o app só
    // manda distância/batimento de vez em quando.
    iniciarIlhaDeEsporte(sport.label, stamp);
    /*
     A sessão abre TAMBÉM na pulseira.

     É o que liga a medição contínua de batimento do firmware. Sem isso o app
     amostrava a cadência agendada de 5 min, e uma sessão de 36 min saiu com
     média 75 e máximo 75 — uma amostra — enquanto 174 leituras passavam pelo
     servidor. Sem pulseira ou com falha, a sessão segue valendo sem batimento.
    */
    void ble.setSportState?.(sport.kind, 'start');

    // Sessão que cumpre um dia do plano: a execução nasce AGORA, para o
    // servidor medir a duração de verdade. Falhou (outra execução aberta,
    // rede)? A sessão segue valendo sozinha, sem vínculo.
    if (vinculo.current && !execucaoVinculada.current) {
      const v = vinculo.current;
      api
        .startExecution(v.workoutId, v.planDayId)
        .then((e) => {
          execucaoVinculada.current = e.id;
        })
        .catch(() => {
          vinculo.current = null;
        });
    }
  };

  const alternarPausa = () => {
    const stamp = Date.now();
    setNow(stamp);
    if (sessao) void ble.setSportState?.(sessao.sport.kind, sessao.pausedSince === null ? 'pause' : 'continue');
    setSessao((s) => {
      if (!s) return s;
      const proximo =
        s.pausedSince === null
          ? { ...s, pausedSince: stamp }
          : { ...s, pausedMs: s.pausedMs + (stamp - s.pausedSince), pausedSince: null };
      // O `startedAt` que a ilha recebe já desconta as pausas: o timer nativo
      // não conhece pausa, então o início "anda" junto com elas.
      atualizarIlhaDeEsporte({
        startedAtMs: proximo.startedAt + proximo.pausedMs,
        pausedAtMs: proximo.pausedSince,
        distanceKm: proximo.sport.gps ? trackDistanceM(proximo.points) / 1000 : null,
        bpm: latest?.heartRate ? Math.round(latest.heartRate) : null,
      });
      return proximo;
    });
  };

  const encerrar = async (emMs?: number) => {
    if (!sessao) return;
    void pararRastreio();
    setRastreando(false);

    // Encerrado pelo botão da ilha, o fim é O TOQUE, não a hora em que o app
    // voltou à frente — entre os dois podem ter passado minutos parados.
    const stamp = emMs ?? Date.now();
    const elapsed = elapsedOf(sessao, stamp);
    const dist = sessao.sport.gps ? Math.round(trackDistanceM(sessao.points)) : null;
    const kcal = kcalFor(sessao.sport.met, PESO_PADRAO_KG, elapsed);
    const hr = sessao.hrSamples;

    setSessao(null);
    // A sessão deixou de estar em curso — o arquivo de retomada morre aqui,
    // antes de qualquer rede. O que segue dela é a caixa de saída.
    outbox.descartarEmCurso();
    encerrarIlhaDeEsporte();
    // Fecha a da pulseira e religa a leitura contínua da home.
    void ble.setSportState?.(sessao.sport.kind, 'stop');
    // Onde a sessão começou vira memória de lugar — é o que o lembrete por
    // local usa para reconhecer "chegou na academia". Só coordenadas, só aqui.
    if (sessao.points[0]) void useLocalReminderStore.getState().registrarInicio(sessao.points[0]);
    const execucaoId = execucaoVinculada.current;
    execucaoVinculada.current = null;
    vinculo.current = null;
    if (elapsed < 60_000) {
      // Descarte mudo é sumiço aos olhos de quem tocou encerrar na ilha.
      // A execução vinculada morre junto: dia do plano não se cumpre em 60 s.
      if (execucaoId) void api.cancelExecution(execucaoId).catch(() => undefined);
      setAviso('Sessões de menos de um minuto não entram no histórico.');
      return;
    }

    // A execução vinculada NÃO se conclui aqui: ela espera o "como foi" da
    // tela de conclusão, que viaja junto no finish — como no treino guiado.
    execucaoDoResumo.current = execucaoId;
    sessaoSalva.current = null;
    setEsforco(null);
    setNota(null);
    setComentario('');

    const avgHr = hr.length ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length) : null;
    const maxHr = hr.length ? Math.max(...hr) : null;
    setResumo({ sport: sessao.sport, elapsed, dist, kcal, avgHr, maxHr, points: sessao.points });

    // O percurso sobe SIMPLIFICADO (política de ago/2026): o histórico
    // desenha o mapa em qualquer aparelho; a trilha cheia continua local.
    const trilha = sessao.sport.gps ? simplifyTrack(sessao.points) : [];
    const payload = {
      sport: sessao.sport.kind,
      startedAt: new Date(sessao.startedAt).toISOString(),
      durationS: Math.round(elapsed / 1000),
      distanceM: dist && dist > 0 ? dist : null,
      kcal,
      avgHr,
      maxHr,
      workoutExecutionId: execucaoId,
      track: trilha.length >= 2 ? trilha : null,
    };
    // No APARELHO antes da rede: a partir desta linha a sessão não se perde
    // mais — o percurso viaja junto e vira o mapinha quando o envio confirmar.
    outbox.guardarPendente({ ...payload, points: sessao.points });

    setSalvando(true);
    try {
      const registro = await api.saveSportSession(payload);
      sessaoSalva.current = registro.id;
      outbox.guardarPercurso(registro.id, sessao.points);
      outbox.removerPendente(payload.startedAt);
      setHistorico((atual) => [registro, ...(atual ?? [])]);
    } catch {
      setAviso('A sessão ficou guardada no aparelho — sobe sozinha na próxima abertura.');
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Fecha a conclusão levando o "como foi" para o lar certo: execução
   * vinculada (que só se conclui AGORA, com a resposta dentro, como no treino
   * guiado) ou a própria sessão, quando avulsa. Sair da tela também passa por
   * aqui — abandono conta como resposta em branco, nunca como execução órfã.
   */
  const concluirResumo = () => {
    const execucaoId = execucaoDoResumo.current;
    execucaoDoResumo.current = null;
    const sessaoId = sessaoSalva.current;
    sessaoSalva.current = null;
    const feedback = {
      perceivedEffort: esforco,
      rating: nota,
      comment: comentario.trim() || null,
    };

    if (execucaoId) {
      void api
        .finishExecution(execucaoId, feedback)
        .catch(() => undefined)
        .then(() => void useWorkoutStore.getState().refresh());
    } else if (sessaoId && (feedback.perceivedEffort || feedback.rating || feedback.comment)) {
      void api.updateSportSession(sessaoId, feedback).catch(() => undefined);
    }

    setResumo(null);
    setCompartilhando(false);
    setAviso(null);
  };

  /*
   Finalizar de propósito é raro; finalizar por toque acidental, comum — e
   derruba um treino inteiro. O modal cobra a confirmação que o gesto
   irreversível merece; sessões com menos de um minuto morrem sem cerimônia.
  */
  const confirmarEncerrar = () => {
    if (!sessao) return;
    setConfirmando(elapsedOf(sessao, Date.now()) < 60_000 ? 'descarte' : 'fim');
  };

  /*
   Os botões DA ilha não chamam o app: o toque roda no nativo (que ajusta a
   própria ilha na hora, mesmo com o JS suspenso) e fica gravado numa fila.
   Aqui a fila é drenada — na campainha do evento e na volta ao primeiro
   plano — e aplicada com o instante REAL de cada toque. Nada aqui reenvia
   estado à ilha: o nativo já a atualizou, e reenviar viraria eco.

   Pausas entram todas num fold só; o encerrar sai por um EFEITO de propósito:
   quando ele rodar, o estado já contém as pausas anteriores da mesma leva, e
   o tempo parado entre a pausa e o toque de encerrar não conta como treino.
  */
  const drenarAcoesDaIlha = useCallback(() => {
    const acoes = consumirAcoesDaIlha();
    if (!acoes.length) return;
    setSessao((s) => {
      let atual = s;
      for (const acao of acoes) {
        if (!atual) break;
        if (acao.action === 'pause' && atual.pausedSince === null) {
          atual = { ...atual, pausedSince: acao.atMs };
          void ble.setSportState?.(atual.sport.kind, 'pause');
        } else if (acao.action === 'resume' && atual.pausedSince !== null) {
          atual = { ...atual, pausedMs: atual.pausedMs + (acao.atMs - atual.pausedSince), pausedSince: null };
          void ble.setSportState?.(atual.sport.kind, 'continue');
        }
      }
      return atual;
    });
    const fim = acoes.find((a) => a.action === 'end');
    if (fim) setPedidoDeEncerrar(fim.atMs);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (pedidoDeEncerrar === null) return;
    setPedidoDeEncerrar(null);
    if (sessao) void encerrar(pedidoDeEncerrar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoDeEncerrar]);

  useEffect(() => {
    if (!sessao) return;
    drenarAcoesDaIlha();
    const campainha = aoTocarNaIlha(drenarAcoesDaIlha);
    const volta = AppState.addEventListener('change', (st) => {
      if (st === 'active') drenarAcoesDaIlha();
    });
    return () => {
      campainha();
      volta.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao !== null]);

  /*
   A seta pede confirmação; o MENU navegava sem guarda nenhuma — e desmontar
   esta tela mata a sessão sem salvar. Com sessão ativa, QUALQUER remoção da
   tela (menu, gesto de voltar, navegação por ref) passa pelo funil do X. O
   ref existe porque o listener é registrado uma vez por sessão e o
   `confirmarEncerrar` do fechamento daquele render ficaria com pausas velhas.
  */
  const confirmarRef = useRef(confirmarEncerrar);
  confirmarRef.current = confirmarEncerrar;
  useEffect(() => {
    if (!sessao) return;
    return (navigation as any).addListener('beforeRemove', (e: { preventDefault: () => void }) => {
      e.preventDefault();
      confirmarRef.current();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao !== null]);

  // VoiceOver: a pausa vinda da ilha só existia visualmente. Anuncia a transição.
  const pausadoAgora = sessao !== null && sessao.pausedSince !== null;
  useEffect(() => {
    if (!sessao) return;
    AccessibilityInfo.announceForAccessibility(pausadoAgora ? 'Sessão pausada' : 'Sessão em andamento');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pausadoAgora]);

  const abrirDetalhe = async (s: api.SportSession) => {
    let points: GeoPoint[] | null = null;
    try {
      const f = new File(Paths.document, `percurso-${s.id}.json`);
      if (f.exists) points = JSON.parse(await f.text()) as GeoPoint[];
    } catch {
      points = null;
    }
    // Sem trilha local (outro aparelho, reinstalação): o servidor guarda a
    // versão simplificada — é o suficiente para o mapa do histórico.
    if (!points || points.length < 2) {
      try {
        const cheia = await api.fetchSportSession(s.id);
        if (cheia.track && cheia.track.length >= 2) {
          points = cheia.track.map((p) => ({ ...p, at: 0 }));
        }
      } catch {
        // Sem rede o detalhe abre sem mapa — os números não dependem dele.
      }
    }
    setDetalhe({ sessao: s, points });
  };

  // Desmontar com sessão viva é raro (o beforeRemove guarda a porta), mas se
  // acontecer o rastreio de fundo NÃO pode sobreviver órfão — ele seguraria o
  // GPS e a notificação do Android para sempre. A ilha cai junto — órfã, ela
  // contaria um treino que já não existe. O guard poupa a ilha de OUTRA
  // sessão (foco) quando saímos sem sessão aqui.
  const haSessao = useRef(false);
  haSessao.current = sessao !== null;
  useEffect(
    () => () => {
      if (haSessao.current) {
        void pararRastreio();
        encerrarIlhaDeEsporte();
      }
    },
    [],
  );

  /*
   Os pontos chegam pelo BUFFER da tarefa de fundo, não por callback de tela:
   é o que os faz continuar chegando com o app atrás. O cursor marca o que já
   entrou; pausa descarta em vez de acumular — andar durante a pausa não é
   percurso.
  */
  useEffect(() => {
    if (!sessao) return;
    const aplicar = (points: GeoPoint[]) => {
      const novos = points.slice(cursorDoRastreio.current);
      cursorDoRastreio.current = points.length;
      if (!novos.length) return;
      setSessao((s) => (s && s.pausedSince === null ? { ...s, points: [...s.points, ...novos] } : s));
    };
    aplicar(useSportTrackStore.getState().points);
    return useSportTrackStore.subscribe((state) => aplicar(state.points));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao !== null]);

  /*
   A conclusão estilo Strava: o percurso desenhado por inteiro, ajustado ao
   quadro, e os números da sessão embaixo — os que MEDIMOS de verdade.
  */
  if (resumo && compartilhando) {
    return (
      <DetailScreen title="Compartilhar" onBack={() => setCompartilhando(false)}>
        <SportShare
          sport={resumo.sport}
          elapsed={resumo.elapsed}
          dist={resumo.dist}
          kcalFaixa={kcalRangeLabel(resumo.sport.met, resumo.elapsed)}
          avgHr={resumo.avgHr}
          points={resumo.points}
          onClose={() => setCompartilhando(false)}
        />
      </DetailScreen>
    );
  }

  if (resumo) {
    return (
      <DetailScreen title="Sessão concluída" onBack={concluirResumo}>
        <MapaDePercurso points={resumo.points} accent={colors.accent} />

        {/*
          A regra de ouro também vale no fim da sessão: o destaque é a frase
          ("Corrida de 32 min"), e o cronômetro exato desce a sub-label. Antes
          era o contrário — `56:12` em corpo 56 é número cru formatado grande,
          exatamente o que nenhuma tela deste app deveria fazer.
        */}
        <YStack marginTop="$lg" marginBottom="$lg" gap="$xs">
          <Headline>
            {resumo.sport.label} de {formatDuration(resumo.elapsed / 1000)}
          </Headline>
          <Data>{sportClock(resumo.elapsed)} no cronômetro</Data>
        </YStack>

        <ReadoutCluster>
          <Readout
            valor={resumo.dist ? (resumo.dist / 1000).toFixed(2).replace('.', ',') : '—'}
            unidade="km"
            rotulo={resumo.dist ? (paceMinPerKm(resumo.dist, resumo.elapsed) ?? 'distância') : 'sem GPS'}
          />
          <Readout
            valor={resumo.avgHr ? String(resumo.avgHr) : '—'}
            unidade="bpm"
            rotulo={
              resumo.avgHr ? (resumo.maxHr ? `média · máx ${resumo.maxHr}` : 'média') : 'sem amostras'
            }
          />
          <Readout
            valor={kcalRangeLabel(resumo.sport.met, resumo.elapsed)}
            unidade="kcal"
            rotulo="estimadas"
          />
        </ReadoutCluster>

        {salvando ? <Data marginTop="$md">salvando no histórico…</Data> : null}
        {aviso ? <Data marginTop="$md">{aviso}</Data> : null}

        {/* O "como foi" do treino guiado, aqui também (decisão da fundadora,
            ago/2026): mesmas perguntas, mesma escala, nada pré-marcado.
            A pergunta é o próprio título do bloco — a etiqueta em caixa alta
            que ficava acima dela dizia menos do que a pergunta já diz. */}
        <YStack gap="$md" marginTop="$xl" marginBottom="$xl">
          <Card>
            <SectionTitle>Quanto esta sessão puxou?</SectionTitle>
            <YStack marginTop="$md">
              <ScalePicker
                values={[2, 4, 6, 8, 10]}
                value={esforco}
                onPick={setEsforco}
                label="Esforço"
              />
            </YStack>
            <XStack justifyContent="space-between" marginTop="$sm">
              <Data>leve</Data>
              <Data>no limite</Data>
            </XStack>
          </Card>

          <Card>
            <SectionTitle>A sessão de hoje serviu para você?</SectionTitle>
            <YStack marginTop="$md">
              <ScalePicker values={[1, 2, 3, 4, 5]} value={nota} onPick={setNota} label="Nota" />
            </YStack>
          </Card>

          <Card>
            <SectionTitle>Algo que queira registrar?</SectionTitle>
            <TextInput
              style={{
                color: colors.text,
                fontSize: 15,
                minHeight: 64,
                textAlignVertical: 'top',
                marginTop: 8,
              }}
              value={comentario}
              onChangeText={setComentario}
              placeholder="Opcional"
              placeholderTextColor={colors.textFaint}
              multiline
              accessibilityLabel="Observação sobre a sessão"
            />
          </Card>
        </YStack>

        {/* Como no fim de treino da Musculação: compartilhar vem antes e é
            secundário; "Concluir" fecha levando o como-foi — depois dele
            ninguém volta. */}
        <YStack gap="$md">
          <Button
            title="Compartilhar sessão"
            variant="secondary"
            onPress={() => setCompartilhando(true)}
          />
          <Button
            title="Concluir"
            icon={<Icon name="check" size={16} color={darkPalette.ink} />}
            onPress={concluirResumo}
          />
        </YStack>
      </DetailScreen>
    );
  }

  /* Uma sessão antiga, reaberta do histórico — com o percurso se este aparelho o guardou. */
  /*
   Compartilhar do DETALHE (decisão da fundadora, ago/2026): quem concluiu,
   saiu e se arrependeu não perde o cartão — a mesma peça da conclusão, com
   os dados da sessão guardada.
  */
  if (detalhe && compartilhandoDetalhe) {
    const d = detalhe.sessao;
    const sport: Sport = SPORTS.find((s) => s.kind === d.sport) ?? {
      kind: 'corrida',
      label: rotulo(d.sport),
      met: 6,
      gps: !!d.distanceM,
      icon: 'footprints',
      group: 'ar-livre',
    };
    return (
      <DetailScreen title="Compartilhar" onBack={() => setCompartilhandoDetalhe(false)}>
        <SportShare
          sport={sport}
          elapsed={d.durationS * 1000}
          dist={d.distanceM}
          kcalFaixa={faixaKcal(d.sport, d.durationS, d.kcal)}
          avgHr={d.avgHr}
          points={detalhe.points ?? []}
          onClose={() => setCompartilhandoDetalhe(false)}
        />
      </DetailScreen>
    );
  }

  if (detalhe) {
    const d = detalhe.sessao;
    return (
      <DetailScreen
        title={rotulo(d.sport)}
        onBack={() => {
          setDetalhe(null);
          setCompartilhandoDetalhe(false);
        }}
      >
        {detalhe.points && detalhe.points.length > 1 ? (
          <MapaDePercurso points={detalhe.points} accent={colors.accent} />
        ) : (
          <Data marginTop="$md">
            Sem mapa para esta sessão — ela foi gravada sem GPS, ou antes de o percurso passar a
            ser guardado no histórico.
          </Data>
        )}
        {/* Mesma leitura da conclusão, para a sessão guardada: a frase manda,
            o cronômetro acompanha, e o trio de mostradores fica onde sempre
            esteve — é o que permite comparar uma sessão com a outra sem
            reaprender a tela. */}
        <YStack marginTop="$lg" marginBottom="$lg" gap="$xs">
          <Headline>
            {rotulo(d.sport)} de {formatDuration(d.durationS)}
          </Headline>
          <Data>
            {quando(d.startedAt)} · {sportClock(d.durationS * 1000)} no cronômetro
          </Data>
        </YStack>

        <ReadoutCluster>
          <Readout
            valor={d.distanceM ? (d.distanceM / 1000).toFixed(2).replace('.', ',') : '—'}
            unidade="km"
            rotulo={
              d.distanceM ? (paceMinPerKm(d.distanceM, d.durationS * 1000) ?? 'distância') : 'sem GPS'
            }
          />
          <Readout
            valor={d.avgHr ? String(d.avgHr) : '—'}
            unidade="bpm"
            rotulo={d.avgHr ? (d.maxHr ? `média · máx ${d.maxHr}` : 'média') : 'sem amostras'}
          />
          <Readout
            valor={faixaKcal(d.sport, d.durationS, d.kcal)}
            unidade="kcal"
            rotulo="estimadas"
          />
        </ReadoutCluster>

        <YStack marginTop="$xl">
          <Button
            title="Compartilhar sessão"
            variant="secondary"
            onPress={() => setCompartilhandoDetalhe(true)}
          />
        </YStack>
      </DetailScreen>
    );
  }

  if (sessao) {
    const elapsed = elapsedOf(sessao, now);
    const dist = trackDistanceM(sessao.points);
    const pace = paceMinPerKm(dist, elapsed);
    const paceAgora = sessao.sport.gps ? paceAtualMinPerKm(sessao.points, now) : null;
    const pausado = sessao.pausedSince !== null;
    const ultimo = sessao.points[sessao.points.length - 1];
    // "ao vivo" é alegação: sem leitura fresca, o valor vira traço em vez de
    // relíquia com selo de vivo — a pulseira solta no km 3 não pode congelar
    // um número que a tela continua jurando ser de agora.
    const bpmFresco = batimentoAoVivo(latest, now);
    const gpsAtivo = sessao.points.length > 0;

    // Com sessão correndo, a seta não NAVEGA: ela pede a mesma confirmação
    // do X — sair da tela mataria a sessão sem cerimônia.
    return (
      <DetailScreen title={sessao.sport.label} onBack={confirmarEncerrar}>
        {/* O percurso desenhado ao vivo — o mapa é o instrumento da modalidade
            com GPS, como o anel é o do foco. */}
        {sessao.sport.gps && (ultimo || posicao) ? (
          <YStack height={210} borderRadius={16} overflow="hidden" marginTop="$md">
            <MapView
              style={{ flex: 1 }}
              showsUserLocation
              followsUserLocation={!pausado}
              region={{
                latitude: ultimo?.lat ?? posicao!.lat,
                longitude: ultimo?.lon ?? posicao!.lon,
                latitudeDelta: 0.004,
                longitudeDelta: 0.004,
              }}
            >
              {sessao.points.length > 1 ? (
                <Polyline
                  coordinates={sessao.points.map((p) => ({ latitude: p.lat, longitude: p.lon }))}
                  strokeColor={colors.accent}
                  strokeWidth={4}
                />
              ) : null}
            </MapView>
          </YStack>
        ) : null}

        {/*
          O mostrador que está CONTANDO perde massa quando para de contar: com
          a sessão pausada, o cronômetro e o trio caem para 55% de opacidade.
          É o único jeito de a pausa se anunciar sem uma faixa de aviso — e sem
          ela a tela pausada é indistinguível da tela correndo à primeira vista,
          que foi como um teste real perdeu quatro minutos de corrida.
        */}
        <YStack opacity={pausado ? 0.55 : 1}>
          <YStack alignItems="center" paddingVertical={sessao.sport.gps ? '$lg' : '$xxl'} gap="$sm">
            <XStack alignItems="center" gap={6}>
              {/* Luz de estado: aceso é dado — o cronômetro está correndo. */}
              <YStack
                width={6}
                height={6}
                borderRadius={3}
                backgroundColor={pausado ? '$faint' : '$primary'}
              />
              <Label>{pausado ? 'pausado' : 'em andamento'}</Label>
            </XStack>
            <Display
              fontSize={sessao.sport.gps ? 56 : 72}
              lineHeight={sessao.sport.gps ? 62 : 80}
              letterSpacing={-3}
            >
              {sportClock(elapsed)}
            </Display>
          </YStack>

          {/*
            Com GPS, o RITMO é mostrador de primeira classe — o de agora, com
            o médio como sub-rótulo. Era sub-rótulo da distância, e quem corre
            olha o ritmo a cada curva (pedido da fundadora, ago/2026). Sem GPS,
            a fileira de sempre.
          */}
          <ReadoutCluster>
            {/* "0,00 km" com GPS negado pareceria medição. Medido ou traço. */}
            <Readout
              valor={sessao.sport.gps && gpsAtivo ? (dist / 1000).toFixed(2).replace('.', ',') : '—'}
              unidade="km"
              rotulo={
                !sessao.sport.gps
                  ? 'sem GPS'
                  : gpsAtivo
                    ? 'distância'
                    : rastreando
                      ? 'aguardando GPS'
                      : 'sem GPS'
              }
            />
            {sessao.sport.gps ? (
              <Readout
                valor={paceAgora ?? '—'}
                unidade="/km"
                rotulo={pace ? `agora · médio ${pace.replace('/km', '')}` : gpsAtivo ? 'ritmo' : 'sem GPS'}
              />
            ) : null}
            <Readout
              valor={bpmFresco ? String(Math.round(latest!.heartRate)) : '—'}
              unidade="bpm"
              rotulo={bpmFresco ? 'ao vivo' : 'sem sinal da pulseira'}
            />
            {!sessao.sport.gps ? (
              <Readout
                valor={kcalRangeLabel(sessao.sport.met, elapsed)}
                unidade="kcal"
                rotulo="estimadas"
              />
            ) : null}
          </ReadoutCluster>
          {sessao.sport.gps ? (
            <Data marginTop="$sm">~{kcalRangeLabel(sessao.sport.met, elapsed)} kcal estimadas</Data>
          ) : null}
        </YStack>

        {/*
          O controle: disco de acento dentro de um aro de hairline. O aro é o
          que o faz ler como comando de instrumento em vez de botão flutuante
          solto no meio da tela — e dá ao alvo a folga que o dedo procura em
          movimento, que é quando esta tela é usada.
        */}
        <XStack justifyContent="center" marginTop="$xxl">
          <Pressable
            onPress={alternarPausa}
            accessibilityRole="button"
            accessibilityLabel={pausado ? 'Retomar' : 'Pausar'}
            style={({ pressed }) => pressed && { opacity: 0.75 }}
          >
            <YStack
              width={96}
              height={96}
              borderRadius={48}
              borderWidth={1}
              borderColor="$border"
              alignItems="center"
              justifyContent="center"
            >
              <YStack
                width={76}
                height={76}
                borderRadius={38}
                backgroundColor="$primary"
                alignItems="center"
                justifyContent="center"
              >
                {/* Ink fixo da marca: sobre o acento, nos DOIS temas — a mesma
                    regra do texto do Button primário. */}
                <Icon name={pausado ? 'play' : 'pause'} size={28} color={darkPalette.ink} />
              </YStack>
            </YStack>
          </Pressable>
        </XStack>

        {/* O X virou palavra (decisão da fundadora, ago/2026): "Finalizar
            treino" diz o que acontece — e o modal cobra a confirmação. */}
        <YStack marginTop="$xl">
          <Button title="Finalizar treino" variant="secondary" onPress={confirmarEncerrar} />
        </YStack>

        {aviso ? <Data marginTop="$xl">{aviso}</Data> : null}

        <ConfirmDialog
          open={confirmando !== null}
          title={confirmando === 'descarte' ? 'Sessão muito curta' : 'Finalizar o treino?'}
          body={
            confirmando === 'descarte'
              ? 'Menos de um minuto não entra no histórico nem no resumo. Continue mais um pouco para a sessão valer — ou descarte.'
              : 'Ele vai para o histórico com o que foi medido até aqui.'
          }
          confirmLabel={confirmando === 'descarte' ? 'Descartar sessão' : 'Finalizar'}
          cancelLabel="Continuar treinando"
          onConfirm={() => {
            setConfirmando(null);
            void encerrar();
          }}
          onCancel={() => setConfirmando(null)}
        />
      </DetailScreen>
    );
  }

  /*
   A tela intermediária: o que vai ser medido, o mapa confirmando o GPS, e o
   iniciar como decisão consciente — tocar na modalidade por engano não pode
   disparar cronômetro.
  */
  if (preparando) {
    return (
      <DetailScreen title={preparando.label} onBack={() => setPreparando(null)}>
        {preparando.gps ? (
          <YStack height={260} borderRadius={16} overflow="hidden" marginTop="$md">
            {posicao ? (
              <MapView
                style={{ flex: 1 }}
                showsUserLocation
                region={{
                  latitude: posicao.lat,
                  longitude: posicao.lon,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
              />
            ) : (
              <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$card">
                <Data>{aviso ?? 'procurando o sinal de GPS…'}</Data>
              </YStack>
            )}
          </YStack>
        ) : null}

        <Section label="O que será medido">
          <Row>
            <Body flex={1} color="$foreground">Tempo</Body>
            <Data flexShrink={0}>cronômetro com pausa</Data>
          </Row>
          <Row>
            <Body flex={1} color="$foreground">Batimento</Body>
            <Data flexShrink={0}>ao vivo, da pulseira</Data>
          </Row>
          {preparando.gps ? (
            <Row>
              <Body flex={1} color="$foreground">Distância e ritmo</Body>
              <Data flexShrink={0}>GPS do celular</Data>
            </Row>
          ) : null}
          <Row last>
            <Body flex={1} color="$foreground">Calorias</Body>
            <Data flexShrink={0}>estimadas pela intensidade</Data>
          </Row>
        </Section>

        <YStack marginTop="$xl" gap="$md">
          <Button
            title="Iniciar"
            onPress={() => void iniciar(preparando)}
            icon={<Icon name="play" size={16} color={darkPalette.ink} />}
          />
          <Button title="Voltar" variant="ghost" onPress={() => setPreparando(null)} />
        </YStack>
      </DetailScreen>
    );
  }

  /*
   O hub de treino (decisão da fundadora, ago/2026): a tela mostra o que a
   pessoa CONSTRUIU — sequência, evolução, atalhos do módulo de treino e as
   últimas sessões — e a escolha de modalidade sai do corpo para a folha que o
   botão flutuante abre. Antes a grade de esportes era a tela inteira e o
   retrato ficava escondido embaixo dela.
  */
  const hoje = new Date();
  /*
   As duas leituras da mesma semana: `movimento` guarda a sequência (a chama),
   `semanaDeTreino` cruza o previsto do plano com o cumprido — é a régua que a
   tela de Treino usa, e usar a MESMA aqui é o que faz as duas deixarem de
   parecer produtos diferentes costurados.
  */
  const minutosPorDia = historico !== null ? movementMinutes(execucoes ?? [], historico) : null;
  const movimento = minutosPorDia ? buildMovementWeek(minutosPorDia, hoje) : null;
  const semanaDeTreino =
    minutosPorDia || plano ? montarSemanaDeTreino(plano, minutosPorDia ?? new Map(), hoje) : null;

  // O favo ocupa a largura útil do card inteiro — hexágono encaixa sem sobra.
  const larguraDoFavo = width - 48 - 40;

  /*
   As modalidades que ESTA pessoa registra, mais recente primeiro. Com 26 na
   grade, a prateleira de cima costuma bastar: quem treina musculação toda
   semana não deveria caçar musculação toda semana.
  */
  const recentes: Sport[] = [];
  for (const s of historico ?? []) {
    if (recentes.length === 3) break;
    const sport = SPORTS.find((x) => x.kind === s.sport);
    if (sport && !recentes.some((r) => r.kind === sport.kind)) recentes.push(sport);
  }

  /*
   A CONSTÂNCIA: minutos de movimento por semana, das duas fontes somadas.
   Eram dois gráficos (esporte e treino, separados) e viraram um — quem quer
   saber se está mantendo o ritmo não separa corrida de agachamento, e dois
   gráficos meio vazios diziam menos que um cheio.
  */
  const constancia = weeklySeries(
    [
      ...(execucoes ?? [])
        .filter(treinoConta)
        .map((e) => ({ date: new Date(e.startedAt), value: (e.durationSec ?? 60) / 60 })),
      ...(historico ?? []).map((se) => ({
        date: new Date(se.startedAt),
        value: se.durationS / 60,
      })),
    ],
    6,
    hoje,
  );
  const temConstancia = constancia.some((p) => p.value > 0);

  /*
   A sessão de HOJE do plano é a peça de destaque da tela (decisão da
   fundadora, ago/2026): quem abre "Esporte" com treino marcado vê o treino,
   não um menu. Dia de descanso ou sem plano, o destaque simplesmente não
   existe — a semana assume o topo, sem cartão vazio pedindo desculpas.
  */
  const treinoDeHoje = plano
    ? (plano.days.find((d) => d.dayOfWeek === plano.today && d.dayType === 'WORKOUT')?.workout ??
      null)
    : null;
  const metaDoTreino = treinoDeHoje
    ? [
        isSportDay(treinoDeHoje.modality)
          ? `${modalityMeta(treinoDeHoje.modality).label} · ${treinoDeHoje.exerciseCount} ${
              treinoDeHoje.exerciseCount === 1 ? 'bloco' : 'blocos'
            }`
          : workoutMeta(treinoDeHoje.muscleGroups, treinoDeHoje.exerciseCount),
        treinoDeHoje.estimatedDuration ? `~${treinoDeHoje.estimatedDuration} min` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <YStack flex={1}>
      <DetailScreen title="Esporte" refreshControl={refresh}>
       <YStack gap="$xl" paddingTop="$lg">
        {temConstancia ? (
          <Card>
            <Label marginBottom="$md">constância · minutos por semana</Label>
            <BarChart
              bars={constancia.map((p, i) => ({
                label: p.label,
                value: Math.round(p.value),
                // A semana corrente carrega o acento; as passadas são régua.
                color: i === constancia.length - 1 ? colors.accent : colors.textMuted,
              }))}
              width={larguraDoFavo}
              height={120}
              labelEvery={1}
              id="constancia"
            />
          </Card>
        ) : null}

        {aviso ? <Note title="Aviso" body={aviso} /> : null}

        {/* A lista de sessões saiu daqui (decisão da fundadora, ago/2026):
            o lar dela é o Histórico consolidado, junto do treino guiado. */}

        {/* O favo das sessões: cada peça é a foto do treino, ou o traçado do
            percurso quando não houver foto. Toque abre a sessão. Sem sessão
            registrada, o modo demonstração (só em dev) preenche a parede. */}
        {(() => {
          const demo = percursos.length === 0 && DEMO_MOSAICO;
          const itens: HexItem[] = demo
            ? FOTOS_DEMO.map((foto, i) => ({
                key: `demo-${i}`,
                foto,
                rotulo: `Exemplo de sessão ${i + 1} — abrir foto`,
                onPress: () =>
                  setFotoAberta({ foto, legenda: 'Exemplo — a sua foto entra aqui' }),
              }))
            : percursos.map((p) => ({
                key: p.sessao.id,
                points: p.points,
                rotulo: `${rotulo(p.sessao.sport)}, ${quando(p.sessao.startedAt)}`,
                onPress: () => void abrirDetalhe(p.sessao),
              }));
          if (itens.length === 0) return null;
          return (
            <Card>
              <YStack>
                <Label marginBottom="$md">suas sessões</Label>
                {/*
                  No modo demonstração o favo entra ESMAECIDO e com o convite
                  por cima: assim a pessoa entende que aquilo é o lugar das
                  fotos dela, e não uma galeria alheia que o app trouxe.
                  A primeira sessão registrada troca as peças e devolve a
                  opacidade cheia.
                */}
                <YStack opacity={demo ? 0.35 : 1}>
                  <HexMosaic itens={itens} width={larguraDoFavo} />
                </YStack>
                {demo ? (
                  <YStack gap="$md" marginTop="$lg" alignItems="center">
                    <Data textAlign="center" maxWidth="90%">
                      Aqui ficam as fotos e os percursos dos seus treinos.
                    </Data>
                    <Button
                      title="Começar a registrar"
                      icon={<Icon name="play" size={16} color={darkPalette.ink} />}
                      onPress={() => setEscolhendo(true)}
                    />
                  </YStack>
                ) : null}
              </YStack>
            </Card>
          );
        })()}

        {/*
          O PLANO entra por último, como rodapé — não como abertura.

          Abrindo com a régua da semana, o painel do treino de hoje e o menu do
          módulo, esta tela era indistinguível da de Treino no primeiro quadro
          ("Treino e Esporte têm levado exatamente pra mesma tela", testador,
          ago/2026). A identidade daqui são as sessões e a constância; o que
          o plano reserva para hoje continua visível, mas depois delas.
        */}
        {semanaDeTreino && (semanaDeTreino.previstos > 0 || semanaDeTreino.minutos > 0) ? (
          <WeekRail
            semana={semanaDeTreino}
            selecionado={semanaDeTreino.dias.find((d) => d.ehHoje)?.weekday ?? ''}
            onSelect={() => (navigation as any).push('Progress')}
            streak={movimento?.streak}
          />
        ) : null}

        {/*
          A sessão de HOJE do plano continua sendo a peça de destaque (decisão
          da fundadora, ago/2026) — mas sem botão próprio: a ação preenchida
          desta tela é UMA, o botão flutuante. A peça inteira é o alvo, e a
          seta diz isso.
        */}
        {execucaoGuiada ? (
          <TrainingPanel
            ativo
            titulo={execucaoGuiada.workoutName}
            meta="Em andamento — continue de onde parou."
            onPress={() => (navigation as any).push('Training')}
            accessibilityLabel={`Treino em andamento: ${execucaoGuiada.workoutName}. Continuar`}
          />
        ) : treinoDeHoje ? (
          <TrainingPanel
            titulo={treinoDeHoje.name}
            icone={modalityMeta(treinoDeHoje.modality).icon as never}
            meta={metaDoTreino}
            onPress={() => (navigation as any).push('Checkin')}
            accessibilityLabel={`Treino de hoje: ${treinoDeHoje.name}, ${metaDoTreino}. Abrir check-in`}
          />
        ) : null}


        {/*
          Respiro para o favo nunca ficar sob o botão flutuante.

          Eram 48 pontos, e o botão cobria as peças de baixo do favo — que é
          alto e termina perto do rodapé. O flutuante tem 56 de altura mais 24
          de margem inferior; 120 deixa a última fileira respirando.
        */}
        <YStack height={120} />
       </YStack>
      </DetailScreen>

      <PhotoViewer
        foto={fotoAberta?.foto ?? null}
        legenda={fotoAberta?.legenda}
        onClose={() => setFotoAberta(null)}
      />

      {/* A ação principal da tela, flutuante: é o único acento aqui. */}
      <XStack position="absolute" right={24} bottom={insets.bottom + 24}>
        <ShadowView shadow={fabShadow} radius={28} backgroundColor={colors.accent}>
          <Pressable
            onPress={() => setEscolhendo(true)}
            accessibilityRole="button"
            accessibilityLabel="Iniciar treino"
          >
            {({ pressed }) => (
              <XStack
                backgroundColor="$primary"
                borderRadius={28}
                paddingVertical={16}
                paddingHorizontal={22}
                alignItems="center"
                gap="$sm"
                opacity={pressed ? 0.8 : 1}
              >
                {/* Sobre o acento, o ink ESCURO da marca nos dois temas.
                    Com `colors.ink` o texto virava claro no tema claro — texto
                    quase branco sobre roxo médio, que não alcança contraste. */}
                <Icon name="play" size={18} color={darkPalette.ink} />
                <Text fontSize={15} fontWeight="700" style={{ color: darkPalette.ink }}>
                  Iniciar treino
                </Text>
              </XStack>
            )}
          </Pressable>
        </ShadowView>
      </XStack>

      {/*
        A folha de início, em dois passos (decisão da fundadora, ago/2026):
        primeiro O JEITO — treino guiado (a interface de treino do plano) ou
        registro (o cronômetro com GPS) —, e só o registro pede o segundo
        passo, a modalidade. Quem quer o guiado nunca vê a grade.
      */}
      <Sheet
        open={escolhendo}
        onClose={() => {
          setEscolhendo(false);
          setPassoRegistro(false);
        }}
      >
        {!passoRegistro ? (
          <>
            <SectionTitle fontSize={18}>Iniciar treino</SectionTitle>
            <OpcaoDeInicio
              icone="dumbbell"
              titulo="Treino guiado"
              detalhe="o treino do seu plano, passo a passo na tela"
              destaque
              onPress={() => {
                setEscolhendo(false);
                (navigation as any).push('Checkin' as never);
              }}
            />
            <OpcaoDeInicio
              icone="footprints"
              titulo="Registro"
              detalhe="cronômetro, batimento e caloria — GPS onde faz sentido"
              onPress={() => setPassoRegistro(true)}
            />
          </>
        ) : (
          <EscolhaDeEsporte
            recentes={recentes}
            onPick={(sport) => {
              setEscolhendo(false);
              setPassoRegistro(false);
              void preparar(sport);
            }}
          />
        )}
      </Sheet>
    </YStack>
  );
}

/**
 * A grade de modalidades — busca em cima, prateleiras embaixo.
 *
 * Com 26 esportes, a parede de ícones que a lista curta permitia deixa de
 * funcionar: ninguém varre 26 alvos para achar um. A hierarquia tem três
 * degraus, e cada um resolve um caso diferente — quem já sabe o nome digita
 * (a busca aceita sinônimo e texto sem acento), quem repete a rotina acha na
 * primeira prateleira, e quem está explorando lê por prateleira temática em
 * vez de percorrer uma lista alfabética sem grupo.
 */
function EscolhaDeEsporte({
  recentes,
  onPick,
}: {
  recentes: Sport[];
  onPick: (sport: Sport) => void;
}) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const [busca, setBusca] = useState('');

  const buscando = busca.trim().length > 0;
  const achados = buscando ? searchSports(busca) : [];
  const prateleiras = buscando
    ? achados.length > 0
      ? [{ chave: 'busca', label: 'resultados', sports: achados }]
      : []
    : [
        ...(recentes.length > 0
          ? [{ chave: 'recentes', label: 'recentes', sports: recentes }]
          : []),
        ...sportSections().map((sec) => ({
          chave: sec.group,
          label: sec.label,
          sports: sec.sports,
        })),
      ];

  return (
    <>
      <SectionTitle fontSize={18}>Qual esporte?</SectionTitle>

      <XStack
        alignItems="center"
        gap="$sm"
        borderRadius={12}
        borderWidth={1}
        borderColor="$borderStrong"
        paddingHorizontal="$md"
      >
        <Icon name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 10 }}
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar modalidade"
          placeholderTextColor={colors.textFaint}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Buscar modalidade"
        />
      </XStack>

      {/* A folha para de crescer aqui: metade da tela é o que sobra acima do
          teclado, e o resto rola. */}
      <ScrollView
        style={{ maxHeight: height * 0.46 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <YStack gap="$xl">
          {prateleiras.map((prateleira) => (
            <YStack key={prateleira.chave} gap="$md">
              <Label>{prateleira.label}</Label>
              <XStack flexWrap="wrap" gap="$md">
                {prateleira.sports.map((sport) => (
                  <Pressable
                    key={`${prateleira.chave}-${sport.kind}`}
                    onPress={() => onPick(sport)}
                    accessibilityRole="button"
                    accessibilityLabel={`Preparar ${sport.label}`}
                    style={({ pressed }) => [{ width: '30.5%' }, pressed && { opacity: 0.6 }]}
                  >
                    <YStack
                      borderRadius={16}
                      borderWidth={1}
                      borderColor="$borderStrong"
                      paddingVertical="$lg"
                      paddingHorizontal="$xs"
                      alignItems="center"
                      gap="$sm"
                    >
                      <Icon name={sport.icon} size={22} color={colors.textMuted} />
                      <Body fontSize={13} color="$foreground" numberOfLines={1}>
                        {sport.label}
                      </Body>
                      <Data fontSize={10}>{sport.gps ? 'com GPS' : 'sem GPS'}</Data>
                    </YStack>
                  </Pressable>
                ))}
              </XStack>
            </YStack>
          ))}

          {buscando && achados.length === 0 ? (
            <Data>Nenhuma modalidade com esse nome. Apague a busca para ver todas.</Data>
          ) : null}
        </YStack>
      </ScrollView>
    </>
  );
}

/**
 * Uma opção da folha de início: cartão largo com ícone, título e detalhe.
 * O destaque (borda e fundo de acento) marca o caminho principal — a
 * hierarquia vem da superfície; os glifos de navegação seguem acromáticos.
 */
function OpcaoDeInicio({
  icone,
  titulo,
  detalhe,
  destaque,
  onPress,
}: {
  icone: IconName;
  titulo: string;
  detalhe: string;
  destaque?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={titulo}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      <XStack
        borderRadius={16}
        borderWidth={1}
        borderColor={destaque ? '$primary' : '$borderStrong'}
        backgroundColor={destaque ? '$primarySoft' : 'transparent'}
        paddingVertical="$lg"
        paddingHorizontal="$lg"
        alignItems="center"
        gap="$md"
      >
        <Icon name={icone} size={20} color={colors.textMuted} />
        <YStack flex={1} gap={2}>
          <SectionTitle fontSize={15}>{titulo}</SectionTitle>
          <Data fontSize={11}>{detalhe}</Data>
        </YStack>
        <Icon name="arrowRight" size={16} color={colors.textMuted} />
      </XStack>
    </Pressable>
  );
}


/**
 * O percurso inteiro, enquadrado — o mapinha do Strava. A região sai do
 * bounding box dos pontos com folga de 30%, para a linha nunca encostar na
 * borda do cartão.
 */
function MapaDePercurso({ points, accent }: { points: GeoPoint[]; accent: string }) {
  if (points.length < 2) return null;
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  return (
    <YStack height={260} borderRadius={16} overflow="hidden" marginTop="$md">
      <MapView
        style={{ flex: 1 }}
        scrollEnabled={false}
        zoomEnabled={false}
        region={{
          latitude: (minLat + maxLat) / 2,
          longitude: (minLon + maxLon) / 2,
          latitudeDelta: Math.max(0.003, (maxLat - minLat) * 1.3),
          longitudeDelta: Math.max(0.003, (maxLon - minLon) * 1.3),
        }}
      >
        <Polyline
          coordinates={points.map((p) => ({ latitude: p.lat, longitude: p.lon }))}
          strokeColor={accent}
          strokeWidth={4}
        />
      </MapView>
    </YStack>
  );
}

/* `Medida` virou `Readout`/`ReadoutCluster` em `components/ui`: o trio era
   remontado à mão em cada estado desta tela, e a ordem já divergia entre a
   sessão ao vivo e o detalhe do histórico. */

const rotulo = (kind: string) => SPORTS.find((s) => s.kind === kind)?.label ?? kind;

/**
 * A faixa de caloria de uma sessão do HISTÓRICO, recalculada de MET × duração.
 * O servidor guarda o ponto médio; a faixa é como o número aparece — e quando a
 * modalidade não é reconhecida, o ponto guardado entra com o `~` de estimativa.
 */
function faixaKcal(kind: string, durationS: number, kcal: number): string {
  const met = SPORTS.find((s) => s.kind === kind)?.met;
  return met ? kcalRangeLabel(met, durationS * 1000) : `~${kcal}`;
}

function quando(iso: string): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) {
    return `hoje ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
