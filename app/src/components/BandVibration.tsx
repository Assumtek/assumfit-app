import { YStack } from '@tamagui/stacks';
import React from 'react';

import { AppIcon } from './AppIcon';
import { ActionRow, Section, SwitchRow } from './List';
import { Body, Button, Data, Skeleton } from './ui';
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
  /** `undefined` carregando; `null` a pulseira não respondeu; `[]` sem categorias. */
  const [filtro, setFiltro] = React.useState<CategoriaDeAviso[] | null | undefined>(undefined);
  const [ancs, setAncs] = React.useState<'idle' | 'ok' | 'falhou'>('idle');
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const consultar = React.useCallback(() => {
    setFiltro(undefined);
    void (ble.getNotificationFilter?.() ?? Promise.resolve(null))
      .then((f) => setFiltro(f))
      .catch(() => setFiltro(null));
  }, []);
  React.useEffect(() => {
    consultar();
  }, [consultar]);

  /*
   Ligar o ANCS sozinho: é ele que faz o iOS oferecer o emparelhamento e
   entregar os avisos do app (fim do descanso, fim do alongamento) à
   pulseira. Existe separado do filtro porque o filtro pode não responder e o
   ANCS continuar funcionando.
  */
  const ligarAncs = async () => {
    const ok = await ble.enableAncs?.().catch(() => false);
    setAncs(ok ? 'ok' : 'falhou');
  };

  /*
   Firmware que não responde ao filtro não ganha um interruptor que não faz
   nada. Vale também para o caso de lista vazia: sem categoria nenhuma para
   ligar, não há o que oferecer.
  */
  /*
   A seção existe SEMPRE. Antes, pulseira que não respondia ao filtro (ou
   respondia vazio) escondia tudo, e o testador não encontrava a opção que o
   anúncio citava. Sem filtro, fica o que importa: ligar os avisos do app.
  */
  if (filtro === undefined) {
    return (
      <Section label="Avisos no pulso">
        <Skeleton lines={2} />
      </Section>
    );
  }
  const linhas = filtro ? linhasParaTela(filtro) : [];
  if (!filtro || linhas.length === 0) {
    return (
      <YStack gap="$md">
        <Section label="Avisos no pulso">
          <ActionRow
            icon="bell"
            title="Ligar avisos do AssumFit no pulso"
            subtitle={
              ancs === 'ok'
                ? 'Ligado. Se o iPhone pedir para emparelhar a pulseira, aceite.'
                : ancs === 'falhou'
                  ? 'A pulseira não aceitou. Aproxime o pulso e tente de novo.'
                  : 'Fim do descanso e do alongamento vibram no pulso, mesmo com a tela apagada.'
            }
            onPress={() => void ligarAncs()}
          />
          <ActionRow
            icon="refresh"
            title={filtro === null ? 'A pulseira não respondeu ao filtro por app' : 'Esta pulseira não expõe filtro por app'}
            subtitle="Tentar ler de novo"
            onPress={consultar}
            last
          />
        </Section>
      </YStack>
    );
  }
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
        <SwitchRow
          icon="smartphone"
          title="Todas as notificações do celular"
          subtitle={tudo ? 'ligado' : 'escolha abaixo'}
          value={tudo}
          onValueChange={(v) => void aplicar(comTodas(filtro, v), v)}
          disabled={salvando}
        />
        {linhas.map((l, i) => (
          <SwitchRow
            key={l.key}
            leading={<AppIcon mark={l.marca} />}
            title={l.nome}
            subtitle={l.outros ? 'inclui o AssumFit' : l.enabled ? 'ligado' : 'desligado'}
            value={l.enabled}
            onValueChange={(v) => void mudarLinha(l.key, v)}
            disabled={salvando}
            last={i === linhas.length - 1}
          />
        ))}
      </Section>

      {/*
        A limitação dita ANTES de a pessoa sentir o efeito: não dá para ligar
        SÓ o AssumFit. Escondê-la produziria vibração de app aleatório sem
        explicação — a pior versão do problema.
      */}
      <Body>
        {outrosLigado
          ? 'Os avisos do AssumFit, fim do descanso, fim do alongamento, lembretes, chegam pela categoria "Outros apps". A pulseira não sabe separar um app desconhecido de outro, então ela vibra com todos eles.'
          : 'Com o app aberto, a pulseira vibra no fim do descanso e do alongamento. Com a tela apagada, o aviso chega por "Outros apps", a pulseira não tem uma categoria só para o AssumFit, e essa vem junto com qualquer app que o firmware não reconhece.'}
      </Body>

      {outrosLigado ? (
        <Data>
          Se o iPhone perguntar se você quer emparelhar a pulseira, aceite, sem isso o sistema não
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
