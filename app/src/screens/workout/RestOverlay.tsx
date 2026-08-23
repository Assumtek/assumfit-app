import { XStack, YStack } from '@tamagui/stacks';
import { Body, Micro, Title } from '../../components/ui';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Pressable } from 'react-native';

/**
 * Descanso entre séries — barra fixa no rodapé, portada do MUVX.
 *
 * **Não bloqueia a tela.** É a decisão que define este componente: durante o
 * descanso a pessoa quer conferir a próxima série, ajustar a carga que acabou
 * de registrar, rolar a lista. Um modal com véu por cima impede tudo isso por
 * um minuto e meio, várias vezes por treino.
 *
 * O tempo vem de um instante-alvo em epoch, nunca de um contador. Três coisas
 * dependem disso:
 *
 * 1. o app em segundo plano — o celular vai para o bolso durante o descanso,
 *    que é o caso normal, não a exceção;
 * 2. a volta do segundo plano, que recalcula em vez de retomar de onde parou;
 * 3. o app morto no meio, com o alvo persistido.
 *
 * A barra fica ACIMA do rodapé de ações, cuja altura é MEDIDA e chega por
 * parâmetro. Sobrepor o "Concluir exercício" seria esconder o botão mais usado
 * da tela justamente quando ele é o próximo passo.
 */

export function RestOverlay({
  endsAt,
  onSkip,
  footerHeight,
  nextLabel,
  nextName,
}: {
  endsAt: number;
  onSkip: () => void;
  /**
   * Altura MEDIDA do rodapé de ações.
   *
   * Vem por parâmetro em vez de constante porque a barra assenta em cima dele —
   * e um número fixo que não corresponda ao rodapé real cobre o botão
   * "Concluir exercício", que é o mais usado da tela.
   */
  footerHeight: number;
  /** "A seguir" ou "Próxima série". */
  nextLabel?: string | null;
  nextName?: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [total] = useState(() => Math.max(1, Math.round((endsAt - Date.now()) / 1000)));
  const completed = useRef(false);
  const appState = useRef(AppState.currentState);

  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  /*
   Voltar do segundo plano recalcula na hora, sem esperar o próximo tique.
   Sem isto a barra mostra o valor de quando o app saiu de cena por até um
   segundo — e quando o descanso já acabou, ela some com atraso visível.
  */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        setNow(Date.now());
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  // Encerra sozinho ao zerar. O `ref` evita chamar duas vezes entre re-renders.
  useEffect(() => {
    if (remaining <= 0 && !completed.current) {
      completed.current = true;
      onSkip();
    }
  }, [remaining, onSkip]);

  // A linha ENCHE conforme o tempo passa — ela mede o descanso cumprido, não o
  // que falta. Piso de 2% para não sumir por completo no primeiro instante.
  const elapsedRatio = total > 0 ? 1 - Math.min(remaining / total, 1) : 0;

  return (
    <YStack
      position="absolute"
      left={16}
      right={16}
      bottom={footerHeight + 8}
      zIndex={1000}
      borderRadius={16}
      overflow="hidden"
      /*
       Superfície OPACA, e não `$card`.

       No escuro `$card` é um véu de 3% sobre o fundo — tinta para peça assentada
       sobre superfície opaca, não para painel que flutua sobre conteúdo. Usado
       aqui, o texto das séries atravessava a barra por trás e ela parecia
       deslocada em vez de translúcida. É o mesmo erro que estava no sheet de
       troca, e a mesma correção: `$backgroundStrong` (o `ink2` da paleta).
      */
      backgroundColor="$backgroundStrong"
      borderWidth={1}
      borderColor="$borderStrong"
      /*
       A sombra fica AQUI e não num `ShadowView` por fora porque esta peça
       flutua: ela não é conteúdo elevado sobre uma superfície, é um painel
       sobre a tela inteira. O `overflow: hidden` recorta a sombra no iOS, e é
       por isso que ela é escura e larga — para ler como distância, não relevo.
      */
      shadowColor="#000000"
      shadowOpacity={0.4}
      shadowRadius={24}
      shadowOffset={{ width: 0, height: 12 }}
      elevation={10}
    >
      <XStack alignItems="center" gap="$md" paddingVertical={16} paddingHorizontal={16}>
        {/*
          78, medido — não 64.

          A largura fixa existe para o bloco do meio não reposicionar a cada
          dezena de segundo. Mas 64 (o valor do MUVX, que usa fonte mono mais
          estreita) não comporta `01:31` em 26 px: o texto QUEBRAVA em duas
          linhas. Quatro dígitos tabulares nesta fonte pedem ~70 px; 78 dá folga.
        */}
        <YStack width={80}>
          <Title
            fontWeight="600"
            color="$foreground"
            letterSpacing={0.5}
            lineHeight={30}
            // Dígitos de largura fixa: o número muda a cada segundo, e sem isso
            // tudo à direita dele treme junto.
            fontVariant={['tabular-nums']}
            numberOfLines={1}
          >
            {formatRest(remaining)}
          </Title>
        </YStack>

        <YStack flex={1} minWidth={0} gap={4}>
          <Micro
            fontWeight="800"
            letterSpacing={1.5}
            color="$primary"
            textTransform="uppercase"
          >
            Descanso
          </Micro>
          <Body fontWeight="600" color="$foreground" numberOfLines={1}>
            {nextName ? `${nextLabel ?? 'A seguir'}: ${nextName}` : 'Próxima série em breve'}
          </Body>
        </YStack>

        <Pressable
          onPress={() => {
            completed.current = true;
            onSkip();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Pular descanso"
        >
          <YStack
            paddingHorizontal={16}
            paddingVertical={12}
            borderRadius={999}
            backgroundColor="$primary"
          >
            <Body fontWeight="800" color="$primaryForeground">
              Pular
            </Body>
          </YStack>
        </Pressable>
      </XStack>

      <YStack height={4} backgroundColor="$border">
        <YStack
          height={4}
          width={`${Math.max(elapsedRatio * 100, 2)}%`}
          backgroundColor="$primary"
          borderTopRightRadius={3}
          borderBottomRightRadius={3}
        />
      </YStack>
    </YStack>
  );
}

/** `95` → `01:35`. Mesma largura fixa do cronômetro da sessão. */
function formatRest(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
