import { YStack } from '@tamagui/stacks';
import React from 'react';

import { Note, Row, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { Body, Data } from '../components/ui';

/**
 * Ajuda — o que cada número quer dizer, e de onde ele vem.
 *
 * Esta tela existe para o resto do app não precisar se explicar. Cada tela de
 * métrica carregava um parágrafo de "como isto é calculado", e somados eles
 * empurravam o dado para baixo em toda parte. Aqui a explicação é o conteúdo,
 * não o rodapé.
 *
 * A divisão em MEDIDO e DERIVADO é a informação mais importante da tela, e não
 * é detalhe técnico: num produto de saúde a pessoa tem o direito de saber quais
 * números saíram de um sensor no pulso dela e quais são conta nossa em cima
 * deles.
 */
export function HelpScreen() {
  return (
    <DetailScreen title="Ajuda">
      <Body marginBottom="$xl" maxWidth="94%">
        Tudo o que o AssumFit mostra vem da sua pulseira. Nada é estimado a partir de perfil, idade
        ou média de população — se não foi medido, a tela mostra traço.
      </Body>

      <Section label="Medido pela pulseira">
        <Explica termo="Frequência cardíaca" texto="Batimentos por minuto, lidos pelo sensor óptico ao longo do dia." />
        <Explica
          termo="HRV"
          texto="Variabilidade entre um batimento e o seguinte, em milissegundos. Quanto maior, mais folga o sistema nervoso tem. É pessoal: compare você com você."
        />
        <Explica termo="Oxigênio (SpO₂)" texto="Saturação de oxigênio no sangue, em porcentagem." />
        <Explica
          termo="Estresse"
          texto="De 0 a 100, calculado pelo firmware a partir da sua variabilidade cardíaca. É carga do sistema nervoso, não humor."
        />
        <Explica termo="Sono" texto="Fases da noite — profundo, leve, REM e desperto — na ordem em que aconteceram." />
        <Explica
          termo="Pressão"
          texto="Estimada pelo sensor óptico da pulseira: serve para acompanhar TENDÊNCIA, não substitui a medição de braçadeira. Fora da faixa esperada, meça no aparelho de verdade."
        />
        <Explica termo="Passos" texto="Contados pelo acelerômetro, fatiados ao longo do dia." last />
      </Section>

      <Section label="Calculado a partir do que foi medido">
        <Explica
          termo="Energia"
          texto="Quanto o seu corpo tem disponível agora, combinando HRV, sono e batimento de repouso."
        />
        <Explica
          termo="Bateria do corpo"
          texto="Parte do seu sono e sobe ou desce conforme o estresse do dia. Recupera devagar e gasta rápido, como o corpo."
        />
        <Explica
          termo="Continuidade do sono profundo"
          texto="Se o sono profundo veio num bloco ou em pedaços. Noventa minutos inteiros restauram mais que seis pedaços de quinze."
        />
        <Explica
          termo="Idade biológica"
          texto="Compara seus sinais com as faixas da sua idade e sexo. Move-se em meses, não em dias."
          last
        />
      </Section>

      <Section label="Quando um número não aparece">
        <Body flex={1}>
          Traço significa que aquela grandeza não foi medida — nunca que ela deu zero. A pulseira
          mede em janelas agendadas, e algumas medições dependem de ela estar bem encaixada no
          pulso. Sinal ausente não estraga o resto: o peso dele é redistribuído entre os outros.
        </Body>
      </Section>

      <Section label="Seus dados">
        <Explica
          termo="Onde o dado biométrico mora"
          texto="No seu aparelho e na sua conta, cifrado. Não é usado para publicidade nem compartilhado com terceiros, e revogar o consentimento apaga o que foi coletado."
        />
        <Explica
          termo="Por que pedimos nascimento e sexo"
          texto="HRV e frequência de repouso têm faixas normais diferentes por idade e sexo biológico. Sem os dois, a idade biológica compararia você com a população errada."
        />
        <Explica
          termo="Notificações"
          texto="Todas são locais — decididas no seu aparelho, sem servidor no meio — e nenhuma carrega valor de saúde no texto, porque a tela de bloqueio é vista por quem passa perto. O que já chegou fica listado em Avisos."
          last
        />
      </Section>

      <Note
        title="Isto não é um exame"
        body="O AssumFit é um produto de bem-estar e produtividade, não um dispositivo médico. Nenhum número aqui serve para diagnosticar, monitorar doença ou decidir tratamento. Se alguma coisa te preocupar, leve a um profissional de saúde — e leve a pergunta, não a tela."
      />
    </DetailScreen>
  );
}

/** Termo e definição, na mesma linha de lista. */
function Explica({ termo, texto, last }: { termo: string; texto: string; last?: boolean }) {
  return (
    <Row last={last}>
      <YStack flex={1} gap="$xs">
        <Body color="$foreground">{termo}</Body>
        <Data>{texto}</Data>
      </YStack>
    </Row>
  );
}
