import { useCallback, useEffect, useState } from 'react';

import { calcBioAge } from '../domain/bioAge';

type BioAge = ReturnType<typeof calcBioAge>;
import * as api from '../services/api.service';
import { deepSleepPct, useBiometricStore } from '../store/biometric.store';
import { useUserStore } from '../store/user.store';

/**
 * A idade biológica, montada UMA vez para todas as telas.
 *
 * Havia duas montagens: o card da tela Saúde calculava sem IMC e sem minutos
 * ativos; o detalhe, com os dois. Mesmo sensor, mesma pessoa, dois números — um
 * testador viu "+1 ano" no card e "4 anos abaixo" ao tocar (ago/2026). Numa
 * métrica que se propõe a ser instrumento, divergir entre duas telas é o
 * defeito que mais custa confiança, e ele nasce sempre do mesmo jeito: a
 * montagem das entradas copiada em vez de compartilhada.
 *
 * IMC vem da anamnese (peso e altura); minutos ativos, dos últimos 7 dias de
 * treino e esporte — sessão vinculada a uma execução conta uma vez só, a mesma
 * regra da agenda de movimento. Enquanto a rede não responde, os dois ficam
 * `null` e o cálculo usa o padrão, nas DUAS telas igualmente.
 */
export function useBioAge(): { bio: BioAge | null; imc: number | null; minutosAtivos: number | null; recarregar: () => Promise<void> } {
  const latest = useBiometricStore((s) => s.latest);
  const sleep = useBiometricStore((s) => s.sleep);
  const user = useUserStore((s) => s.user);
  const age = useUserStore((s) => s.age());

  const [imc, setImc] = useState<number | null>(null);
  const [minutosAtivos, setMinutosAtivos] = useState<number | null>(null);

  const recarregar = useCallback(async () => {
    const desde = Date.now() - 7 * 86_400_000;
    const [anamnese, execucoes, sessoes] = await Promise.all([
      api.fetchAnamnesis().catch(() => null),
      api.fetchExecutionHistory(7).catch(() => []),
      api.fetchSportSessions(7).catch(() => []),
    ]);

    // O tipo das respostas é aberto (o grafo de perguntas evolui sem passar
    // por aqui), então peso e altura são estreitados antes de virar conta.
    const respostas = anamnese?.answers as { weightKg?: number; heightCm?: number } | undefined;
    const peso = typeof respostas?.weightKg === 'number' ? respostas.weightKg : null;
    const altura = typeof respostas?.heightCm === 'number' ? respostas.heightCm : null;
    if (peso && altura && altura >= 100) setImc(peso / (altura / 100) ** 2);

    const vinculadas = new Set(
      sessoes.map((s) => s.workoutExecutionId).filter((id): id is string => !!id),
    );
    const minTreino = execucoes
      .filter((e) => e.status === 'FINISHED' && Date.parse(e.startedAt) >= desde)
      .filter((e) => !vinculadas.has(e.id))
      .reduce((soma, e) => soma + (e.durationSec ?? 0) / 60, 0);
    const minEsporte = sessoes
      .filter((s) => Date.parse(s.startedAt) >= desde)
      .reduce((soma, s) => soma + s.durationS / 60, 0);
    setMinutosAtivos(Math.round(minTreino + minEsporte));
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const bio = latest
    ? calcBioAge({
        realAge: age,
        sex: user.sex,
        hrvMs: latest.hrvMs,
        restingHr: latest.heartRate,
        deepSleepPct: sleep ? deepSleepPct(sleep) : null,
        bmi: imc,
        weeklyActiveMin: minutosAtivos,
      })
    : null;

  return { bio, imc, minutosAtivos, recarregar };
}
