import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { Pressable, TextInput } from 'react-native';

import { DetailScreen } from '../../components/DetailScreen';
import { EscalaSlider } from '../../components/EscalaSlider';
import { ScalePicker } from '../../components/ScalePicker';
import { Icon } from '../../components/Icon';
import { Body, BodyLarge, Button, Card, Data, Heading, HeroCard, Metric, RatingText, SectionTitle, Skeleton, Subtitle } from '../../components/ui';
import { achievementsFor, type Achievement } from '../../domain/achievements';
import { mensagemDaFalha } from '../../domain/apiErrors';
import { formatDuration, rateCompletion, rateEffort } from '../../domain/workout';
import { fetchExecutionHistory, fetchSessionFeedback } from '../../services/api.service';
import { useWorkoutStore } from '../../store/workout.store';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Fim de treino: percepção de esforço, nota da sessão, resumo.
 *
 * O esforço é perguntado ANTES de mostrar o resultado. Ver "treino completo" na
 * tela muda a resposta de quem ia dizer que foi pesado — é o mesmo motivo pelo
 * qual nenhuma opção vem pré-marcada.
 *
 * Regra de ouro do design: o destaque é a avaliação em linguagem humana. A
 * porcentagem de conclusão fica de sub-label, nunca em corpo grande.
 */
