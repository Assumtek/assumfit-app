import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider, Theme } from '@tamagui/core';

import tamaguiConfig from './tamagui.config';
import { Navigation } from './src/navigation';
import { navigate } from './src/navigation/ref';
import { IntroScreen } from './src/screens/IntroScreen';
import { useAlertsStore } from './src/store/alerts.store';
import { useBiometricStore } from './src/store/biometric.store';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';

/**
 * A raiz existe só para montar o provedor de tema.
 *
 * Tudo abaixo dela lê o contexto — inclusive a intro. Se o provedor estivesse
 * no mesmo componente, o primeiro render aconteceria antes de o contexto
 * existir e o app quebraria já na abertura.
 */
export default function App() {
  return (
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  );
}

function Root() {
  const { colors, scheme } = useTheme();
  const listen = useBiometricStore((s) => s.listen);
  // A intro roda só no cold start. Como este estado vive na raiz e a raiz não
  // remonta, voltar do background não a reexibe — intro repetida vira atrito.
  const [introDone, setIntroDone] = useState(false);

  // Uma única assinatura do wearable para a árvore inteira.
  useEffect(() => listen(), [listen]);

  /*
   Toque em notificação leva à tela certa.

   As notificações carregam `data.route` em vez de URL: a rota nomeada passa
   pelo mesmo navegador que o resto do app, e um deep link mal montado aqui
   viraria tela branca justamente no momento em que a pessoa respondeu a um
   chamado nosso.
  */
  useEffect(() => {
    const registrar = (n: Notifications.Notification) => {
      const rota = n.request.content.data?.route;
      useAlertsStore.getState().registrar({
        id: n.request.identifier,
        titulo: n.request.content.title ?? 'Aviso',
        corpo: n.request.content.body ?? '',
        rota: typeof rota === 'string' ? rota : null,
      });
    };

    const aoTocar = Notifications.addNotificationResponseReceivedListener((resposta) => {
      registrar(resposta.notification);
      const rota = resposta.notification.request.content.data?.route;
      if (typeof rota === 'string') navigate(rota);
    });
    // Entrega com o app aberto não passa pelo toque — sem este listener, o
    // aviso visto de relance no banner nunca chegaria à tela de Avisos.
    const aoReceber = Notifications.addNotificationReceivedListener(registrar);
    // E o que foi entregue com o app FECHADO ainda está na central do sistema.
    void useAlertsStore.getState().sincronizarEntregues();

    return () => {
      aoTocar.remove();
      aoReceber.remove();
    };
  }, []);

  return (
    /*
     O Tamagui entra POR DENTRO do ThemeProvider do AssumFit, não no lugar dele.

     Quem resolve `system|light|dark` — e quem sabe a diferença entre a
     aparência do app e a do SISTEMA, que o vidro do iOS 26 precisa — continua
     sendo o nosso provedor. O `Theme` do Tamagui só recebe o esquema já
     resolvido. Inverter os dois faria o app perder o `systemScheme` e o painel
     lateral voltar a ficar escuro com o app no claro.
    */
    <TamaguiProvider config={tamaguiConfig} defaultTheme={scheme}>
      <Theme name={scheme}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ink }}>
          <SafeAreaProvider>
            <View style={{ flex: 1, backgroundColor: colors.ink }}>
              {/* Invertida em relação ao fundo: no tema claro os ícones do sistema
                  precisam ser escuros, ou a barra de status some. */}
              <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
              {/* A navegação monta por baixo desde o primeiro quadro: enquanto a
                  intro toca, a sessão é lida do Keychain e as fontes carregam. */}
              <Navigation />
              {!introDone ? <IntroScreen onFinish={() => setIntroDone(true)} /> : null}
            </View>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </Theme>
    </TamaguiProvider>
  );
}
