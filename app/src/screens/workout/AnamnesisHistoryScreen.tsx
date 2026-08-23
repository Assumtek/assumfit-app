import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';

import { Note } from '../../components/List';
import { DetailScreen } from '../../components/DetailScreen';
import { Icon } from '../../components/Icon';
import { Body, Button, Card, Data, Label, SectionTitle, Skeleton, Title } from '../../components/ui';
import { fetchAnamnesisHistory, type AnamnesisVersion } from '../../services/api.service';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Histórico de anamnese — o que você declarou, e quando.
 *
 * Existia um buraco: a anamnese era UMA linha por pessoa, sobrescrita a cada
 * resposta. Isso é certo para o agente, que precisa do que vale agora, e errado
 * para quem responde — não havia como ver o que foi declarado antes, nem
 * entender por que o plano do mês passado era daquele jeito.
 *
 * A lista mostra a data e quantas condições foram declaradas. **Não mostra
 * quais** — isso fica na tela de detalhe, aberta por toque. É a diferença entre
 * dado sensível que trafega por pedido explícito e dado sensível que aparece de
 * relance para quem estiver olhando a tela por cima do ombro.
 */
export function AnamnesisHistoryScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [versoes, setVersoes] = useState<AnamnesisVersion[] | null>(null);

  useEffect(() => {
    fetchAnamnesisHistory()
      .then(setVersoes)
      .catch(() => setVersoes([]));
  }, []);

  if (!versoes) {
    return (
      <DetailScreen title="Anamnese">
        <Skeleton lines={4} />
      </DetailScreen>
    );
  }

  if (versoes.length === 0) {
    return (
      <DetailScreen title="Anamnese">
        <Note
          title="Nenhuma versão registrada"
          body="Cada vez que você responde a anamnese, aquela versão fica guardada aqui, para você poder comparar o que mudou."
        />
        <YStack marginTop="$xl">
          <Button title="Responder anamnese" onPress={() => (navigation as any).push('Anamnesis')} />
        </YStack>
      </DetailScreen>
    );
  }

  return (
    <DetailScreen title="Anamnese">
      <YStack marginBottom="$xl">
        <Label>respostas guardadas</Label>
        <Title marginTop="$xs">
          {versoes.length}
        </Title>
        <Data>{versoes.length === 1 ? 'versão' : 'versões'}</Data>
      </YStack>

      <YStack gap="$md">
        {versoes.map((versao, i) => {
          const atual = i === 0;
          return (
            <Card
              key={versao.id}
              selected={atual}
              onPress={() => (navigation as any).push('AnamnesisVersion', { id: versao.id })}
              accessibilityLabel={`Versão de ${formatarData(versao.createdAt)}`}
            >
              <XStack alignItems="center" gap="$md">
                <YStack flex={1} minWidth={0} gap={4}>
                  <XStack alignItems="center" gap="$sm">
                    <Body color="$foreground">{formatarData(versao.createdAt)}</Body>
                    {atual ? <Data color="$primary">em uso</Data> : null}
                  </XStack>
                  {/*
                    A CONTAGEM de condições, nunca os nomes.

                    "3 condições declaradas" diz o que a lista precisa dizer;
                    "cardiopata, gestante" na lista exporia diagnóstico a quem
                    só abriu o histórico de relance.
                  */}
                  <Data>{resumo(clinicas(versao.flags))}</Data>
                </YStack>
                <Icon name="arrowRight" size={16} color={colors.textMuted} />
              </XStack>
            </Card>
          );
        })}
      </YStack>

      {/*
        A porta para responder de novo mora AQUI, e não só no lugar antigo.

        O menu rápido passou a abrir o histórico, então sem este botão quem quer
        atualizar a anamnese não tem caminho — o histórico viraria um beco.
      */}
      <YStack marginTop="$xl">
        <Button
          title="Responder de novo"
          variant="secondary"
          onPress={() => (navigation as any).push('Anamnesis')}
        />
      </YStack>

    </DetailScreen>
  );
}

const formatarData = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

/*
 Nem toda flag é condição: `iniciante`, `40-mais` e `idoso` são perfil, não
 clínica — contá-las fazia todo iniciante saudável ler "1 condição declarada"
 numa anamnese em que negou tudo. Rodada de testes 1, jul/2026.
*/
const PERFIL = new Set(['iniciante', '40-mais', 'idoso']);
const clinicas = (flags: string[]) => flags.filter((f) => !PERFIL.has(f)).length;

const resumo = (n: number) =>
  n === 0 ? 'nenhuma condição declarada' : `${n} ${n === 1 ? 'condição declarada' : 'condições declaradas'}`;
