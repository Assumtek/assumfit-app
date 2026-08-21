import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Sidebar } from '../components/Sidebar';
import { ActivityScreen } from '../screens/ActivityScreen';
import { BioAgeScreen } from '../screens/BioAgeScreen';
import { ConnectScreen } from '../screens/ConnectScreen';
import { DeviceScreen } from '../screens/DeviceScreen';
import { GattScreen } from '../screens/GattScreen';
import { HabitsScreen } from '../screens/HabitsScreen';
import { MealsScreen } from '../screens/MealsScreen';
import { SportScreen } from '../screens/SportScreen';
import { WaterReminderScreen } from '../screens/WaterReminderScreen';
import { MealReminderScreen } from '../screens/MealReminderScreen';
import { MetricDayScreen } from '../screens/MetricDayScreen';
import { CycleScreen } from '../screens/CycleScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { BodyBatteryScreen } from '../screens/BodyBatteryScreen';
import { BreathingScreen } from '../screens/BreathingScreen';
import { HelpScreen } from '../screens/HelpScreen';
import { HealthScreen } from '../screens/HealthScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { HeartRateScreen } from '../screens/HeartRateScreen';
import { HrvScreen } from '../screens/HrvScreen';
import { OxygenScreen } from '../screens/OxygenScreen';
import { PressureScreen } from '../screens/PressureScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { SleepScreen } from '../screens/SleepScreen';
import { StressScreen } from '../screens/StressScreen';
import { AnamnesisScreen } from '../screens/workout/AnamnesisScreen';
import { CheckinScreen } from '../screens/workout/CheckinScreen';
import { GeneratingScreen } from '../screens/workout/GeneratingScreen';
import { ChecklistScreen } from '../screens/workout/ChecklistScreen';
import { ExecutionDetailScreen } from '../screens/workout/ExecutionDetailScreen';
import { AnamnesisConversationScreen } from '../screens/workout/AnamnesisConversationScreen';
import { AnamnesisHistoryScreen } from '../screens/workout/AnamnesisHistoryScreen';
import { AnamnesisVersionScreen } from '../screens/workout/AnamnesisVersionScreen';
import { PersonalScreen } from '../screens/workout/PersonalScreen';
import { ProgressScreen } from '../screens/workout/ProgressScreen';
import { ProjectScreen } from '../screens/workout/ProjectScreen';
import { WorkoutShareScreen } from '../screens/workout/WorkoutShareScreen';
import { PlanScreen } from '../screens/workout/PlanScreen';
import { WorkoutHistoryScreen } from '../screens/workout/WorkoutHistoryScreen';
import { TrainingFinishedScreen } from '../screens/workout/TrainingFinishedScreen';
import { TrainingScreen } from '../screens/workout/TrainingScreen';
import { useAuthStore } from '../store/auth.store';
import { useBiometricStore } from '../store/biometric.store';
import { useUiStore } from '../store/ui.store';
import { navigationRef } from './ref';
import type { Palette } from '../theme/palette';
import { type Scheme, useTheme } from '../theme/ThemeProvider';

const Stack = createNativeStackNavigator();

/**
 * O tema da navegação existe para pintar o que NÃO é nosso: o fundo que aparece
 * durante a transição entre telas. Sem ele, o react-navigation usa o próprio
 * branco/preto padrão e o push de uma tela pisca uma faixa fora da paleta.
 */
function navigationTheme(scheme: Scheme, colors: Palette) {
  const base = scheme === 'light' ? DefaultTheme : DarkTheme;
  return {
    ...base,
    colors: { ...base.colors, background: colors.ink, card: colors.ink, border: colors.hairline },
  };
}

/**
 * Deep links. Servem para abrir a tela certa a partir de uma notificação
 * ("hora de beber água" → Hábitos) e, no desenvolvimento, para pular direto
 * para qualquer tela: `xcrun simctl openurl booted assumfit://bioage`.
 */
