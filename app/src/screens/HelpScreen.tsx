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

      <Section label="Esporte">
        <Explica
          termo="Calorias como faixa"
          texto="A caloria de uma sessão é MET da modalidade × peso × tempo — e o peso ainda não está no cadastro. Por isso ela aparece como FAIXA (60 a 85 kg de referência), não como número exato: a faixa declara a incerteza em vez de fingir precisão."
        />
        <Explica
          termo="Onde o percurso mora"
          texto="A trilha de GPS fica só no aparelho em que foi gravada e morre com o registro — para o servidor sobem apenas os totais (tempo, distância, batimento). O story de compartilhar desenha o traçado sem mapa, sem rua e sem endereço."
        />
        <Explica
          termo="Sessão de tela aberta"
          texto="Nesta versão o GPS não corre em segundo plano: a distância só é medida com a tela da sessão aberta. Se o app fechar, a sessão concluída fica guardada no aparelho e sobe sozinha na próxima abertura. Sessões de menos de um minuto não entram no histórico."
          last
        />
      </Section>

      <Section label="Agenda e janelas de energia">
        <Explica
          termo="Janelas de energia"
          texto="A grade do dia é a sua curva de energia projetada hora a hora a partir da última leitura da pulseira: janela alta para o trabalho difícil, média para reuniões e revisão, baixa para recuperar. A projeção se ajusta ao longo do dia, conforme novas medições chegam — o horário da leitura usada aparece no topo da tela."
        />
        <Explica
          termo="Compromissos"
          texto="Com Google Agenda ou Outlook conectados, as reuniões entram na mesma régua de horas — a barrinha de cada uma mostra em que janela ela cai. Os eventos são lidos no provedor na hora e nunca guardados; participantes viram contagem, nunca lista de nomes."
          last
        />
      </Section>

      <Section label="Ciclo menstrual">
        <Explica
          termo="Como registrar e como a previsão funciona"
          texto="Marque no calendário CADA dia de menstruação — dias seguidos formam um ciclo, e a quantidade deles é a duração do fluxo. O término é simplesmente parar de marcar. A previsão vem da média dos intervalos entre os inícios; enquanto não há registros suficientes, a referência típica de 28 dias entra no lugar — por isso as primeiras previsões dizem 'estimado'. Ciclos fora da faixa de 21 a 35 dias não entram na média, e quando isso acontece com frequência a tela avisa."
        />
        <Explica
          termo="Janela fértil"
          texto="É calculada por calendário, a partir da previsão — e previsão por calendário erra com frequência. Serve para autoconhecimento; não serve como método contraceptivo nem para planejar gravidez com segurança."
        />
        <Explica
          termo="Atraso"
          texto="Atraso é atraso: a tela mostra quantos dias e para de afirmar fase e janelas, porque a previsão venceu. O app não sugere causas — variação entre ciclos é comum, e o que fazer com um atraso é seu, com quem você quiser."
        />
        <Explica
          termo="Consentimento e revogação"
          texto="O ciclo tem consentimento próprio, separado do de biometria. Revogar — no fim da própria tela de Ciclo — apaga os registros do servidor em definitivo."
          last
        />
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
