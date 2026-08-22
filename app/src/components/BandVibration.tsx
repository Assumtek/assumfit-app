import { YStack } from '@tamagui/stacks';
import React from 'react';
import { Switch } from 'react-native';

import { AppIcon } from './AppIcon';
import { Row, Section } from './Card';
import { Icon } from './Icon';
import { Body, Button, Data } from './ui';
import {
  comAssumfit,
  comCategoria,
  comTodas,
  linhasParaTela,
  todasLigadas,
  type CategoriaDeAviso,
} from '../domain/bandNotifications';
import { ble } from '../services/ble';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Com o que a pulseira vibra — categoria a categoria.
 *
 * Era um interruptor só ("vibrar com os avisos do AssumFit"). Um testador pediu
 * para escolher: só o app, ou todas as notificações do celular (21/08). A
 * metade "só o app" o hardware não oferece, e a tela continua dizendo por quê:
 * o filtro do firmware é por categoria de app, de um vocabulário fixo, sem
 * identificador — o AssumFit cai no balde de "outros", e ligar esse balde faz
 * a pulseira vibrar com todo app que o firmware não reconhece.
 *
 * A outra metade ele oferece, e agora a tela também: cada categoria que a
 * pulseira reporta vira uma linha com o próprio interruptor, e um mestre no
 * topo liga ou desliga tudo de uma vez.
 */
export function BandVibration() {
  const { colors } = useTheme();
  const [filtro, setFiltro] = React.useState<CategoriaDeAviso[] | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vivo = true;
    void ble
      .getNotificationFilter?.()
      .then((f) => vivo && setFiltro(f))
      .catch(() => vivo && setFiltro([]));
    return () => {
      vivo = false;
    };
  }, []);

  /*
   Firmware que não responde ao filtro não ganha um interruptor que não faz
   nada. Vale também para o caso de lista vazia: sem categoria nenhuma para
   ligar, não há o que oferecer.
  */
  if (filtro === null || filtro.length === 0) return null;

  const linhas = linhasParaTela(filtro);
  if (linhas.length === 0) return null;
  const tudo = todasLigadas(filtro);
  const outrosLigado = linhas.find((l) => l.outros)?.enabled ?? false;

  const aplicar = async (novo: CategoriaDeAviso[], ligandoAlgo: boolean) => {
    setSalvando(true);
    setErro(null);
    /*
     Ligar o ANCS junto, e só ao LIGAR: é ele que faz o iOS oferecer o
     emparelhamento de sistema, sem o qual o filtro está certo e mesmo assim
     nada chega ao pulso. Desligar não precisa mexer nisso — o emparelhamento
     serve a outras coisas da pulseira.
    */
    if (ligandoAlgo) await ble.enableAncs?.().catch(() => false);
    const ok = await ble.setNotificationFilter?.(novo).catch(() => false);
    if (ok) setFiltro(novo);
    else setErro('A pulseira não aceitou a mudança. Aproxime o pulso e tente de novo.');
    setSalvando(false);
  };

  const mudarLinha = (key: string, valor: boolean) => {
    if (key === 'outros') return aplicar(comAssumfit(filtro, valor), valor);
    return aplicar(comCategoria(filtro, Number(key.slice(4)), valor), valor);
  };

  return (
    <YStack gap="$md">
      <Section label="Avisos no pulso">
        <Row>
          <Icon name="smartphone" size={18} color={colors.text} />
          <YStack flex={1} marginLeft="$md" paddingRight="$md">
            <Body color="$foreground">Todas as notificações do celular</Body>
            <Data>{tudo ? 'ligado' : 'escolha abaixo'}</Data>
          </YStack>
          <Switch
            value={tudo}
            onValueChange={(v) => void aplicar(comTodas(filtro, v), v)}
            trackColor={{ true: colors.accent }}
            disabled={salvando}
          />
        </Row>
        {linhas.map((l, i) => (
          <Row key={l.key} last={i === linhas.length - 1}>
            <AppIcon mark={l.marca} />
            <YStack flex={1} marginLeft="$md" paddingRight="$md">
              <Body color="$foreground">{l.nome}</Body>
              <Data>{l.outros ? 'inclui o AssumFit' : l.enabled ? 'ligado' : 'desligado'}</Data>
            </YStack>
            <Switch
              value={l.enabled}
              onValueChange={(v) => void mudarLinha(l.key, v)}
              trackColor={{ true: colors.accent }}
              disabled={salvando}
            />
          </Row>
        ))}
      </Section>

      {/*
        A limitação dita ANTES de a pessoa sentir o efeito: não dá para ligar
        SÓ o AssumFit. Escondê-la produziria vibração de app aleatório sem
        explicação — a pior versão do problema.
      */}
      <Body>
        {outrosLigado
          ? 'Os avisos do AssumFit chegam pela categoria "Outros apps" — a pulseira não sabe separar um app desconhecido de outro, então ela vibra com todos eles.'
          : 'A pulseira não tem uma categoria só para o AssumFit: os avisos dele chegam por "Outros apps", junto com os de qualquer app que o firmware não reconhece.'}
      </Body>

      {outrosLigado ? (
        <Data>
          Se o iPhone perguntar se você quer emparelhar a pulseira, aceite — sem isso o sistema não
          entrega os avisos a ela.
        </Data>
      ) : null}

      {erro ? <Body>{erro}</Body> : null}

      {/*
        Provar a vibração vale mais que descrevê-la: um toque diz na hora se o
        pulso responde, e separa "não configurou" de "a pulseira não vibra".
      */}
      <Button
        title="Testar a vibração"
        variant="secondary"
        onPress={() => void ble.vibrate?.().catch(() => undefined)}
      />
    </YStack>
  );
}