const linking = {
  prefixes: ['assumfit://'],
  config: {
    screens: {
      SignIn: 'entrar',
      SignUp: 'criar-conta',
      Connect: 'connect',
      Main: 'home',
      Health: 'saude',
      Sport: 'esporte',
      Meals: 'refeicoes',
      Battery: 'bateria',
      Breathing: 'respirar',
      Alerts: 'avisos',
      Help: 'ajuda',
      Cycle: 'ciclo',
      History: 'historico',
      Hrv: 'hrv',
      HeartRate: 'coracao',
      Sleep: 'sono',
      Oxygen: 'oxigenio',
      Pressure: 'pressao',
      Stress: 'estresse',
      Activity: 'passos',
      Habits: 'habitos',
      WaterReminder: 'lembrete-agua',
      MealReminder: 'lembrete-refeicoes',
      MetricDay: 'historico-dia',
      Onboarding: 'perfil-rotina',
      Profile: 'perfil',
      Settings: 'configuracoes',
      BioAge: 'bioage',
      Device: 'dispositivo',
      Gatt: 'gatt',
      Plan: 'treinos',
      WorkoutHistory: 'treino-historico',
      Checklist: 'checklist-treino',
      WorkoutShare: 'compartilhar-treino',
      ExecutionDetail: 'treino-detalhe',
      Personal: 'personal',
      AnamnesisHistory: 'anamnese-historico',
      AnamnesisVersion: 'anamnese-versao',
      Progress: 'progresso',
      Project: 'meu-projeto',
      Checkin: 'checkin',
      Training: 'treino',
      TrainingFinished: 'treino-fim',
      Anamnesis: 'anamnese',
      AnamnesisForm: 'anamnese-formulario',
      Generating: 'gerando',
    },
  },
};

/**
 * Navegação por stack único mais menu lateral. A tab bar foi experimentada em
 * jul/2026 e REVERTIDA por decisão da fundadora — o menu lateral é a
 * navegação do produto, com o sanduíche reforçado no cabeçalho. O índice
 * completo vive na sidebar.
 */
