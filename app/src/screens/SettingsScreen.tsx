import { useNavigation } from '@react-navigation/native';
import { styled } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import { mensagemDaFalha } from '../domain/apiErrors';
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Switch } from 'react-native';

import { Row, Section, RowLabel, RowValue, ActionRow } from '../components/List';
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
import { useUserStore } from '../store/user.store';
import { useLocalReminderStore } from '../services/local-reminder';
import { usePersonalizacaoStore } from '../store/personalizacao.store';
import { formatMinutes, parseMinutes } from '../domain/sleepCycles';
import { useTheme } from '../theme/ThemeProvider';

const APP_VERSION = '1.0.0';

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
  const { colors, mode, autoHoras, setAutoHoras } = useTheme();
  const personalizadas = usePersonalizacaoStore((s) => s.ligado);
  const aprendido = usePersonalizacaoStore((s) => s.aprendido);
  const ligarPersonalizadas = usePersonalizacaoStore((s) => s.ligar);
  const carregarPersonalizadas = usePersonalizacaoStore((s) => s.carregar);
  const porLocal = useLocalReminderStore((s) => s.ligado);
  const lugares = useLocalReminderStore((s) => s.lugares);
  const ligarPorLocal = useLocalReminderStore((s) => s.ligar);
  const carregarLocal = useLocalReminderStore((s) => s.carregar);
  useEffect(() => {
    void carregarPersonalizadas();
    void carregarLocal();
  }, [carregarPersonalizadas, carregarLocal]);
  const navigation = useNavigation();
  const profile = useUserStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const connection = useBiometricStore((s) => s.connection);
  const latest = useBiometricStore((s) => s.latest);
  const sleep = useBiometricStore((s) => s.sleep);
  const connectHealth = useBiometricStore((s) => s.connectHealth);
  const [buscandoSono, setBuscandoSono] = React.useState(false);
  const [busy, setBusy] = useState(false);


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
            } catch (err) {
              Alert.alert('Não foi possível excluir', mensagemDaFalha(err, 'A exclusão'));
            } finally {
              setBusy(false);
            }
          },
        },
      ]);

  return (
    <DetailScreen title="Configurações">
      <Section label="Aparência" divider={false}>
        <ThemeSwitch />
        {mode === 'auto' ? (
          <YStack marginTop="$md">
            <ActionRow
              title="Claro a partir das"
              subtitle={formatMinutes(autoHoras.claroDesde)}
              right="none"
              onPress={() => pedirHora('Claro a partir das', autoHoras.claroDesde, (m) => setAutoHoras({ ...autoHoras, claroDesde: m }))}
            />
            <ActionRow
              title="Escuro a partir das"
              subtitle={formatMinutes(autoHoras.escuroDesde)}
              right="none"
              onPress={() => pedirHora('Escuro a partir das', autoHoras.escuroDesde, (m) => setAutoHoras({ ...autoHoras, escuroDesde: m }))}
              last
            />
          </YStack>
        ) : null}
        <Data marginTop="$md">
          {mode === 'auto'
            ? 'Claro de dia e escuro à noite, nos horários acima, independente do aparelho.'
            : 'Em “Sistema”, o app acompanha o modo do aparelho, inclusive o agendamento noturno.'}
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
        <LinkRow label="Gerenciar dispositivo" onPress={() => (navigation as any).push('Device' as never)} />
        {/* Só no iOS: HealthKit não existe no Android, que usa Health Connect —
            outra API, outras permissões, outros tipos de registro. */}
        {isHealthAvailable() ? (
          /*
           A busca leva segundos e a linha não dizia nada enquanto corria —
           tocar e não ver reação é indistinguível de toque que não pegou, e a
           pessoa toca de novo, disparando outra busca por cima da primeira.
          */
          <LinkRow
            label={
              buscandoSono
                ? 'Buscando…'
                : sleep
                  ? 'Atualizar sono do app Saúde'
                  : 'Conectar app Saúde'
            }
            onPress={() => {
              if (buscandoSono) return;
              setBuscandoSono(true);
              void connectHealth().finally(() => setBuscandoSono(false));
            }}
          />
        ) : null}
        {/* Só onde há GATT para inspecionar: é ferramenta de mapeamento de
            UUID, não tem o que fazer na mão de quem assina — e com o SDK do
            fabricante não há o que mapear, ele já fala o protocolo. */}
        {supportsGattInspection ? (
          <LinkRow label="Diagnóstico GATT" onPress={() => (navigation as any).push('Gatt' as never)} />
        ) : null}
      </Section>

      {/*
        Os dois são OPCIONAIS e dizem o que fazem: um aprende horários do uso,
        o outro pede localização "sempre" — que é mais do que a sessão de
        esporte pede, e por isso só é solicitada quando a pessoa liga.
      */}
      <Section label="Notificações">
        <Row>
          <YStack flex={1} gap={4}>
            <RowLabel>Notificações personalizadas</RowLabel>
            <Data>
              {personalizadas
                ? [
                    aprendido.refeicoes.length ? `refeições às ${aprendido.refeicoes.map((h) => h.replace(':00', 'h').replace(':', 'h')).join(', ')}` : null,
                    aprendido.treino ? `treino ~${aprendido.treino.replace(':', 'h')}` : null,
                    aprendido.cama ? `cama ${aprendido.cama.replace(':', 'h')}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'aprendendo com o seu uso…'
                : 'quanto mais você usa, mais ele aprende'}
            </Data>
          </YStack>
          <Switch value={personalizadas} onValueChange={(v) => void ligarPersonalizadas(v)} trackColor={{ true: colors.accent }} />
        </Row>
        <Row last>
          <YStack flex={1} gap={4}>
            <RowLabel>Lembrar ao chegar no lugar do treino</RowLabel>
            <Data>
              {porLocal
                ? lugares.length
                  ? `${lugares.length} ${lugares.length === 1 ? 'lugar reconhecido' : 'lugares reconhecidos'}`
                  : 'ainda aprendendo os lugares das suas sessões'
                : 'usa a localização em segundo plano'}
            </Data>
          </YStack>
          <Switch
            value={porLocal}
            onValueChange={(v) => {
              void ligarPorLocal(v).then((ok) => {
                if (v && !ok) Alert.alert('Sem permissão', 'Para lembrar ao chegar, o app precisa de localização "Sempre" nos Ajustes do iPhone.');
              });
            }}
            trackColor={{ true: colors.accent }}
          />
        </Row>
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

        <LinkRow label="Ver consentimentos" onPress={() => (navigation as any).push('Profile' as never)} />
        <LinkRow label="Permissões do sistema" onPress={() => void Linking.openSettings()} />
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
  last = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  arrow?: boolean;
  destructive?: boolean;
  last?: boolean;
}) {
  return (
    <ActionRow
      title={label}
      onPress={onPress}
      disabled={disabled}
      right={arrow ? 'chevron' : 'none'}
      destructive={destructive}
      last={last}
    />
  );
}

/** Pede uma hora (HH:MM) num diálogo; inválida é ignorada, sem alerta extra. */
function pedirHora(titulo: string, atual: number, onOk: (minutos: number) => void) {
  Alert.prompt(titulo, 'Hora no formato 07:00', (texto) => {
    const m = parseMinutes(texto ?? '');
    if (m != null) onOk(m);
  }, 'plain-text', formatMinutes(atual));
}
