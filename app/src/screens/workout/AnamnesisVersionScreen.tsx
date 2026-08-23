import { useRoute } from '@react-navigation/native';
import { YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';

import { Note, Row, Section } from '../../components/List';
import { DetailScreen } from '../../components/DetailScreen';
import { Body, Data, Label, SectionTitle, Skeleton, Subtitle } from '../../components/ui';
import { mensagemDaFalha } from '../../domain/apiErrors';
import { fetchAnamnesisVersion, type AnamnesisVersion } from '../../services/api.service';

/**
 * Uma versão da anamnese, aberta por toque.
 *
 * O conteúdo aqui é condição clínica declarada — o dado mais sensível que o app
 * guarda. Por isso ele só viaja quando alguém pede: a lista mostra contagem, e
 * o detalhe vem numa requisição própria.
 *
 * As respostas são renderizadas como pergunta e resposta em linguagem humana,
 * nunca como o JSON cru. Um objeto despejado na tela transfere para a pessoa o
 * trabalho de decifrar as chaves que nós escolhemos.
 */
export function AnamnesisVersionScreen() {
  const { id } = (useRoute().params ?? {}) as { id?: string };
  const [versao, setVersao] = useState<(AnamnesisVersion & { answers: Record<string, unknown> }) | null>(
    null);
  const [erro, setErro] = useState<unknown>(null);

  useEffect(() => {
    if (!id) return setErro(new Error('sem id'));
    fetchAnamnesisVersion(id)
      .then(setVersao)
      .catch((e) => setErro(e));
  }, [id]);

  if (erro) {
    return (
      <DetailScreen title="Anamnese">
        <Note title="Não foi possível carregar" body={mensagemDaFalha(erro, 'A leitura desta anamnese')} />
      </DetailScreen>
    );
  }

  if (!versao) {
    return (
      <DetailScreen title="Anamnese">
        <Skeleton lines={5} />
      </DetailScreen>
    );
  }

  const linhas = Object.entries(versao.answers).filter(([, valor]) => valor !== null && valor !== '');

  return (
    <DetailScreen title="Anamnese">
      <YStack marginBottom="$xl">
        <Label>respondida em</Label>
        <Subtitle marginTop="$xs">
          {new Date(versao.createdAt).toLocaleDateString('pt-BR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </Subtitle>
      </YStack>

      {versao.flags.length > 0 ? (
        <Section label="Condições consideradas">
          {versao.flags.map((flag, i) => (
            <Row key={flag} last={i === versao.flags.length - 1}>
              <Body flex={1} color="$foreground">
                {rotuloDeFlag(flag)}
              </Body>
            </Row>
          ))}
        </Section>
      ) : null}

      <Section label="Suas respostas">
        {linhas.map(([chave, valor], i) => (
          <Row key={chave} last={i === linhas.length - 1}>
            <Body flex={1} color="$mutedForeground">
              {rotuloDePergunta(chave)}
            </Body>
            <Data color="$foreground" maxWidth="45%" textAlign="right">
              {formatarResposta(valor)}
            </Data>
          </Row>
        ))}
      </Section>

    </DetailScreen>
  );
}

/**
 * A bandeira em português.
 *
 * O identificador é interno (`cardiopata`, `gestante`) e serve ao agente. Numa
 * tela de saúde, mostrar o identificador cru é jogar vocabulário de banco de
 * dados na cara de quem declarou uma condição.
 */
const ROTULO_FLAG: Record<string, string> = {
  cardiopata: 'Condição cardíaca',
  gestante: 'Gestação',
  hipertenso: 'Hipertensão',
  diabetico: 'Diabetes',
  obeso: 'Obesidade',
  lesao: 'Lesão declarada',
  dor_peito: 'Dor no peito',
  tontura: 'Tontura ou desmaio',
  glp1: 'Uso de GLP-1',
  idoso: 'Faixa etária 60+',
  iniciante: 'Iniciante',
};

const rotuloDeFlag = (flag: string) => ROTULO_FLAG[flag] ?? flag.replace(/_/g, ' ');

/** Chave técnica → pergunta. Sem isso a tela mostra `parqQ1`, que não é nada. */
const ROTULO_PERGUNTA: Record<string, string> = {
  heartCondition: 'Problema cardíaco diagnosticado',
  chestPain: 'Dor no peito ao se exercitar',
  dizziness: 'Tontura ou perda de equilíbrio',
  boneJoint: 'Problema ósseo ou articular',
  bloodPressureMed: 'Medicamento para pressão',
  otherReason: 'Outro motivo para não se exercitar',
  pregnant: 'Gestante',
  injuries: 'Lesões',
  conditions: 'Condições declaradas',
  medications: 'Medicamentos',
  surgeries: 'Cirurgias',
  experience: 'Experiência com treino',
};

const rotuloDePergunta = (chave: string) =>
  ROTULO_PERGUNTA[chave] ?? chave.replace(/([A-Z])/g, ' $1').toLowerCase();

function formatarResposta(valor: unknown): string {
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (Array.isArray(valor)) return valor.length ? valor.join(', ') : '–';
  return String(valor);
}
