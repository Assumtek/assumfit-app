import { useNavigation } from '@react-navigation/native';
import { styled, Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable } from 'react-native';

import { Row, Section } from '../components/Card';
import { Checkbox } from '../components/Field';
import { DetailScreen } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { supportsLiquidGlass } from '../components/Surface';
import { Body, Data } from '../components/ui';
import { CONSENT_VERSION } from '../services/api.service';
import { supportsGattInspection, usingRealDevice } from '../services/ble';
import { isHealthAvailable } from '../services/health.service';
import { usingSecureStorage } from '../services/tokenStorage';
import { useAuthStore } from '../store/auth.store';
import { useBiometricStore } from '../store/biometric.store';
import { useCalendarStore } from '../store/calendar.store';
import { useUserStore } from '../store/user.store';
import { useTheme } from '../theme/ThemeProvider';

const APP_VERSION = '1.0.0';

const PROVIDER_LABEL: Record<string, string> = {
  google: 'Google Agenda',
  microsoft: 'Outlook',
};

/**
 * Configurações.
 *
 * Três blocos, nesta ordem: aparência, privacidade, conta. A ordem não é
 * arbitrária — o que é reversível e inofensivo vem primeiro, o que é
 * irreversível vem por último e sem atalho. "Excluir conta" pede confirmação
 * explícita porque apaga o histórico biométrico de verdade, e não existe
 * desfazer.
 */
