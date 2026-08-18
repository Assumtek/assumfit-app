import { YStack } from '@tamagui/stacks';
import React from 'react';
import { Switch } from 'react-native';

import { Row, Section } from './Card';
import { Body, Button, Data } from './ui';
import {
  assumfitVibra,
  comAssumfit,
  nomeadasLigadas,
  type CategoriaDeAviso,
} from '../domain/bandNotifications';
import { ble } from '../services/ble';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Fazer a pulseira vibrar com os avisos do AssumFit.
 *
 * O que a tela precisa comunicar, e é a razão de este componente existir em vez
 * de um interruptor solto: **não dá para escolher só o AssumFit**. O filtro do
 * firmware é por categoria de app, de um vocabulário fixo, sem identificador —
 * o AssumFit cai no balde de "outros", e ligar esse balde faz a pulseira vibrar
 * com todo app que o firmware não reconhece.
 *
 * Esconder isso produziria a pior versão do problema: a pessoa liga esperando
 * avisos do AssumFit, começa a receber vibração de aplicativos aleatórios e não
 * tem como ligar uma coisa à outra. Então a consequência é dita ANTES, e com os
 * nomes do que já está ligado na pulseira, não em abstrato.
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

  const ligado = assumfitVibra(filtro);
  const acompanham = nomeadasLigadas(filtro);

  const aplicar = async (valor: boolean) => {
    setSalvando(true);
    setErro(null);
    const novo = comAssumfit(filtro, valor);
    /*
     Ligar o ANCS junto, e só ao LIGAR: é ele que faz o iOS oferecer o
     emparelhamento de sistema, sem o qual o filtro está certo e mesmo assim
     nada chega ao pulso. Desligar não precisa mexer nisso — o emparelhamento
     serve a outras coisas da pulseira.
    */
    if (valor) await ble.enableAncs?.().catch(() => false);
    const ok = await ble.setNotificationFilter?.(novo).catch(() => false);
    if (ok) setFiltro(novo);
    else setErro('A pulseira não aceitou a mudança. Aproxime o pulso e tente de novo.');
    setSalvando(false);
  };

  return (
    <YStack gap="$md">
      <Section label="Avisos no pulso">
        <Row last>
          <YStack flex={1} paddingRight="$md">
            <Body color="$foreground">Vibrar com os avisos do AssumFit</Body>
            <Data>{ligado ? 'ligado' : 'desligado'}</Data>
          </YStack>
          <Switch
            value={ligado}
            onValueChange={(v) => void aplicar(v)}
            trackColor={{ true: colors.accent }}
            disabled={salvando}
          />
        </Row>
      </Section>

      <Body>
        {ligado
          ? 'A pulseira também vibra com qualquer outro app que o firmware dela não reconheça — ela não sabe separar um do outro.'
          : 'A pulseira agrupa todo app que não conhece numa categoria só. Ligando isto, ela vibra com os avisos do AssumFit e com os desses outros apps junto.'}
      </Body>

      {/*
        Os nomes do que já está ligado tornam a consequência verificável. Sem
        eles a frase acima é abstrata, e abstrato ninguém consegue avaliar.
      */}
      {acompanham.length > 0 ? (
        <Data>Categorias já ligadas na pulseira: {acompanham.join(', ')}.</Data>
      ) : null}

      {ligado ? (
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
