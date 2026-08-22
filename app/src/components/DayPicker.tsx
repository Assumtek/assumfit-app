import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable, ScrollView } from 'react-native';

import { Data } from './ui';
import { isoHoje } from '../domain/water';
import type { Ponto } from '../domain/series';
import {
  diasComDado,
  pontosDoDia,
  rotuloDoDia,
  ultimosDias,
  type DiaIso,
} from '../domain/dayHistory';
import { useHistoryStore } from '../store/history.store';
import type { HourlyPoint } from '../services/api.service';

/**
 * A tira de dias no topo das telas de saúde.
 *
 * Uma tira horizontal, e não um calendário de mês: o alcance real do histórico
 * são trinta dias, e uma grade de mês prometeria navegação para meses que não
 * existem no servidor. A tira mostra exatamente o que dá para escolher.
 *
 * Abre à direita, no dia de hoje, e rola para trás — a ordem em que se lê o
 * tempo, e a que põe o mais provável debaixo do polegar.
 *
 * Dia sem medição fica apagado mas CONTINUA tocável: bloquear o toque esconderia
 * a informação mais útil que a tela tem a dar num dia vazio, que é dizer que
 * naquele dia não houve medição — diferente de "o app não carregou".
 */
export function DayPicker({
  dias = 30,
  selecionado,
  onSelecionar,
  comDado,
}: {
  dias?: number;
  selecionado: DiaIso;
  onSelecionar: (dia: DiaIso) => void;
  /** Dias que têm medição desta grandeza. Ausente, nenhum fica apagado. */
  comDado?: Set<DiaIso>;
}) {
  const hoje = isoHoje();
  const lista = ultimosDias(dias);
  const ref = React.useRef<ScrollView>(null);

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      // Começa no fim (hoje) sem animar: animar na montagem faria a tela abrir
      // deslizando, que lê como carregamento.
      onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}
      contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}
    >
      {lista.map((dia) => {
        const ativo = dia === selecionado;
        const vazio = comDado ? !comDado.has(dia) && dia !== hoje : false;
        return (
          <Pressable
            key={dia}
            onPress={() => onSelecionar(dia)}
            accessibilityRole="button"
            accessibilityState={{ selected: ativo }}
            accessibilityLabel={dia === hoje ? 'hoje' : dia}
          >
            <YStack
              paddingHorizontal="$md"
              paddingVertical="$sm"
              borderRadius={999}
              borderWidth={1}
              // O acento marca a SELEÇÃO, que é dado da tela — a régua do
              // sistema de design. Os demais ficam com a aresta neutra.
              borderColor={ativo ? '$primary' : '$border'}
              backgroundColor={ativo ? '$primary' : 'transparent'}
            >
              <Data color={ativo ? '$background' : vazio ? '$faint' : '$mutedForeground'}>
                {rotuloDoDia(dia, hoje)}
              </Data>
            </YStack>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** O respiro padrão da tira dentro de uma tela de detalhe. */
export function DayPickerRow(props: React.ComponentProps<typeof DayPicker>) {
  return (
    <XStack marginBottom="$lg">
      <DayPicker {...props} />
    </XStack>
  );
}

/**
 * O dia escolhido e a série dele, para uma grandeza.
 *
 * A regra que este gancho existe para concentrar: **hoje vem da pulseira, o
 * passado vem do servidor.** São resoluções diferentes — a pulseira mede a cada
 * cinco minutos e o servidor agrega por hora — e usar o servidor para hoje seria
 * trocar a curva boa por uma grosseira. Usar a pulseira para o passado nem é
 * possível: ela guarda sete dias e cobra uma consulta serial por dia.
 *
 * Cada tela passa o seu extrator; a série horária é a mesma para todas, baixada
 * uma vez por sessão.
 */
export function useHistoricoDoDia(
  extrair: (p: HourlyPoint) => number | null,
  serieDeHoje: Ponto[]) {
  const serie = useHistoryStore((s) => s.serie);
  const load = useHistoryStore((s) => s.load);
  const [dia, setDia] = React.useState<DiaIso>(() => isoHoje());

  React.useEffect(() => {
    void load();
  }, [load]);

  const hoje = isoHoje();
  /*
   Sem `useMemo` de propósito: são 720 pontos no pior caso, e a dependência
   seria o extrator — uma função nova a cada render, que faria o memo recalcular
   sempre e ainda custaria a comparação.
  */
  const comDado = diasComDado(serie, extrair);
  const pontos = dia === hoje ? serieDeHoje : pontosDoDia(serie, dia, extrair);

  return { dia, setDia, pontos, comDado, ehHoje: dia === hoje };
}
