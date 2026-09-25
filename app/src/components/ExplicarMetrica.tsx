import { YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';

import * as api from '../services/api.service';
import { Body, Data, Label, Skeleton } from './ui';
import { Sheet } from './ui/Dialog';

/**
 * O que este número significa, pedido por um toque.
 *
 * "Tive um sono 92% ótimo, mas o que isso significa?" (pedido de testador). A
 * tela dizia o valor e a avaliação e parava aí.
 *
 * Três frases, e cada uma responde a uma pergunta diferente: de que o número é
 * feito, onde ele cai no histórico DESTA pessoa, e o que mais o move no caso
 * dela. É a diferença entre explicar a métrica e explicar a pessoa.
 *
 * Nada roda sem o toque: a chamada acontece quando a folha abre, e não ao
 * montar a tela. Quem nunca perguntar nunca custa nada.
 */
export function ExplicarMetrica({
  aberto,
  onFechar,
  metrica,
  rotulo,
  valor,
  avaliacao,
  componentes,
}: {
  aberto: boolean;
  onFechar: () => void;
  metrica: 'sono' | 'energia' | 'hrv' | 'estresse' | 'repouso';
  rotulo: string;
  valor: number;
  avaliacao: string;
  componentes?: string[];
}) {
  const [texto, setTexto] = useState<Awaited<ReturnType<typeof api.explicarMetrica>> | undefined>(
    undefined);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setTexto(undefined);
    void api
      .explicarMetrica({ metrica, valor, avaliacao, componentes })
      .then((t) => vivo && setTexto(t));
    return () => {
      vivo = false;
    };
  }, [aberto, metrica, valor, avaliacao, componentes]);

  return (
    <Sheet open={aberto} onClose={onFechar}>
      <YStack gap="$md">
        <Label>{rotulo.toLowerCase()}, no seu caso</Label>

        {texto === undefined ? (
          <Skeleton lines={3} />
        ) : texto === null ? (
          <Body color="$mutedForeground">
            Ainda não dá para explicar este número no seu caso: é preciso algum histórico de
            medições para comparar com você mesmo.
          </Body>
        ) : (
          <>
            <YStack gap="$xs">
              <Data>de onde vem</Data>
              <Body color="$foreground">{texto.de_onde_vem}</Body>
            </YStack>
            <YStack gap="$xs">
              <Data>onde você está</Data>
              <Body color="$foreground">{texto.onde_voce_esta}</Body>
            </YStack>
            <YStack gap="$xs">
              <Data>o que mexe nisso</Data>
              <Body color="$foreground">{texto.o_que_mexe}</Body>
            </YStack>
          </>
        )}
      </YStack>
    </Sheet>
  );
}