export function SettingsScreen() {
  const navigation = useNavigation();
  const profile = useUserStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const connection = useBiometricStore((s) => s.connection);
  const latest = useBiometricStore((s) => s.latest);
  const sleep = useBiometricStore((s) => s.sleep);
  const connectHealth = useBiometricStore((s) => s.connectHealth);
  const [busy, setBusy] = useState(false);

  const connections = useCalendarStore((s) => s.connections);
  const consented = useCalendarStore((s) => s.consented);
  const loadCalendar = useCalendarStore((s) => s.load);
  const grantConsent = useCalendarStore((s) => s.grantConsent);
  const connect = useCalendarStore((s) => s.connect);
  const disconnect = useCalendarStore((s) => s.disconnect);

  // Recarrega ao voltar do navegador: o deep link do OAuth aterrissa aqui.
  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  const confirmSignOut = () =>
    Alert.alert('Sair da conta', 'Você precisará entrar de novo neste aparelho.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void signOut() },
    ]);

  const confirmDelete = () =>
    Alert.alert(
      'Excluir conta',
      'Todo o seu histórico biométrico é apagado permanentemente dos nossos servidores. Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteAccount();
            } catch {
              Alert.alert('Não foi possível excluir', 'Confira a conexão e tente de novo.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  return (
    <DetailScreen title="Configurações">
      <Section label="Aparência" divider={false}>
        <ThemeSwitch />
        <Data marginTop="$md">
          Em “Sistema”, o app acompanha o modo do aparelho — inclusive o agendamento noturno.
        </Data>
      </Section>

      <Section label="Aparelho">
        <Row>
          <RowLabel>Wearable</RowLabel>
          <RowValue>{connection === 'connected' ? 'Conectado' : 'Desconectado'}</RowValue>
        </Row>
        <Row>
          <RowLabel>Origem dos dados</RowLabel>
          {/* A fonte vem do SERVIÇO em uso, não da última leitura: um app que
              acabou de trocar para o real ainda tem leitura antiga em memória,
              e a tela diria "simulado" com o relógio no pulso. */}
          <RowValue>{usingRealDevice ? 'AssumFit Watch' : 'Simulado'}</RowValue>
        </Row>
        <Row>
          <RowLabel>Sono</RowLabel>
          {/* A pulseira não mede sono. Dizer de onde ele vem evita a pergunta
              "por que não aparece" e explica o que a conexão adiciona. */}
          <RowValue>{sleep ? 'App Saúde' : 'Sem registro'}</RowValue>
        </Row>
        <Row last>
          <RowLabel>Efeito de vidro</RowLabel>
          <RowValue>{supportsLiquidGlass ? 'Nativo' : 'Alternativo'}</RowValue>
        </Row>
        <LinkRow label="Gerenciar dispositivo" onPress={() => navigation.navigate('Device' as never)} />
        {/* Só no iOS: HealthKit não existe no Android, que usa Health Connect —
            outra API, outras permissões, outros tipos de registro. */}
        {isHealthAvailable() ? (
          <LinkRow
            label={sleep ? 'Atualizar sono do app Saúde' : 'Conectar app Saúde'}
            onPress={() => void connectHealth()}
          />
        ) : null}
        {/* Só onde há GATT para inspecionar: é ferramenta de mapeamento de
            UUID, não tem o que fazer na mão de quem assina — e com o SDK do
            fabricante não há o que mapear, ele já fala o protocolo. */}
        {supportsGattInspection ? (
          <LinkRow label="Diagnóstico GATT" onPress={() => navigation.navigate('Gatt' as never)} />
        ) : null}
      </Section>

      <Section label="Privacidade e dados">
        <Row>
          <RowLabel>Termo aceito</RowLabel>
          <RowValue>{profile?.consents[0]?.version ?? CONSENT_VERSION}</RowValue>
        </Row>
        <Row>
          <RowLabel>Consentimentos ativos</RowLabel>
          <RowValue>{profile?.consents.length ?? 0}</RowValue>
        </Row>
        <Row last>
          <RowLabel>Credenciais</RowLabel>
          {/* Se isto disser "memória", o dev client foi compilado sem o
              expo-secure-store. Em produção o app nem sobe nessa condição. */}
          <RowValue>{usingSecureStorage ? 'Keychain do sistema' : 'Memória (dev)'}</RowValue>
        </Row>

        <LinkRow label="Ver consentimentos" onPress={() => navigation.navigate('Profile' as never)} />
        <LinkRow label="Permissões do sistema" onPress={() => void Linking.openSettings()} />
      </Section>

      <Section label="Agenda">
        {connections?.available.length ? (
          <>
            <Checkbox
              checked={consented}
              onToggle={() => void grantConsent(!consented)}
              title="Ler minha agenda"
              body="Permite cruzar seus compromissos com a curva de energia do dia. Os eventos não são guardados: são buscados na hora e descartados. Quem participa das reuniões nunca é enviado — só quantas pessoas."
            />

            {consented
              ? connections.available.map((provider) => {
                  const account = connections.connected.find((c) => c.provider === provider);
                  return (
                    <Row key={provider} last={provider === connections.available.at(-1)}>
                      <YStack flex={1} gap="$xs">
                        <RowLabel>{PROVIDER_LABEL[provider]}</RowLabel>
                        {account ? <Data>{account.accountEmail}</Data> : null}
                      </YStack>
                      <Pressable
                        onPress={() =>
                          void (account ? disconnect(provider) : connect(provider)).catch(() =>
                            Alert.alert('Não foi possível', 'Confira a conexão e tente de novo.'),
                          )
                        }
                        hitSlop={8}
                        accessibilityRole="button"
                      >
                        <Text fontSize={15} color={account ? '$destructive' : '$foreground'}>
                          {account ? 'Desconectar' : 'Conectar'}
                        </Text>
                      </Pressable>
                    </Row>
                  );
                })
              : null}
          </>
        ) : (
          <Body>
            A integração com Google Agenda e Outlook não está configurada neste ambiente.
          </Body>
        )}
      </Section>


      <Section label="Conta">
        <LinkRow label="Sair da conta" onPress={confirmSignOut} arrow={false} />
        <LinkRow
          label={busy ? 'Excluindo…' : 'Excluir conta e apagar dados'}
          onPress={confirmDelete}
          disabled={busy}
          arrow={false}
          destructive
        />
      </Section>

      <Data marginTop="$xxl" textAlign="center">AssumFit {APP_VERSION}</Data>
    </DetailScreen>
  );
}

/**
 * O par rótulo/valor de uma linha.
 *
 * `flex: 1` no rótulo empurra o valor para a direita: `Row` só alinha na
 * vertical, quem distribui é o conteúdo.
 */
const RowLabel = styled(Body, { flex: 1 });
const RowValue = styled(Data, { fontSize: 13, color: '$foreground' });

/**
 * Ação de navegação dentro de uma seção.
 *
 * Vira componente porque esta tela tem sete delas, e sete cópias do mesmo
 * `Pressable` com hairline no topo é onde uma acaba divergindo das outras.
 */
function LinkRow({
  label,
  onPress,
  disabled,
  arrow = true,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  arrow?: boolean;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingVertical="$lg"
        borderTopWidth={1}
        borderTopColor="$border"
      >
        <Text fontSize={15} color={destructive ? '$destructive' : '$foreground'}>
          {label}
        </Text>
        {arrow ? <Icon name="arrowRight" size={16} color={colors.textMuted} /> : null}
      </XStack>
    </Pressable>
  );
}
