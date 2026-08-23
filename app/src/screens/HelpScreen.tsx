import { YStack } from '@tamagui/stacks';
import React from 'react';

import { Note, Row, Section } from '../components/List';
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
        ou média de população, se não foi medido, a tela mostra traço.
      </Body>

      <Section label="Medido pela pulseira">
        <Explica termo="Frequência cardíaca" texto="Batimentos por minuto, lidos pelo sensor óptico ao longo do dia." />
        <Explica
          termo="HRV"
          texto="Variabilidade entre um batimento e o seguinte, em milissegundos, a pulseira mede nas janelas agendadas, de hora em hora, e o número é a média dessas diferenças (RMSSD). Coração que varia mais tem mais folga no sistema nervoso: acima de 70 ms é excelente, acima de 50 bom, abaixo disso pode melhorar, e abaixo de 20 vale atenção. É o componente de maior peso no score de energia. E é pessoal, idade, genética e treino mudam a base, então compare você com você: o app guarda a sua linha de base e lê cada medição contra ela."
        />
        <Explica termo="Oxigênio (SpO₂)" texto="Saturação de oxigênio no sangue, em porcentagem." />
        <Explica
          termo="Estresse"
          texto="De 0 a 100, calculado pelo firmware da pulseira a partir da variabilidade entre um batimento e outro (HRV): intervalos mais irregulares indicam o corpo em recuperação; mais uniformes, carga. Abaixo de 30 é calmo, até 59 moderado, a partir de 60 elevado. É carga do sistema nervoso, não humor, um treino pesado e uma briga podem dar o mesmo número."
        />
        <Explica
          termo="Sono"
          texto="O score (0 a 100) é calculado a partir das fases medidas: metade é a duração total, um quarto é o sono profundo, 15% o REM e 10% a continuidade (quantas vezes você acordou). Por isso uma noite longa e picada pode pontuar menos que uma mais curta e inteira. O hipnograma mostra as fases na ordem em que aconteceram; a data é a da noite em que você deitou."
        />
        <Explica
          termo="Pressão"
          texto="Estimada pelo sensor óptico da pulseira: serve para acompanhar TENDÊNCIA; a medição de braçadeira continua sendo a referência. As faixas seguem a Diretriz Brasileira de Hipertensão (SBC 2020): ótima abaixo de 120/80, normal até 129/84, elevada de 130/85 a 139/89. Fora da faixa esperada, meça no aparelho de verdade."
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
          texto="Compara seus sinais com as faixas da sua idade e sexo. Move-se ao longo de meses."
          last
        />
      </Section>

      <Section label="Quando um número não aparece">
        <Body flex={1} marginBottom="$md">
          Traço significa que aquela grandeza não foi medida, nunca que ela deu zero. A pulseira
          mede em janelas agendadas, e algumas medições dependem de ela estar bem encaixada no
          pulso. Sinal ausente não estraga o resto: o peso dele é redistribuído entre os outros.
        </Body>
        <Body flex={1}>
          Longe do celular, a pulseira continua medindo sozinha e guarda até 7 dias na memória.
          Ao reconectar, o app recupera o que ficou acumulado, só o ao vivo (número em tempo
          real, sessão de esporte com GPS) precisa do celular por perto.
        </Body>
      </Section>

      <Section label="Esporte">
        <Explica
          termo="Calorias como faixa"
          texto="A caloria de uma sessão é MET da modalidade × peso × tempo, e o peso ainda não está no cadastro. Por isso ela aparece como FAIXA (60 a 85 kg de referência), não como número exato: a faixa declara a incerteza em vez de fingir precisão."
        />
        <Explica
          termo="Onde o percurso mora"
          texto="O percurso das sessões com GPS é reduzido no próprio aparelho (menos pontos, precisão de metros) antes de ser guardado no seu histórico, é ele que desenha o mapa da sessão em qualquer aparelho. Apagar a conta apaga os percursos junto. O story de compartilhar desenha o traçado sem mapa, sem rua e sem endereço."
        />
        <Explica
          termo="Sessão em segundo plano"
          texto="Durante uma sessão, o GPS continua medindo com o app atrás ou a tela apagada, no iPhone o sistema mostra o indicador de localização, e no Android uma notificação fixa segura o rastreio; os dois somem quando a sessão termina. Sessões concluídas ficam guardadas no aparelho e sobem sozinhas se a rede faltar. Sessões de menos de um minuto não entram no histórico."
          last
        />
      </Section>

      <Section label="Ciclo menstrual">
        <Explica
          termo="Como registrar e como a previsão funciona"
          texto="Marque no calendário CADA dia de menstruação, dias seguidos formam um ciclo, e a quantidade deles é a duração do fluxo. O término é simplesmente parar de marcar. A previsão vem da média dos intervalos entre os inícios; enquanto não há registros suficientes, a referência típica de 28 dias entra no lugar, por isso as primeiras previsões dizem 'estimado'. Ciclos fora da faixa de 21 a 35 dias não entram na média, e quando isso acontece com frequência a tela avisa."
        />
        <Explica
          termo="Janela fértil"
          texto="É calculada por calendário, a partir da previsão, e previsão por calendário erra com frequência. Serve para autoconhecimento; não serve como método contraceptivo nem para planejar gravidez com segurança."
        />
        <Explica
          termo="Atraso"
          texto="Atraso é atraso: a tela mostra quantos dias e para de afirmar fase e janelas, porque a previsão venceu. O app não sugere causas, variação entre ciclos é comum, e o que fazer com um atraso é seu, com quem você quiser."
        />
        <Explica
          termo="Consentimento e revogação"
          texto="O ciclo tem consentimento próprio, separado do de biometria. Revogar, no fim da própria tela de Ciclo, apaga os registros do servidor em definitivo."
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
          texto="Todas são locais, decididas no seu aparelho, sem servidor no meio, e nenhuma carrega valor de saúde no texto, porque a tela de bloqueio é vista por quem passa perto. O que já chegou fica listado em Avisos."
          last
        />
      </Section>

      <Note
        title="Isto não é um exame"
        body="O AssumFit é um produto de esporte, bem-estar e autoconhecimento, não um dispositivo médico. Nenhum número aqui serve para diagnosticar, monitorar doença ou decidir tratamento. Se alguma coisa te preocupar, leve a um profissional de saúde, e leve a pergunta, não a tela."
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