export function Navigation() {
  const { colors, scheme } = useTheme();
  const theme = useMemo(() => navigationTheme(scheme, colors), [scheme, colors]);
  const setCurrentRoute = useUiStore((s) => s.setCurrentRoute);
  const syncRoute = () => setCurrentRoute(navigationRef.getCurrentRoute()?.name ?? null);
  const status = useAuthStore((s) => s.status);
  const restore = useAuthStore((s) => s.restore);
  const pairedDeviceId = useBiometricStore((s) => s.pairedDeviceId);
  const bandSkipped = useBiometricStore((s) => s.bandSkipped);

  // Recupera a sessão do Keychain antes de decidir qual pilha montar.
  useEffect(() => {
    void restore();
  }, [restore]);

  /*
   Espera o DISCO responder antes de montar a pilha.

   `pairedDeviceId` tem três posições, e a do meio é o motivo desta guarda:
   `undefined` é "ainda não sei". Montar a pilha nesse instante escolheria
   `Connect` como rota inicial para quem já pareou, e `initialRouteName` só é
   lido uma vez — a tela erraria e não teria como se corrigir depois.
  */
  if (status === 'unknown' || (status === 'signedIn' && pairedDeviceId === undefined)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={theme}
      linking={linking}
      onReady={syncRoute}
      onStateChange={syncRoute}
    >
      {/*
        Quem já pareou abre na home, não na tela de conectar.

        Pareamento é decisão tomada uma vez; repetir a pergunta a cada abertura
        trata o passo como reversível a cada uso. A reconexão acontece em
        segundo plano e o cabeçalho da home comunica o estado — quem está com a
        pulseira longe vê "Sem conexão" e o resto do app continua servindo, com
        o que está em disco.
      */}
      <Stack.Navigator
        /*
         `initialRouteName` só quando há sessão.

         Deslogado, a pilha tem apenas `SignIn` e `SignUp` — apontar para `Main`
         ali derrubava a tela com "Couldn't find a screen named 'Main'". O
         `undefined` faz o React Navigation usar a primeira tela declarada, que
         é o comportamento certo nos dois ramos.
        */
        initialRouteName={
          status === 'signedIn' ? (pairedDeviceId || bandSkipped ? 'Main' : 'Connect') : undefined
        }
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink } }}
      >
        {status === 'signedOut' ? (
          <>
            <Stack.Screen name="SignIn" component={SignInScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
          </>
        ) : (
          <>
        <Stack.Screen name="Connect" component={ConnectScreen} />
        <Stack.Screen name="Main" component={HomeScreen} />
        <Stack.Screen name="Health" component={HealthScreen} />
        <Stack.Screen name="Battery" component={BodyBatteryScreen} />
        <Stack.Screen name="Breathing" component={BreathingScreen} />
        <Stack.Screen name="Alerts" component={AlertsScreen} />
        <Stack.Screen name="Help" component={HelpScreen} />
        <Stack.Screen name="Hrv" component={HrvScreen} />
        <Stack.Screen name="HeartRate" component={HeartRateScreen} />
        <Stack.Screen name="History" component={HistoryScreen} />
        <Stack.Screen name="Cycle" component={CycleScreen} />
        <Stack.Screen name="Sleep" component={SleepScreen} />
        <Stack.Screen name="Oxygen" component={OxygenScreen} />
        <Stack.Screen name="Pressure" component={PressureScreen} />
        <Stack.Screen name="Stress" component={StressScreen} />
        <Stack.Screen name="Activity" component={ActivityScreen} />
        <Stack.Screen name="Habits" component={HabitsScreen} />
        <Stack.Screen name="WaterReminder" component={WaterReminderScreen} />
        <Stack.Screen name="MealReminder" component={MealReminderScreen} />
        <Stack.Screen name="MetricDay" component={MetricDayScreen} />
        <Stack.Screen name="Meals" component={MealsScreen} />
        <Stack.Screen name="Sport" component={SportScreen} />
        <Stack.Screen name="BioAge" component={BioAgeScreen} />
        <Stack.Screen name="Device" component={DeviceScreen} />
        <Stack.Screen name="Gatt" component={GattScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Plan" component={PlanScreen} />
        <Stack.Screen name="WorkoutHistory" component={WorkoutHistoryScreen} />
        <Stack.Screen name="Checklist" component={ChecklistScreen} />
        <Stack.Screen name="WorkoutShare" component={WorkoutShareScreen} />
        <Stack.Screen name="ExecutionDetail" component={ExecutionDetailScreen} />
        <Stack.Screen name="Personal" component={PersonalScreen} />
        <Stack.Screen name="Progress" component={ProgressScreen} />
        <Stack.Screen name="Project" component={ProjectScreen} />
        <Stack.Screen name="AnamnesisHistory" component={AnamnesisHistoryScreen} />
        <Stack.Screen name="AnamnesisVersion" component={AnamnesisVersionScreen} />
        <Stack.Screen name="Checkin" component={CheckinScreen} />
        <Stack.Screen name="Training" component={TrainingScreen} />
        <Stack.Screen name="TrainingFinished" component={TrainingFinishedScreen} />
        <Stack.Screen name="Anamnesis" component={AnamnesisConversationScreen} />
        {/*
          `AnamnesisForm` é o formulário antigo, mantido acessível por deep link
          enquanto a conversa não tiver rodado em campo. `Anamnesis` — a rota que
          todo mundo navega — já é a conversacional.
        */}
        <Stack.Screen name="AnamnesisForm" component={AnamnesisScreen} />
        <Stack.Screen name="Generating" component={GeneratingScreen} />
          </>
        )}
      </Stack.Navigator>
      {/* Overlay: fica acima do navigator e enxerga a rota atual. */}
      <Sidebar />
    </NavigationContainer>
  );
}