export function TrainingFinishedScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();

  const finish = useWorkoutStore((s) => s.finish);
  const execution = useWorkoutStore((s) => s.execution);

  const [effort, setEffort] = useState<number | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [conquistas, setConquistas] = useState<Achievement[]>([]);
  /**
   * O comentário do modelo sobre a sessão (Leonardo, 31/08/2026).
   *
   * `undefined` enquanto busca, `null` quando não há: são estados diferentes.
   * Sem modelo ou sem crédito, o bloco não aparece, e isso é melhor que uma
   * frase genérica dando a entender que alguém leu os números do treino.
   */
  const [comentario, setComentario] = useState<{ headline: string; body: string } | null | undefined>(
    undefined);
  /*
   O id da execução, guardado ANTES de concluir: o `finish` limpa a sessão do
   store, e sem isto não haveria o que perguntar ao servidor depois.
  */
  const [execucaoConcluida, setExecucaoConcluida] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    durationSec: number | null;
    completionPct: number | null;
    workoutName: string;
    exercicios: number | null;
    volumeKg: number | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFinish = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setExecucaoConcluida(execution?.id ?? null);
    try {
      setResult(await finish({ perceivedEffort: effort, rating, comment: comment || null }));
    } catch (err) {
      /*
       O MOTIVO, e não só o fato.

       "Não foi possível concluir e não aparece o motivo, apenas o erro" (Bruno,
       27/08/2026). Concluir um treino é o fim de uma hora de esforço, e é o
       pior lugar para um erro mudo: sem saber se foi a sessão, o servidor ou a
       rede, a única ação possível é tentar de novo até desistir. O tradutor de
       causas já existia e era usado em oito outras telas.
      */
      setError(mensagemDaFalha(err, 'Concluir o treino'));
      console.warn('[treino] concluir falhou:', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // ---- Resumo, depois de concluído --------------------------------------
  /*
   As conquistas saem do histórico, e não do resultado da sessão.

   Sequência e marco dependem do que veio ANTES — o `finish` do servidor só
   conhece a sessão que acabou. A lista já inclui a de agora, porque ela foi
   gravada antes desta tela abrir.
  */
  useEffect(() => {
    if (!result) return;
    fetchExecutionHistory(365)
      .then((h) => setConquistas(achievementsFor(h, Date.now())))
      .catch(() => undefined);
  }, [result]);

  /*
   O comentário vem DEPOIS da conclusão, em chamada própria: concluir não pode
   depender do modelo, e o treino já está gravado quando esta tela abre. Falha
   aqui é silêncio, nunca erro na tela.
  */
  useEffect(() => {
    if (!result || !execucaoConcluida) return;
    let vivo = true;
    fetchSessionFeedback(execucaoConcluida)
      .then((c) => vivo && setComentario(c))
      .catch(() => vivo && setComentario(null));
    return () => {
      vivo = false;
    };
  }, [result, execucaoConcluida]);

  if (result) {
    const completion = rateCompletion(result.completionPct);
    const effortRating = rateEffort(effort);

    return (
      <DetailScreen title="Treino concluído">
        <YStack gap="$xl" paddingTop="$lg">
          <HeroCard eyebrow={result.workoutName}>
            <Metric fontWeight="300" color="$foreground" letterSpacing={-2}>
              {formatDuration(result.durationSec ?? 0)}
            </Metric>
            <Subtitle fontWeight="700" color="$foreground">
              {completion.label}
            </Subtitle>
            <Body color="$mutedForeground">
              {completion.detail}
            </Body>
            <YStack height={8} borderRadius={4} backgroundColor="$track" overflow="hidden" marginTop="$sm">
              <YStack
                height={8}
                borderRadius={4}
                width={`${completion.fraction * 100}%`}
                backgroundColor="$primary"
              />
            </YStack>
          </HeroCard>

          {effortRating.available ? (
            <Card>
              <Data
                fontWeight="700"
                letterSpacing={1.2}
                color="$mutedForeground"
                textTransform="uppercase"
              >
                esforço percebido
              </Data>
              <RatingText fontWeight="700" color="$foreground" marginTop="$sm">
                {effortRating.label}
              </RatingText>
              <Body color="$mutedForeground">
                {effortRating.detail}
              </Body>
            </Card>
          ) : null}

          {/*
            A leitura da sessão, em linguagem humana.

            Fica ACIMA das conquistas porque fala do treino que acabou de
            acontecer; conquista é histórico. Enquanto carrega, um esqueleto
            no formato do texto: a tela não pisca com o bloco aparecendo do
            nada depois de dois segundos.
          */}
          {comentario === undefined ? (
            <Card>
              <Skeleton lines={3} />
            </Card>
          ) : comentario ? (
            <Card>
              <Data
                fontWeight="700"
                letterSpacing={1.2}
                color="$mutedForeground"
                textTransform="uppercase"
              >
                sobre este treino
              </Data>
              <RatingText fontWeight="700" color="$foreground" marginTop="$sm">
                {comentario.headline}
              </RatingText>
              <Body color="$mutedForeground">{comentario.body}</Body>
            </Card>
          ) : null}

          {conquistas.length > 0 ? (
            <YStack gap="$md" marginTop="$md">
              <SectionTitle>Conquistas</SectionTitle>
              {conquistas.map((c) => (
                <Card key={c.key} selected={c.fresh}>
                  <XStack alignItems="center" gap="$md">
                    <Icon
                      name={c.fresh ? 'flame' : 'check'}
                      size={20}
                      color={c.fresh ? colors.accent : colors.textMuted}
                    />
                    <YStack flex={1} minWidth={0} gap={4}>
                      <SectionTitle color="$foreground">
                        {c.title}
                      </SectionTitle>
                      <Data color="$mutedForeground">
                        {c.detail}
                      </Data>
                    </YStack>
                    {c.fresh ? <Data color="$primary">novo</Data> : null}
                  </XStack>
                </Card>
              ))}
            </YStack>
          ) : null}

          {/*
            Compartilhar vem ANTES de "Pronto", e é secundário.

            Depois de "Pronto" ninguém volta — a tela sai da pilha e o treino
            vira histórico. Mas compartilhar também não pode ser a ação
            principal: o objetivo do app é a pessoa treinar, não publicar.
          */}
          <Button
            title="Compartilhar treino"
            variant="secondary"
            onPress={() =>
              (navigation as any).push('WorkoutShare', {
                workoutName: result.workoutName,
                durationSec: result.durationSec,
                /*
                 Contagem e carga saem das séries que a pessoa digitou nesta
                 sessão, lidas na conclusão. O `finish` do servidor ainda não
                 devolve nenhum dos dois, e mandar `null` fazia o cartão exibir
                 os chips "Exerc." e "Carga" marcados sem nada por trás.

                 Continuam podendo ser nulos, e aí o cartão omite o bloco: quem
                 fez um treino sem carga (peso corporal) não deve ver zero, que
                 afirmaria que não levantou nada.
                */
                exercises: result.exercicios,
                volumeKg: result.volumeKg,
              })
            }
          />

          <Button
            title="Pronto"
            icon={<Icon name="check" size={16} color={colors.ink} />}
            onPress={() => navigation.navigate('Main')}
          />

        </YStack>
      </DetailScreen>
    );
  }

  // ---- Antes de concluir -------------------------------------------------
  return (
    <DetailScreen title="Fim do treino">
      <YStack gap="$xl" paddingTop="$lg">
        <YStack gap="$xs">
          <Heading fontWeight="800" color="$foreground" letterSpacing={-0.5}>
            Como foi?
          </Heading>
          <Body color="$mutedForeground">
            {execution?.workoutName ?? 'Sua sessão'}, duas perguntas rápidas antes de fechar.
          </Body>
        </YStack>

        <Card>
          <Data
            fontWeight="700"
            letterSpacing={1.2}
            color="$mutedForeground"
            textTransform="uppercase"
          >
            esforço percebido
          </Data>
          <BodyLarge color="$foreground" marginTop="$sm" marginBottom="$md">
            Quanto este treino puxou?
          </BodyLarge>
          {/*
            Slider de 1 a 10, e não cinco botões pares.

            "Quanto este treino puxou está de 2 em 2, seria legal ter um slider"
            (Leonardo, 25/08/2026). O pedido é de método antes de ser de gosto:
            esforço percebido é escala de um em um, e oferecer só os pares
            empurra a resposta para o vizinho.

            A nota da sessão abaixo continua em botões: cinco opções cabem, e
            ali cada número é uma categoria, não um ponto de uma régua.
          */}
          <EscalaSlider
            faixa={{ minimo: 1, maximo: 10 }}
            value={effort}
            onPick={setEffort}
            label="Esforço percebido"
            legendaMin="leve"
            legendaMax="no limite"
          />
        </Card>

        <Card>
          <Data
            fontWeight="700"
            letterSpacing={1.2}
            color="$mutedForeground"
            textTransform="uppercase"
          >
            nota da sessão
          </Data>
          <BodyLarge color="$foreground" marginTop="$sm" marginBottom="$md">
            O treino de hoje serviu para você?
          </BodyLarge>
          <ScalePicker values={[1, 2, 3, 4, 5]} value={rating} onPick={setRating} label="Nota" />
        </Card>

        <Card>
          <Data
            fontWeight="700"
            letterSpacing={1.2}
            color="$mutedForeground"
            textTransform="uppercase"
          >
            observação
          </Data>
          <TextInput
            style={{
              color: colors.text,
              fontSize: 16,
              minHeight: 64,
              textAlignVertical: 'top',
              marginTop: 8,
            }}
            value={comment}
            onChangeText={setComment}
            placeholder="Algo que queira registrar (opcional)"
            placeholderTextColor={colors.textFaint}
            multiline
            accessibilityLabel="Observação sobre o treino"
          />
        </Card>

        {error ? (
          <Body color="$destructive">
            {error}
          </Body>
        ) : null}

        <Button
          title={busy ? 'Concluindo…' : 'Concluir treino'}
          icon={<Icon name="check" size={16} color={colors.ink} />}
          loading={busy}
          onPress={handleFinish}
        />
      </YStack>
    </DetailScreen>
  );
}

