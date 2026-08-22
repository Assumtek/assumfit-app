import { YStack } from '@tamagui/stacks';
import React from 'react';

import { Body, Button, Headline } from './ui';
import { relatarErro } from '../services/crash-report';

/**
 * A rede de segurança da árvore: erro de render ou de efeito vira esta tela,
 * não a morte do app.
 *
 * Um testador (22/08/2026) viu o app fechar ao cancelar o check-in. O erro
 * era de JavaScript e, sem um limite de erro, o React Native em produção
 * derruba o processo inteiro. Aqui o erro é relatado ao servidor (com pilha)
 * e a pessoa ganha um botão para voltar — o estado das stores continua de pé,
 * então "Tentar de novo" costuma bastar.
 */
type Estado = { erro: Error | null };
type Props = {
  children: React.ReactNode;
  /** Erro vindo do tratador global (fora da árvore), para mostrar a mesma tela. */
  erroExterno?: unknown;
  onRecuperar?: () => void;
};

export class ErrorBoundary extends React.Component<Props, Estado> {
  state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  componentDidCatch(erro: Error, info: React.ErrorInfo) {
    relatarErro(
      { message: erro.message, stack: `${erro.stack ?? ''}\n--- componentes ---${info.componentStack ?? ''}` },
      false,
      'ErrorBoundary',
    );
  }

  render() {
    if (!this.state.erro && !this.props.erroExterno) return this.props.children;
    return (
      <YStack flex={1} backgroundColor="$background" justifyContent="center" padding="$xl" gap="$lg">
        <Headline>Algo deu errado nesta tela</Headline>
        <Body>
          O erro foi registrado e vai ser corrigido. Seus dados estão guardados — toque abaixo para
          continuar de onde estava.
        </Body>
        <Button
          title="Tentar de novo"
          onPress={() => {
            this.setState({ erro: null });
            this.props.onRecuperar?.();
          }}
        />
      </YStack>
    );
  }
}
