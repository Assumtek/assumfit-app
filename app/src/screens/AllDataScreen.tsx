import { XStack, YStack } from '@tamagui/stacks';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput } from 'react-native';

import { DetailScreen } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { Row, RowValue, Section } from '../components/List';
import { Body, Data, Label } from '../components/ui';
import {
  catalogoDeDados,
  comMedicao,
  EXPLICACAO_DA_ORIGEM,
  filtrar,
  NOME_DA_ORIGEM,
  porOrigem,
} from '../domain/dataCatalog';
import { frescor } from '../domain/ratings';
import { energyState } from '../domain/energy';
import { useBioAge } from '../hooks/useBioAge';
import { useHoraLocal } from '../hooks/useHoraLocal';
import * as api from '../services/api.service';
import { useBiometricStore } from '../store/biometric.store';
import { useHabitsStore } from '../store/habits.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Todos os dados, agrupados pela PROCEDÊNCIA.
 *
 * O agrupamento é o conteúdo, não a organização: o que separa "medido no seu
 * pulso" de "estimado a partir do que foi medido" é a diferença entre um
 * número que descreve você e um número que o app deduziu. Dado sensível com
 * procedência à vista também é o que a LGPD espera de quem guarda.
 */
export function AllDataScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const latest = useBiometricStore((s) => s.latest);
  const sleep = useBiometricStore((s) => s.sleep);
  const activity = useBiometricStore((s) => s.activity);
  const spo2History = useBiometricStore((s) => s.spo2History);
  const stressHistory = useBiometricStore((s) => s.stressHistory);
  const hoje = useHabitsStore((s) => s.today);
  const carregarHabitos = useHabitsStore((s) => s.hydrate);
  const { bio } = useBioAge();
  const hora = useHoraLocal();
  const [refeicoes, setRefeicoes] = useState<{ quantidade: number; em: number | null }>({
    quantidade: 0,
    em: null,
  });
  const [busca, setBusca] = useState('');

  useEffect(() => {
    void carregarHabitos();
  }, [carregarHabitos]);

  useEffect(() => {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    api
      .fetchMeals(1)
      .then((lista) => {
        const doDia = lista.filter((m) => new Date(m.at).getTime() >= inicio.getTime());
        setRefeicoes({
          quantidade: doDia.length,
          em: doDia.length ? Math.max(...doDia.map((m) => new Date(m.at).getTime())) : null,
        });
      })
      .catch(() => undefined);
  }, []);

  const agora = Date.now();
  const itens = useMemo(() => {
    const energia = latest ? energyState({ reading: latest, sleep, hour: hora }) : null;
    return catalogoDeDados({
      agora,
      batimento: { valor: latest?.heartRate ?? null, em: latest?.heartRateAt ?? latest?.recordedAt ?? null },
      hrv: { valor: latest?.hrvMs ?? null, em: latest?.hrvAt ?? latest?.recordedAt ?? null },
      /*
       Oxigenação e estresse vêm de medição AGENDADA, não contínua: usar o
       carimbo da leitura faria uma amostra de três horas atrás aparecer como
       "agora". Quem sabe a hora certa é a própria série.
      */
      oxigenio: {
        valor: latest?.spo2Pct ?? null,
        em: spo2History.at(-1)?.at ?? latest?.recordedAt ?? null,
      },
      estresse: {
        valor: latest?.stressScore ?? null,
        em: stressHistory.at(-1)?.at ?? latest?.recordedAt ?? null,
      },
      passos: { valor: activity.steps ?? null, em: latest?.recordedAt ?? null },
      pressao: {
        sistolica: latest?.bpSystolic ?? null,
        diastolica: latest?.bpDiastolic ?? null,
        em: latest?.recordedAt ?? null,
      },
      sono: {
        minutos: sleep?.totalMin ?? null,
        em: sleep ? new Date(sleep.date).getTime() : null,
        doIphone: sleep?.source === 'healthkit',
      },
      agua: { ml: hoje.waterMl || null, em: hoje.waterMl ? agora : null },
      refeicoes,
      energia: { valor: energia?.score ?? null, em: latest?.recordedAt ?? null },
      idadeBiologica: { valor: bio?.bioAge ?? null, em: bio ? agora : null },
    });
    // `agora` muda a cada render e não deve reprocessar a lista sozinho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest, sleep, activity, spo2History, stressHistory, hoje.waterMl, refeicoes, bio, hora]);

  const filtrados = filtrar(itens, busca);
  const grupos = porOrigem(filtrados);

  return (
    <DetailScreen title="Todos os dados">
      <XStack
        alignItems="center"
        gap="$sm"
        backgroundColor="$control"
        borderRadius={12}
        paddingHorizontal="$md"
        marginBottom="$lg"
      >
        <Icon name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar medida"
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, paddingVertical: 12, color: colors.text, fontSize: 16 }}
          accessibilityLabel="Buscar medida"
          autoCorrect={false}
        />
        {busca ? (
          <Pressable onPress={() => setBusca('')} hitSlop={8} accessibilityLabel="Limpar busca">
            <Icon name="x" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </XStack>

      {grupos.length === 0 ? (
        <Data>Nenhuma medida com esse nome.</Data>
      ) : (
        <YStack gap="$xl">
          {grupos.map((g) => (
            <YStack key={g.origem} gap="$sm">
              <Section label={NOME_DA_ORIGEM[g.origem]}>
                {g.itens.map((item, i) => (
                  <Pressable
                    key={item.chave}
                    onPress={() => item.rota && (navigation as any).push(item.rota as never)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.rotulo}: ${item.valor ?? 'sem medição'}`}
                    style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
                  >
                    <Row last={i === g.itens.length - 1}>
                      <YStack flex={1} gap={4}>
                        <Body color="$foreground">{item.rotulo}</Body>
                        <Data>
                          {item.valor == null
                            ? 'ainda sem medição'
                            : (frescor(item.em ?? undefined, agora) ?? 'sem data')}
                        </Data>
                      </YStack>
                      <RowValue>{item.valor ?? '–'}</RowValue>
                    </Row>
                  </Pressable>
                ))}
              </Section>
              <Data>{EXPLICACAO_DA_ORIGEM[g.origem]}</Data>
            </YStack>
          ))}
        </YStack>
      )}

      <YStack marginTop="$xxl" gap="$sm">
        <Label>fontes e acesso</Label>
        <Body>
          {comMedicao(itens)} de {itens.length} medidas têm valor guardado nesta conta. Só você as
          vê. Em Configurações você pode apagar a conta e tudo o que ela guarda.
        </Body>
      </YStack>
    </DetailScreen>
  );
}
