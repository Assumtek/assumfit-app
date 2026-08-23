import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect } from 'react';
import { Pressable, Switch } from 'react-native';

import { DetailScreen } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { Section } from '../components/List';
import { Body, Button, Data, Label } from '../components/ui';
import { BLOCOS, blocosLigados, ehPadrao, type ChaveDeBloco } from '../domain/homeLayout';
import { useHomeStore } from '../store/home.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Personalizar a home.
 *
 * A ordem se muda por setas, não por arrastar: arrastar exige o runtime de
 * worklets do Reanimated, que este app evita de propósito, e um alvo de toque
 * de 44 px com rótulo de acessibilidade funciona para quem usa leitor de tela,
 * o que a lista arrastável não faz sem trabalho extra.
 */
export function HomeLayoutScreen() {
  const { colors } = useTheme();
  const blocos = useHomeStore((s) => s.blocos);
  const carregar = useHomeStore((s) => s.carregar);
  const alternar = useHomeStore((s) => s.alternar);
  const mover = useHomeStore((s) => s.mover);
  const restaurar = useHomeStore((s) => s.restaurar);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ligados = blocosLigados(blocos).length;

  return (
    <DetailScreen title="Personalizar a home">
      <Body marginBottom="$lg">
        Escolha o que aparece na tela inicial e em que ordem. A saudação, o estado da pulseira e os
        atalhos do topo ficam sempre.
      </Body>

      <Section label={`${ligados} de ${BLOCOS.length} blocos na home`}>
        {blocos.map((b, i) => {
          const d = BLOCOS.find((x) => x.chave === b.chave);
          if (!d) return null;
          return (
            <LinhaDeBloco
              key={b.chave}
              titulo={d.titulo}
              descricao={d.descricao}
              ligado={b.ligado}
              primeiro={i === 0}
              ultimo={i === blocos.length - 1}
              onAlternar={() => alternar(b.chave as ChaveDeBloco)}
              onSubir={() => mover(b.chave as ChaveDeBloco, -1)}
              onDescer={() => mover(b.chave as ChaveDeBloco, 1)}
              corAtiva={colors.accent}
              last={i === blocos.length - 1}
            />
          );
        })}
      </Section>

      {ligados === 0 ? (
        <Data marginTop="$md">
          Com todos os blocos desligados, a home fica só com a saudação e o estado da pulseira.
        </Data>
      ) : null}

      {!ehPadrao(blocos) ? (
        <YStack marginTop="$xl">
          <Button title="Voltar ao padrão" variant="secondary" onPress={restaurar} />
        </YStack>
      ) : null}
    </DetailScreen>
  );
}

function LinhaDeBloco({
  titulo,
  descricao,
  ligado,
  primeiro,
  ultimo,
  onAlternar,
  onSubir,
  onDescer,
  corAtiva,
  last,
}: {
  titulo: string;
  descricao: string;
  ligado: boolean;
  primeiro: boolean;
  ultimo: boolean;
  onAlternar: () => void;
  onSubir: () => void;
  onDescer: () => void;
  corAtiva: string;
  last: boolean;
}) {
  return (
    <XStack
      paddingVertical="$md"
      gap="$md"
      alignItems="center"
      borderBottomWidth={last ? 0 : 1}
      borderBottomColor="$border"
    >
      <YStack>
        <Seta
          direcao="up"
          desabilitada={primeiro}
          onPress={onSubir}
          rotulo={`Mover ${titulo} para cima`}
        />
        <Seta
          direcao="down"
          desabilitada={ultimo}
          onPress={onDescer}
          rotulo={`Mover ${titulo} para baixo`}
        />
      </YStack>

      <YStack flex={1} gap="$xs">
        <Label color={ligado ? '$foreground' : '$mutedForeground'}>{titulo}</Label>
        <Data>{descricao}</Data>
      </YStack>

      <Switch
        value={ligado}
        onValueChange={onAlternar}
        trackColor={{ true: corAtiva, false: undefined }}
        accessibilityLabel={`Mostrar ${titulo} na home`}
      />
    </XStack>
  );
}

function Seta({
  direcao,
  desabilitada,
  onPress,
  rotulo,
}: {
  direcao: 'up' | 'down';
  desabilitada: boolean;
  onPress: () => void;
  rotulo: string;
}) {
  return (
    <Pressable
      onPress={desabilitada ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ disabled: desabilitada }}
      hitSlop={8}
      style={({ pressed }) => ({ opacity: desabilitada ? 0.25 : pressed ? 0.5 : 1, padding: 4 })}
    >
      <Icon name={direcao === 'up' ? 'arrowUp' : 'arrowDown'} size={20} />
    </Pressable>
  );
}
