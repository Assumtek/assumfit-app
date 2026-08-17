import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogoType } from './Logo';
import { navigate } from '../navigation/ref';
import { Glass } from './Surface';
import { ThemeSwitch } from './ThemeSwitch';
import { Data, Label } from './ui';
import { useBiometricStore } from '../store/biometric.store';
import { useHabitsStore } from '../store/habits.store';
import { useUiStore } from '../store/ui.store';
import { useUserStore } from '../store/user.store';
import { useTheme } from '../theme/ThemeProvider';

const WIDTH = Math.min(Dimensions.get('window').width * 0.84, 360);


/**
 * Menu lateral. Overlay próprio em vez de `@react-navigation/drawer`,
 * que arrastaria o Reanimated junto. Sem ícone por linha: neste sistema o
 * ícone repetido em lista vira ruído — o nome e o valor bastam.
 */
export function Sidebar() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const open = useUiStore((s) => s.sidebarOpen);
  const close = useUiStore((s) => s.closeSidebar);
  const current = useUiStore((s) => s.currentRoute);

  const battery = useBiometricStore((s) => s.batteryPct);
  const connection = useBiometricStore((s) => s.connection);
  const latest = useBiometricStore((s) => s.latest);
  const sleep = useBiometricStore((s) => s.sleep);
  const user = useUserStore((s) => s.user);
  const profile = useUserStore((s) => s.profile);
  const avatarUri = useUserStore((s) => s.avatarUri);
  const water = useHabitsStore((s) => s.today.waterMl);
  const waterGoal = useHabitsStore((s) => s.goalMl);

  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 280,
      easing: Easing.bezier(0.22, 0.61, 0.36, 1),
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  /*
   O resumo é uma CONTAGEM, não uma avaliação: quantas grandezas a pulseira
   conseguiu medir hoje responde "vale a pena entrar?" e denuncia o aparelho
   que parou de medir.
  */
  const medidas = [
    latest?.hrvMs,
    latest?.heartRate,
    latest?.spo2Pct,
    latest?.stressScore,
    latest?.bpSystolic,
    latest?.steps,
    sleep?.score,
  ].filter((v) => v != null).length;
  const resumoDeSaude = medidas === 0 ? 'nada medido ainda' : `${medidas} de 7 medidas hoje`;

  /*
   As nove métricas saíram DAQUI e foram para a tela Saúde.

   Cada uma era uma entrada própria, com a avaliação ao lado. Lia bem e
   funcionava mal: para saber como o corpo estava hoje era preciso abrir e
   fechar o painel nove vezes, e as métricas nunca apareciam LADO A LADO — que
   é onde elas informam de verdade.

   O painel voltou a ser o que um menu deve ser: destinos, não dados.
  */

  const go = (route: string) => {
    close();
    setTimeout(() => navigate(route), 220);
  };

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: slide }]}>
        <Pressable
          style={{ flex: 1, backgroundColor: colors.scrim }}
          onPress={close}
          accessibilityLabel="Fechar menu"
        />
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            overflow: 'hidden',
            paddingHorizontal: 24,
            borderRightWidth: StyleSheet.hairlineWidth,
            borderRightColor: colors.hairlineStrong,
            width: WIDTH,
            paddingTop: insets.top + 32,
            paddingBottom: insets.bottom + 24,
            transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-WIDTH, 0] }) }],
          },
        ]}
      >
        {/* O vidro continua aqui: o painel FLUTUA sobre o conteúdo, e é
            exatamente o caso para o qual a camada de vidro existe. */}
        <Glass variant="regular" style={StyleSheet.absoluteFill} />
        <YStack marginBottom="$xl">
          <LogoType height={17} />
        </YStack>

        {/* Identidade da conta no topo do painel — é onde se procura por ela em
            qualquer app com menu lateral, e evita esconder o perfil no fim. */}
        <Pressable
          style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
          onPress={() => go('Profile')}
          accessibilityRole="button"
        >
          <XStack
            alignItems="center"
            gap="$md"
            paddingBottom="$lg"
            borderBottomWidth={1}
            borderBottomColor="$borderStrong"
          >
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={{ width: 34, height: 34, borderRadius: 17 }}
                accessibilityIgnoresInvertColors
              />
            ) : (
              // Sem foto, a inicial em círculo de contorno — a foto entra pelo Perfil.
              <YStack
                width={34}
                height={34}
                borderRadius={17}
                borderWidth={1}
                borderColor="$borderStrong"
                alignItems="center"
                justifyContent="center"
              >
                <Text fontSize={14} color="$mutedForeground">
                  {user.name.trim().charAt(0).toUpperCase()}
                </Text>
              </YStack>
            )}
            <YStack flex={1} gap={2}>
              <Text fontSize={15} letterSpacing={-0.2} color="$foreground" numberOfLines={1}>
                {user.name}
              </Text>
              <Data numberOfLines={1}>{profile?.email ?? 'perfil e assinatura'}</Data>
            </YStack>
          </XStack>
        </Pressable>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <SectionLabel>Hoje</SectionLabel>
          <Entry name="Visão geral" detail="início" active={current === 'Main'} onPress={() => go('Main')} />
          <Entry
            name="Saúde"
            detail={resumoDeSaude}
            active={current === 'Health'}
            onPress={() => go('Health')}
          />
          {/*
            O ciclo só existe para quem tem sexo biológico feminino no cadastro.

            O sexo já está lá porque as faixas de referência de HRV e FC diferem
            por ele — não é campo novo pedido para isto. E o portão é DUPLO: a
            rota do servidor recusa sozinha (403), porque esconder o item do
            menu não impede ninguém de chamar a API direto.
          */}
          {user.sex === 'f' ? (
            <Entry
              name="Ciclo"
              detail="fase e previsão"
              active={current === 'Cycle'}
              onPress={() => go('Cycle')}
            />
          ) : null}

          {/*
            Esporte, refeições e água: o que o reposicionamento de ago/2026
            deixou na rotina. Sessão de foco e agenda de terceiros SAÍRAM do
            produto (ago/2026) — o app é de esporte, bem-estar e recuperação,
            e produtividade não era o assunto nem no menu.
          */}
          <SectionLabel>Rotina</SectionLabel>
          <Entry
            name="Esporte"
            detail="musculação, corrida e mais"
            active={current === 'Sport'}
            onPress={() => go('Sport')}
          />
          <Entry
            name="Refeições"
            detail="calorias por foto"
            active={current === 'Meals'}
            onPress={() => go('Meals')}
          />
          <Entry
            name="Água"
            detail={`${(water / 1000).toFixed(1).replace('.', ',')} L de ${(waterGoal / 1000).toFixed(1).replace('.', ',')} L`}
            active={current === 'Habits'}
            onPress={() => go('Habits')}
          />

          <SectionLabel>Dispositivo</SectionLabel>
          <Entry
            name="AssumFit Watch"
            detail={
              connection === 'connected'
                ? battery != null
                  ? `conectado · bateria ${battery}%`
                  : 'conectado'
                : 'desconectado'
            }
            active={current === 'Device'}
            onPress={() => go('Device')}
          />

          <SectionLabel>Aparência</SectionLabel>
          <ThemeSwitch />

          <Entry
            name="Configurações"
            detail="tema, privacidade, conta"
            active={current === 'Settings'}
            onPress={() => go('Settings')}
            spaced
          />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

