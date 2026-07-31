import { XStack, YStack } from '@tamagui/stacks';
import { File, Paths } from 'expo-file-system';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Switch } from 'react-native';

import { Note, Row, Section } from '../components/Card';
import { CycleCalendar, corDaFase } from '../components/CycleCalendar';
import { DetailScreen, usePullRefresh } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { Body, Button, Data, Headline } from '../components/ui';
import {
  PHASE_COPY,
  discardedIntervals,
  groupCycles,
  monthAhead,
  nextPeriod,
  phaseOn,
  type CyclePhase,
  type LoggedCycle,
} from '../domain/cycle';
import * as api from '../services/api.service';
import { cancelCycleHeadsUp, scheduleCycleHeadsUp } from '../services/notifications.service';
import { useTheme } from '../theme/ThemeProvider';

/** Chave `YYYY-MM-DD` no fuso LOCAL — `toISOString` viraria o dia à noite. */
function hoje(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** "30 de julho" — e com o ano quando não é o corrente, senão o histórico
 *  de doze meses fica ambíguo com o mês atual. */
function porExtenso(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const comAno = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    ...(comAno ? { year: 'numeric' } : {}),
  });
}

function capitaliza(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Ordem em que as fases acontecem — usada na régua do ciclo. */
const ORDEM: CyclePhase[] = ['menstrual', 'follicular', 'ovulatory', 'luteal'];

/**
 * A partir de quantos dias de atraso a tela troca de estado.
 *
 * Um ou dois dias é variação comum de previsão por calendário; três é quando
 * a pessoa começa a olhar a tela com outra pergunta — e fase afirmada com
 * confiança sobre uma previsão vencida beira o que o produto jurou não fazer.
 */
const ATRASO_VIRA_ESTADO = 3;

/** Preferência local do aviso "dois dias antes" — liga/desliga no aparelho. */
const ARQUIVO_AVISO_CICLO = 'aviso-ciclo.v1.json';

async function lerAvisoLigado(): Promise<boolean> {
  try {
    const f = new File(Paths.document, ARQUIVO_AVISO_CICLO);
    if (!f.exists) return true; // ligado por padrão — a pessoa consentiu no registro
    return (JSON.parse(await f.text()) as { ligado: boolean }).ligado;
  } catch {
    return true;
  }
}

function gravarAvisoLigado(ligado: boolean) {
  try {
    const f = new File(Paths.document, ARQUIVO_AVISO_CICLO);
    if (!f.exists) f.create();
    f.write(JSON.stringify({ ligado }));
  } catch {
    // Sem disco a escolha vale só nesta sessão.
  }
}

export function CycleScreen() {
  const { colors } = useTheme();

  const [cycles, setCycles] = useState<LoggedCycle[] | null>(null);
  /** `null` = ainda não sei (carregando ou falha) — diferente de "negou". */
  const [consentiu, setConsentiu] = useState<boolean | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** 403 do portão de sexo biológico — não é problema de conexão. */
  const [bloqueado, setBloqueado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
  const [avisoLigado, setAvisoLigado] = useState(true);

  useEffect(() => {
    void lerAvisoLigado().then(setAvisoLigado);
  }, []);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [lista, ok] = await Promise.all([api.fetchCycles(), api.fetchCycleConsent()]);
      setCycles(lista);
      setConsentiu(ok);
      setBloqueado(false);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        // O portão duplo do servidor: a tela só existe para sexo biológico
        // feminino no cadastro. Dizer "verifique a conexão" aqui era mentira.
        setBloqueado(true);
        setCycles([]);
        return;
      }
      setErro('Não foi possível carregar seus registros. Verifique a conexão com o servidor.');
      setCycles([]);
      // consentiu fica null: falha de rede NÃO significa que o consentimento
      // sumiu — reapresentar o botão de consentir aqui confundia.
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const refresh = usePullRefresh(carregar);

  const hoje_ = hoje();
  /*
   O servidor guarda DIAS marcados (um registro por dia de menstruação — o
   modelo por dia da Apple e do Flo); o domínio agrupa dias consecutivos em
   CICLOS com duração real de fluxo. Toda a matemática consome os grupos.
  */
  const dias = useMemo(() => (cycles ? cycles.map((c) => c.startedAt) : []), [cycles]);
  const diasSet = useMemo(() => new Set(dias), [dias]);
  const grupos = useMemo(() => groupCycles(dias), [dias]);
  const estado = useMemo(() => (cycles ? phaseOn(hoje_, grupos) : null), [cycles, grupos, hoje_]);
  const proxima = useMemo(() => (cycles ? nextPeriod(grupos) : null), [cycles, grupos]);
  const mes = useMemo(() => (cycles ? monthAhead(grupos, hoje_) : null), [cycles, grupos, hoje_]);
  const descartados = useMemo(() => (cycles ? discardedIntervals(grupos) : 0), [cycles, grupos]);

  /*
   As CONFIRMAÇÕES do benchmark (Flo pergunta "chegou?"; na Apple o término é
   parar de marcar): com fluxo ativo, um toque marca hoje também; na janela da
   previsão (ou atraso), um toque registra a chegada. Sem formulário, sem
   texto — botão contextual.
  */
  const ontem_ = useMemo(() => {
    const d = new Date(`${hoje_}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [hoje_]);
  const fluxoAtivo = !diasSet.has(hoje_) && diasSet.has(ontem_);
  const naJanela =
    !!estado && !diasSet.has(hoje_) && !fluxoAtivo && estado.daysToNext <= 1;

  const atraso = estado && estado.daysToNext < 0 ? -estado.daysToNext : 0;
  const emAtraso = atraso >= ATRASO_VIRA_ESTADO;

  // O aviso é rearmado a cada previsão nova — e respeita o interruptor.
  useEffect(() => {
    if (!avisoLigado) {
      void cancelCycleHeadsUp();
      return;
    }
    if (mes?.nextStart) void scheduleCycleHeadsUp(mes.nextStart);
  }, [mes?.nextStart, avisoLigado]);

  const executar = async (dia: string, remover: boolean) => {
    setSalvando(true);
    setErro(null);
    setConfirmacao(null);
    try {
      if (remover) await api.deleteCycle(dia);
      else await api.logCycle(dia);
      await carregar();
      setConfirmacao(
        remover ? `Registro de ${porExtenso(dia)} removido.` : `Início registrado em ${porExtenso(dia)}.`,
      );
    } catch {
      setErro('Não foi possível salvar. Verifique a conexão e tente de novo.');
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Marca ou desmarca UM DIA de menstruação — alternância livre, como no
   * benchmark (Apple/Flo): com o registro por dia, um toque errado custa um
   * dia, não um ciclo, e a confirmação viraria atrito em quem marca cinco
   * dias seguidos. Aceita qualquer data passada: quase sempre se lembra
   * depois.
   */
  const alternarDia = (dia: string, jaRegistrado: boolean) => {
    void executar(dia, jaRegistrado);
  };

  const consentir = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await api.setCycleConsent(true);
      await carregar();
    } catch {
      setErro('Não foi possível registrar o consentimento.');
    } finally {
      setSalvando(false);
    }
  };

  /**
   * A revogação prometida no consentimento — executável, como a LGPD exige
   * (Art. 8º §5º: revogar tem que ser tão fácil quanto consentir). Apaga os
   * registros no servidor; a confirmação repete o custo antes do toque final.
   */
  const revogar = () => {
    Alert.alert(
      'Revogar o consentimento?',
      'Os ciclos registrados são apagados do servidor, em definitivo. Você pode voltar a consentir depois, mas os registros não voltam.',
      [
        { text: 'Manter', style: 'cancel' },
        {
          text: 'Revogar e apagar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSalvando(true);
              try {
                await api.setCycleConsent(false);
                await cancelCycleHeadsUp();
                await carregar();
                setConfirmacao('Consentimento revogado e registros apagados.');
              } catch {
                setErro('Não foi possível revogar agora. Tente de novo.');
              } finally {
                setSalvando(false);
              }
            })();
          },
        },
      ],
    );
  };

  if (cycles === null) {
    return (
      <DetailScreen title="Ciclo" refreshControl={refresh}>
        <YStack paddingVertical="$xl">
          <ActivityIndicator size="small" color={colors.textMuted} />
        </YStack>
      </DetailScreen>
    );
  }

  if (bloqueado) {
    return (
      <DetailScreen title="Ciclo" refreshControl={refresh}>
        <Note
          title="Tela indisponível para este perfil"
          body="O acompanhamento de ciclo existe para perfis com sexo biológico feminino no cadastro — é ele que define as faixas de referência. Se o seu cadastro está errado, corrija em Perfil."
        />
      </DetailScreen>
    );
  }

  return (
    <DetailScreen title="Ciclo" refreshControl={refresh}>
      {erro ? <Note title="Não deu desta vez" body={erro} /> : null}

      {estado && !emAtraso ? (
        <>
          {/*
            A FASE é a manchete — regra de ouro do produto: a avaliação em
            linguagem humana no destaque, o número técnico como sub-rótulo. O
            "dia 23" é contagem de calendário sobre estimativa; tratá-lo como
            medição de 72pt era herança do template das telas de métrica.
          */}
          <YStack marginTop="$md" marginBottom="$lg">
            <Headline>{PHASE_COPY[estado.phase].label}</Headline>
            <Data marginTop="$xs" color="$mutedForeground">
              dia {estado.day} de {estado.length}
              {estado.estimating ? ' · estimado' : ''}
            </Data>
          </YStack>

        </>
      ) : estado && emAtraso ? (
        <>
          {/*
            O ATRASO é um estado de primeira classe — era o momento de maior
            carga emocional da tela e o único sem desenho: fase afirmada como
            fato, previsão no passado e promessa de aviso que nunca dispararia.
            Aqui a tela PARA DE AFIRMAR: sem fase, sem janelas, sem hipótese de
            causa — atraso é atraso, e o resto é da pessoa com quem ela quiser.
          */}
          <YStack marginTop="$md" marginBottom="$lg">
            <Headline>Atraso de {atraso} {atraso === 1 ? 'dia' : 'dias'}</Headline>
            <Data marginTop="$xs" color="$mutedForeground">
              a previsão era {proxima ? porExtenso(proxima) : '—'} · ciclo atual com {estado.day} dias
            </Data>
          </YStack>
          <Note
            title="A previsão passou"
            body="Registre o primeiro dia quando ele vier — a previsão recalcula sozinha. Variação entre ciclos é comum."
          />
        </>
      ) : (
        <Note
          title="Nenhum ciclo registrado"
          body="Registre o primeiro dia da menstruação e o app mostra a fase, o que ela muda no seu dia e quando vem a próxima."
        />
      )}

      {/*
        O CALENDÁRIO é a visão principal — logo sob a manchete, com o mês
        inteiro pintado por fase (a rampa do mesmo roxo) e o hoje no anel. A
        régua de fases saiu: virou redundância do que o calendário já mostra.
      */}
      {consentiu ? (
        <>
          {/* As confirmações do benchmark, como BOTÃO e não texto: chegada na
              janela da previsão (ou atraso) e continuação do fluxo. O término
              é parar de marcar — como na Apple. */}
          {naJanela || fluxoAtivo ? (
            <YStack alignSelf="flex-start" marginTop="$md">
              <Button
                title={fluxoAtivo ? 'Menstruando hoje também' : 'Minha menstruação chegou'}
                size="md"
                onPress={() => void executar(hoje_, false)}
                loading={salvando}
                icon={<Icon name="drop" size={14} color="#0E0A22" />}
              />
            </YStack>
          ) : null}
          {cycles.length === 0 ? (
            <Data marginTop="$md" marginBottom="$sm">Toque nos dias de menstruação.</Data>
          ) : null}
          <CycleCalendar marcados={dias} grupos={grupos} onToggle={alternarDia} busy={salvando} />
          {/* Legenda: o ponto é REGISTRO; a mancha é fase deduzida — e a
              rampa de intensidade é a ordem das fases, não quatro cores. */}
          <XStack flexWrap="wrap" gap="$md" rowGap="$xs" marginTop="$sm" alignItems="center">
            <XStack alignItems="center" gap="$xs">
              <YStack width={5} height={5} borderRadius={3} backgroundColor="$primary" />
              <Data fontSize={11}>dia de menstruação</Data>
            </XStack>
            {ORDEM.map((f) => (
              <XStack key={f} alignItems="center" gap="$xs">
                <YStack
                  width={12}
                  height={12}
                  borderRadius={6}
                  style={{ backgroundColor: corDaFase(f, colors.accent) }}
                />
                <Data fontSize={11}>
                  {capitaliza(PHASE_COPY[f].label.replace('Fase ', '').toLowerCase())}
                </Data>
              </XStack>
            ))}
          </XStack>
          {confirmacao ? (
            <Data marginTop="$sm" color="$foreground">
              {confirmacao}
            </Data>
          ) : null}
        </>
      ) : consentiu === false ? (
        <>
          {/*
            O consentimento é a porta, não um aviso no rodapé.

            Sem ele o servidor recusa a escrita — e mostrar um calendário que
            não grava seria pior que não mostrar nada.
          */}
          <Note
            title="Antes de registrar"
            body="O ciclo é dado sensível, com consentimento próprio e separado do de biometria. Não é usado para publicidade nem compartilhado. Revogar apaga os registros."
          />
          <YStack marginTop="$lg" marginBottom="$md">
            <Button
              title="Concordo e quero registrar"
              onPress={() => void consentir()}
              loading={salvando}
              icon={<Icon name="drop" size={16} color="#0E0A22" />}
            />
          </YStack>
        </>
      ) : null}

      {estado && !emAtraso ? (
        <>
          {/* Sem parágrafo de fase — pedido explícito (ago/2026): a tela é o
              calendário; o texto de fase mora no rótulo e na Ajuda. */}
          {/* UMA Section de previsão — a FÉRTIL é a linha que importa, com o
              aviso ao lado porque previsão de fertilidade sem ele é perigosa. */}
          <Section label="Previsão">
            <Row>
              <Body flex={1} color="$foreground">Próxima menstruação</Body>
              <Data flexShrink={0} color="$foreground">
                {proxima ? porExtenso(proxima) : '—'}
                {estado.daysToNext === 0
                  ? ' · é hoje'
                  : estado.daysToNext > 0
                    ? ` · em ${estado.daysToNext} ${estado.daysToNext === 1 ? 'dia' : 'dias'}`
                    : ` · atraso de ${Math.abs(estado.daysToNext)} ${Math.abs(estado.daysToNext) === 1 ? 'dia' : 'dias'}`}
              </Data>
            </Row>
            {mes ? (
              <Row>
                <YStack flex={1} gap={2}>
                  <Body color="$foreground" fontWeight="700">Janela fértil</Body>
                  <Data fontSize={11}>para autoconhecimento — não é método contraceptivo</Data>
                </YStack>
                <YStack alignItems="flex-end" flexShrink={0} gap={2}>
                  <Data color="$foreground">
                    {porExtenso(mes.fertile.from)} – {porExtenso(mes.fertile.to)}
                  </Data>
                  <Data fontSize={11}>
                    ovulação ~{porExtenso(mes.fertile.peak)}
                    {mes.estimating ? ' · faixa aproximada' : ''}
                  </Data>
                </YStack>
              </Row>
            ) : null}
            {mes ? (
              <Row last>
                <Body flex={1} color="$foreground">Aviso dois dias antes</Body>
                <Switch
                  value={avisoLigado}
                  onValueChange={(v) => {
                    setAvisoLigado(v);
                    gravarAvisoLigado(v);
                  }}
                  trackColor={{ true: colors.accent }}
                />
              </Row>
            ) : null}
          </Section>
        </>
      ) : null}

      {descartados >= 2 ? (
        <Note
          title="Previsão limitada para o seu ritmo"
          body="Seus intervalos variam além da faixa que a previsão usa (21 a 35 dias) — ela pode errar mais no seu caso. Os registros continuam valendo."
        />
      ) : null}

      {grupos.length ? (
        <Section label="Registros">
          {[...grupos].reverse().slice(0, 6).map((c, i, lista) => {
            // Intervalo real até o ciclo anterior + fluxo real dos dias
            // marcados — os dois vêm do agrupamento, nada é prometido à toa.
            const anterior = lista[i + 1];
            const intervalo = anterior
              ? Math.round(
                  (new Date(`${c.startedAt}T12:00:00`).getTime() -
                    new Date(`${anterior.startedAt}T12:00:00`).getTime()) /
                    86_400_000,
                )
              : null;
            const partes = [
              c.durationDays && c.durationDays >= 2 ? `${c.durationDays} dias de fluxo` : null,
              intervalo ? `ciclo de ${intervalo} dias` : null,
            ].filter(Boolean);
            return (
              <Row key={c.startedAt} last={i === Math.min(lista.length, 6) - 1}>
                <Body flex={1} color="$foreground">{porExtenso(c.startedAt)}</Body>
                <Data flexShrink={0}>{partes.length ? partes.join(' · ') : 'primeiro registro'}</Data>
              </Row>
            );
          })}
        </Section>
      ) : null}

      {consentiu ? (
        <Pressable
          onPress={revogar}
          accessibilityRole="button"
          style={({ pressed }) => [{ paddingVertical: 24 }, pressed && { opacity: 0.5 }]}
        >
          <Body color="$destructive">Revogar consentimento e apagar registros</Body>
        </Pressable>
      ) : null}
    </DetailScreen>
  );
}
