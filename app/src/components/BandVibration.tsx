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
import { useAvisosNoPulsoStore } from '../store/avisosNoPulso.store';
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
  const ligado = useAvisosNoPulsoStore((e) => e.ligado);
  const ancsRecusado = useAvisosNoPulsoStore((e) => e.ancsRecusado);
  const definir = useAvisosNoPulsoStore((e) => e.definir);
  const carregarPreferencia = useAvisosNoPulsoStore((e) => e.carregar);
  React.useEffect(() => {
    void carregarPreferencia();
  }, [carregarPreferencia]);
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
   Firmware que não responde ao filtro não ganha um interruptor que não faz
   nada. Vale também para o caso de lista vazia: sem categoria nenhuma para
   ligar, não há o que oferecer.
  */
  /*
   A seção existe SEMPRE. Antes, pulseira que não respondia ao filtro (ou
   respondia vazio) escondia tudo, e o testador não encontrava a opção que o
   anúncio citava. Sem filtro, fica o que importa: ligar os avisos do app.
  */
  if (filtro === undefined || ligado === undefined) {
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
          {/*
            Interruptor, não ação, e o estado vem do disco.

            Era um toque cujo resultado morava no componente: voltar para a
            tela desmontava tudo e a linha reaparecia como se nada tivesse
            acontecido. "Eu seleciono, porém quando volto ele desliga. Pode
            substituir o clique por um toggle pra elucidar se está ativo"
            (Bruno, 25/08/2026). As duas metades do pedido são a mesma coisa:
            a pessoa precisa VER o estado, e para isso ele precisa existir.
          */}
          <SwitchRow
            icon="bell"
            title="Avisos do AssumFit no pulso"
            subtitle={
              !ligado
                ? 'Ligado, o fim do descanso e do alongamento vibram no pulso.'
                : ancsRecusado
                  ? 'Vibra com o app aberto. Para vibrar com a tela apagada, a pulseira precisa aceitar o emparelhamento do iPhone: aproxime o pulso e ligue de novo.'
                  : 'Fim do descanso e do alongamento vibram no pulso. Se o iPhone pedir para emparelhar a pulseira, aceite.'
            }
            value={ligado}
            onValueChange={(v) => void definir(v)}
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