/** Rótulo de grupo. Carrega o acento porque separa seções, não dado. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label marginTop="$xl" marginBottom="$md" color="$primary" opacity={0.75}>
      {children}
    </Label>
  );
}

function Entry({
  name,
  detail,
  active,
  onPress,
  spaced,
}: {
  name: string;
  detail: string;
  active: boolean;
  onPress: () => void;
  spaced?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
      onPress={onPress}
      accessibilityRole="button"
    >
      <XStack
        alignItems="center"
        paddingVertical="$lg"
        marginTop={spaced ? 24 : 0}
        borderBottomWidth={spaced ? 0 : 1}
        borderBottomColor="$border"
      >
        {/* Trilho à esquerda marca a rota atual. Um item de menu selecionado
            por fundo cheio brigaria com o vidro do painel. */}
        <YStack
          width={2}
          height={22}
          borderRadius={1}
          marginRight="$lg"
          backgroundColor={active ? '$primary' : 'transparent'}
        />
        <YStack flex={1} gap="$xs">
          <Text
            fontSize={15}
            letterSpacing={-0.2}
            color={active ? '$foreground' : '$mutedForeground'}
          >
            {name}
          </Text>
          <Data>{detail}</Data>
        </YStack>
      </XStack>
    </Pressable>
  );
}
