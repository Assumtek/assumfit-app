import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { Note, Row, Section } from '../components/List';
import { DetailScreen } from '../components/DetailScreen';
import { Icon, type IconName } from '../components/Icon';
import { PermissionGate } from '../components/PermissionGate';
import { Body, Card, Data, Label, SectionTitle } from '../components/ui';
import { notificacoesBloqueadas } from '../services/notifications.service';
import { useAlertsStore } from '../store/alerts.store';
import { useBiometricStore } from '../store/biometric.store';
import { useLifestyleStore } from '../store/lifestyle.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Avisos — o que precisa da sua atenção agora, e o que já chamamos você para ver.
 *
 * Duas metades com naturezas diferentes:
 *
 * - **Condições** verificáveis no estado atual: pulseira desconectada, dia sem
 *   medição, perfil incompleto. Cada uma tem um DESTINO — aviso sem ação é
 *   ruído, e não pertence a esta tela.
 * - **Notificações locais já entregues** (água, treino, bom-dia, atenção,
 *   respiração). A da tela de bloqueio some com um gesto; aqui fica o registro
 *   de qual era e para onde levava.
 *
 * A regra que mantém tudo curto: nada aqui carrega número de saúde. "Seu HRV
 * caiu" não é aviso, é leitura de métrica, e mora na tela da métrica — alarme
 * clínico é exatamente o que este produto não faz.
 */

type Aviso = {
  icone: IconName;
  titulo: string;
  corpo: string;
  acao: string;
  rota: string;
};

export function AlertsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();

  const connection = useBiometricStore((s) => s.connection);
  const latest = useBiometricStore((s) => s.latest);
  const sleep = useBiometricStore((s) => s.sleep);
  const batteryPct = useBiometricStore((s) => s.batteryPct);
  const completedAt = useLifestyleStore((s) => s.completedAt);

  const recebidas = useAlertsStore((s) => s.feed);
  const sincronizar = useAlertsStore((s) => s.sincronizarEntregues);

  // O que chegou na central com o app fechado entra no feed ao abrir a tela.
  useEffect(() => {
    void sincronizar();
  }, [sincronizar]);

  /*
   Consultado a cada montagem, e não uma vez: quem sai daqui para os Ajustes,
   autoriza e volta precisa encontrar a tela já corrigida.
  */
  const [notificacoesNegadas, setNotificacoesNegadas] = useState(false);
  useEffect(() => {
    void notificacoesBloqueadas().then(setNotificacoesNegadas);
  }, []);

  const avisos: Aviso[] = [];

  if (connection !== 'connected') {
    avisos.push({
      icone: 'bluetooth',
      titulo: 'Pulseira desconectada',
      corpo: 'Sem conexão não há medição nova. O que já foi medido continua aqui.',
      acao: 'Ver dispositivo',
      rota: 'Device',
    });
  }

  // 20% é onde a pulseira ainda dura a noite — avisar em 5% seria avisar tarde
  // demais para quem quer medir o sono.
  if (batteryPct != null && batteryPct <= 20) {
    avisos.push({
      icone: 'flame',
      titulo: `Bateria da pulseira em ${batteryPct}%`,
      corpo: 'Carregue antes de dormir para não perder a medição da noite.',
      acao: 'Ver dispositivo',
      rota: 'Device',
    });
  }

  if (!latest) {
    avisos.push({
      icone: 'pulse',
      titulo: 'Nenhuma medição ainda',
      corpo: 'Use a pulseira ao longo do dia. As telas se preenchem sozinhas.',
      acao: 'Ver saúde',
      rota: 'Health',
    });
  }

  if (!sleep) {
    avisos.push({
      icone: 'moon',
      titulo: 'Nenhuma noite registrada',
      corpo: 'O sono é a base da bateria do corpo e da idade biológica. Durma com a pulseira no pulso.',
      acao: 'Ver sono',
      rota: 'Sleep',
    });
  }

  if (completedAt === null) {
    avisos.push({
      icone: 'calendar',
      titulo: 'Perfil de rotina incompleto',
      corpo: 'Turno, postura e dias de treino mudam as sugestões da tela inicial.',
      acao: 'Responder',
      rota: 'Onboarding',
    });
  }

  return (
    <DetailScreen title="Avisos">
      {/*
        Esta é a tela em que alguém entra quando não está recebendo nada — e ela
        não sabia dizer que o motivo era a permissão negada. Fica acima da lista
        porque, bloqueada, nenhum dos avisos abaixo chega ao celular.
      */}
      {notificacoesNegadas ? (
        <YStack marginBottom="$lg">
          <PermissionGate
            permissao="notificacoes"
            onTentarDeNovo={() => void notificacoesBloqueadas().then((b) => setNotificacoesNegadas(b))}
          />
        </YStack>
      ) : null}

      {avisos.length === 0 ? (
        <Note
          title="Nada pendente"
          body="A pulseira está conectada e medindo, e seu perfil está completo. Quando algo precisar da sua atenção, aparece aqui."
        />
      ) : (
        <YStack gap="$md">
          {avisos.map((aviso) => (
            <Card
              key={aviso.titulo}
              onPress={() => (navigation as any).push(aviso.rota as never)}
              accessibilityLabel={aviso.titulo}
            >
              <XStack alignItems="center" gap="$xs">
                <Icon name={aviso.icone} size={16} color={colors.textMuted} />
                <Label>{aviso.acao}</Label>
              </XStack>
              <SectionTitle marginTop="$xs">{aviso.titulo}</SectionTitle>
              <Body>{aviso.corpo}</Body>
            </Card>
          ))}
        </YStack>
      )}

      {recebidas.length > 0 ? (
        <YStack marginTop="$xl">
          <Section label="Notificações recebidas">
            {recebidas.map((n, i) => (
              <Pressable
                key={n.id}
                disabled={!n.rota}
                onPress={() => n.rota && (navigation as any).push(n.rota as never)}
                accessibilityRole={n.rota ? 'button' : undefined}
                accessibilityLabel={n.titulo}
              >
                <Row last={i === recebidas.length - 1}>
                  <YStack flex={1} minWidth={0} gap={4}>
                    <Body color="$foreground" numberOfLines={1}>
                      {n.titulo}
                    </Body>
                    <Data color="$mutedForeground" numberOfLines={2}>
                      {n.corpo}
                    </Data>
                  </YStack>
                  <Data color="$faint" flexShrink={0} marginLeft="$sm">
                    {quando(n.at)}
                  </Data>
                </Row>
              </Pressable>
            ))}
          </Section>
        </YStack>
      ) : null}

    </DetailScreen>
  );
}

/** "Agora", "14:30" ou "seg 14:30" — o suficiente para situar, sem virar data longa. */
function quando(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'agora';
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const hoje = new Date().toDateString() === d.toDateString();
  if (hoje) return hora;
  return `${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} ${hora}`;
}
