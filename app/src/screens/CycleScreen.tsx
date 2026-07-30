import { XStack, YStack } from '@tamagui/stacks';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { Note, Row, Section } from '../components/Card';
import { CycleCalendar } from '../components/CycleCalendar';
import { DetailScreen, usePullRefresh } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { Body, Button, Data, Display, RatingText } from '../components/ui';
import {
  DEFAULT_LENGTH,
  PHASE_COPY,
  averageLength,
  nextPeriod,
  phaseOn,
  type CyclePhase,
  type LoggedCycle,
} from '../domain/cycle';
import * as api from '../services/api.service';
import { useTheme } from '../theme/ThemeProvider';

/** Chave `YYYY-MM-DD` no fuso LOCAL — `toISOString` viraria o dia à noite. */
function hoje(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function porExtenso(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
}

/** Ordem em que as fases acontecem — usada na régua do ciclo. */
const ORDEM: CyclePhase[] = ['menstrual', 'follicular', 'ovulatory', 'luteal'];

export function CycleScreen() {
  const { colors } = useTheme();

  const [cycles, setCycles] = useState<LoggedCycle[] | null>(null);
  const [consentiu, setConsentiu] = useState<boolean | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [lista, ok] = await Promise.all([api.fetchCycles(), api.fetchCycleConsent()]);
      setCycles(lista);
      setConsentiu(ok);
    } catch {
      setErro('Não foi possível carregar seus registros. Verifique a conexão com o servidor.');
      setCycles([]);
      setConsentiu(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const refresh = usePullRefresh(carregar);

  const hoje_ = hoje();
  const estado = useMemo(() => (cycles ? phaseOn(hoje_, cycles) : null), [cycles, hoje_]);
  const proxima = useMemo(() => (cycles ? nextPeriod(cycles) : null), [cycles]);
  const media = useMemo(() => (cycles ? averageLength(cycles) : null), [cycles]);

  /**
   * Marca ou desmarca um dia como início de menstruação.
   *
   * Aceita qualquer data passada, e não só hoje: quase sempre a pessoa lembra
   * depois, e um registro que só aceita "hoje" obriga a errar a data ou a
   * desistir.
   */
  const alternarDia = async (dia: string, jaRegistrado: boolean) => {
    setSalvando(true);
    setErro(null);
    try {
      if (jaRegistrado) await api.deleteCycle(dia);
      else await api.logCycle(dia);
      await carregar();
    } catch {
      setErro('Não foi possível salvar. Verifique a conexão e tente de novo.');
    } finally {
      setSalvando(false);
    }
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

  if (cycles === null) {
    return (
      <DetailScreen title="Ciclo" refreshControl={refresh}>
        <YStack paddingVertical="$xl">
          <ActivityIndicator size="small" color={colors.textMuted} />
        </YStack>
      </DetailScreen>
    );
  }

  return (
    <DetailScreen title="Ciclo" refreshControl={refresh}>
      {erro ? <Note title="Não foi possível carregar" body={erro} /> : null}

      {estado ? (
        <>
          <YStack marginTop="$md" marginBottom="$lg">
            <Display>{estado.day}</Display>
            <Data marginTop="$xs" color="$mutedForeground">
              dia do ciclo · de {estado.length}
              {estado.estimating ? ' (estimado)' : ''}
            </Data>
            <RatingText marginTop="$sm" color="$primary">
              {PHASE_COPY[estado.phase].label}
            </RatingText>
          </YStack>

          {/*
            Régua das quatro fases. O acento marca a fase ATUAL e nada mais —
            é dado, não decoração, e é o único acento da tela.
          */}
          <XStack gap="$xs" marginBottom="$lg">
            {ORDEM.map((f) => (
              <YStack key={f} flex={1} gap="$xs">
                <YStack
                  height={2}
                  borderRadius={1}
                  backgroundColor={f === estado.phase ? '$primary' : '$borderStrong'}
                />
                <Data fontSize={11} color={f === estado.phase ? '$foreground' : '$mutedForeground'}>
                  {PHASE_COPY[f].label.replace('Fase ', '')}
                </Data>
              </YStack>
            ))}
          </XStack>

          <Section label="O que muda agora">
            <Row>
              <Body flex={1} color="$foreground">{PHASE_COPY[estado.phase].body}</Body>
            </Row>
            <Row last>
              <Body flex={1} color="$foreground">{PHASE_COPY[estado.phase].training}</Body>
            </Row>
          </Section>

          <Section label="Previsão">
            <Row>
              <Body flex={1} color="$foreground">Próxima menstruação</Body>
              <Data flexShrink={0}>{proxima ? porExtenso(proxima) : '—'}</Data>
            </Row>
            <Row last>
              <Body flex={1} color="$foreground">
                {estado.daysToNext < 0 ? 'Atraso' : 'Faltam'}
              </Body>
              <Data flexShrink={0}>{Math.abs(estado.daysToNext)} dias</Data>
            </Row>
          </Section>
        </>
      ) : (
        <Note
          title="Nenhum ciclo registrado"
          body="Registre o primeiro dia da sua menstruação e o app passa a mostrar em que fase você está, o que ela muda no seu dia e quando a próxima é esperada."
        />
      )}

      {consentiu ? (
        <>
          <Section label="Toque no dia em que começou" />
          <CycleCalendar cycles={cycles} onToggle={(d, j) => void alternarDia(d, j)} busy={salvando} />
        </>
      ) : (
        <>
          {/*
            O consentimento é a porta, não um aviso no rodapé.

            Sem ele o servidor recusa a escrita — e mostrar um calendário que
            não grava seria pior que não mostrar nada. O texto diz o que
            acontece ao revogar porque essa é a parte que costuma ser omitida.
          */}
          <Note
            title="Antes de registrar"
            body="O ciclo é dado sensível e tem consentimento próprio, separado do de biometria. Ele fica no seu perfil, não é usado para publicidade e não é compartilhado. Se você revogar, os ciclos registrados são apagados."
          />
          <YStack marginTop="$lg" marginBottom="$md">
            <Button
              title="Concordo e quero registrar"
              onPress={() => void consentir()}
              loading={salvando}
              icon={<Icon name="drop" size={16} color={colors.ink} />}
            />
          </YStack>
        </>
      )}

      {cycles.length ? (
        <Section label="Registros">
          {cycles.slice(0, 6).map((c, i) => (
            <Row key={c.startedAt} last={i === Math.min(cycles.length, 6) - 1}>
              <Body flex={1} color="$foreground">{porExtenso(c.startedAt)}</Body>
              <Data flexShrink={0}>{c.durationDays ? `${c.durationDays} dias de fluxo` : '—'}</Data>
            </Row>
          ))}
        </Section>
      ) : null}

      {/*
        Duas ressalvas que não são texto de rodapé — são o limite do produto.

        A primeira porque previsão de ovulação por calendário erra com
        frequência, e alguém tratando isto como contracepção assumiria um risco
        que o app não avisou. A segunda porque ciclo irregular tem causas
        clínicas, e nomeá-las seria diagnóstico.
      */}
    </DetailScreen>
  );
}
