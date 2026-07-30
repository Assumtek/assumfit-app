"""Pipeline do agente: gerar → validar → julgar → decidir.

Função assíncrona simples. Não há grafo de estados aqui porque não há
ramificação de verdade: é uma sequência com um laço de correção no meio.
"""

from __future__ import annotations

import json
import time
import uuid

from agent.generate import generate_plan
from agent.knowledge import gather_knowledge
from agent.models import AgentResult, WorkoutGenerationInput
from agent.validate import catalog_errors, validate_plan
from core.logging import get_logger
from core.settings import settings
from grader.grade import grade

log = get_logger(__name__)


def _catalog_correction(errors: list[str]) -> str:
    """Instrução de correção com os ids inválidos da tentativa anterior."""
    ids = sorted({e.split(": ", 1)[1] for e in errors if ": " in e})
    listed = ", ".join(ids) if ids else "(ids nao identificados)"
    return (
        "# Correcao obrigatoria\n"
        f"A tentativa anterior prescreveu exercicios FORA do catalogo permitido: {listed}.\n"
        "Gere o plano novamente usando SOMENTE exerciseId presentes no catalogo permitido. "
        "Nunca invente ids nem use exercicios fora da lista."
    )


def _juiz_reprovou(breakdown: dict) -> bool:
    return bool(breakdown.get("hard_failures")) or breakdown["score"] < settings.grader_min_score


def _e_opiniao(breakdown: dict) -> bool:
    """Verdadeiro quando nada determinístico participou da reprovação.

    Checagem dura reprovada (`type == "check"`) repete idêntica em qualquer
    re-voto; nota derrubada por PENALTY também, mas aí o juiz ainda pode ter
    variado — o re-voto converge sozinho e custa uma chamada, então só a
    checagem dura é excluída de vez.
    """
    return all(f.get("type") != "check" for f in breakdown.get("hard_failures", []))


async def run_agent(inp: WorkoutGenerationInput) -> AgentResult:
    trace_id = uuid.uuid4().hex

    if not inp.knowledge:
        inp = inp.model_copy(update={"knowledge": gather_knowledge(inp)})

    started = time.perf_counter()
    plan = await generate_plan(inp)

    errors = validate_plan(plan, inp)

    # Id fora do catálogo é erro MECÂNICO — o modelo alucinou um identificador,
    # não errou o juízo clínico. Vale corrigir e tentar de novo antes de gastar
    # uma chamada de avaliação e devolver um veredito reprovado.
    retries = 0
    while catalog_errors(errors) and retries < settings.max_catalog_retries:
        retries += 1
        log.info(
            "agent.catalog_retry",
            trace_id=trace_id,
            attempt=retries,
            errors=len(catalog_errors(errors)),
        )
        plan = await generate_plan(inp, correction=_catalog_correction(catalog_errors(errors)))
        errors = validate_plan(plan, inp)

    latency_ms = int((time.perf_counter() - started) * 1000)

    # O avaliador recebe só o perfil e as referências. O catálogo fica de fora
    # de propósito: a conformidade com ele já foi checada deterministicamente, e
    # mandar 370 exercícios para um juízo que não os usa é desperdício puro.
    context = "\n\n".join(inp.knowledge)
    request = json.dumps(
        {
            "profile": inp.profile,
            "flags": inp.flags,
            "history_summary": inp.history_summary,
            "constraints": inp.constraints,
        },
        ensure_ascii=False,
        indent=2,
    )
    breakdown = await grade(
        question=request, answer=plan, context=context, latency_ms=latency_ms
    )
    blocked = bool(errors) or _juiz_reprovou(breakdown)

    # Bloqueio por opinião exige maioria. O mesmo plano, mesmo perfil, levou
    # hard-fail de segurança em 1 de 4 avaliações na rodada de testes 1 — e um
    # falso bloqueio cobra a geração inteira de novo sem entregar nada. Só entra
    # aqui o veredito que é PURAMENTE do juiz: erro determinístico (validação ou
    # checagem dura) re-votaria para o mesmo lugar, então não re-vota.
    if blocked and not errors and settings.grader_confirm_blocks and _e_opiniao(breakdown):
        contra, a_favor = 1, 0
        while contra < 2 and a_favor < 2:
            revoto = await grade(
                question=request, answer=plan, context=context, latency_ms=latency_ms
            )
            if _juiz_reprovou(revoto):
                contra += 1
            else:
                a_favor += 1
            # A última avaliação sempre concorda com o veredito final: quem
            # fecha a maioria é quem dá o breakdown que o chamador vê.
            breakdown = revoto
            log.info(
                "agent.regrade",
                trace_id=trace_id,
                contra=contra,
                a_favor=a_favor,
                score=revoto["score"],
            )
        blocked = contra >= 2

    log.info(
        "agent.run",
        trace_id=trace_id,
        score=breakdown["score"],
        blocked=blocked,
        det_errors=len(errors),
        catalog_retries=retries,
        hard_failures=len(breakdown.get("hard_failures", [])),
        latency_ms=latency_ms,
    )
    # Bloqueio sem o PORQUÊ no log custou uma tarde de investigação às cegas:
    # o veredito zerado não dizia qual juiz reprovou nem com que justificativa.
    if blocked:
        log.info(
            "agent.run.blocked_detail",
            trace_id=trace_id,
            hard_failures=breakdown.get("hard_failures", []),
            judges=[
                {"name": j["name"], "score": j["score"], "reason": j.get("reason", "")[:300]}
                for j in breakdown.get("judges", [])
            ],
            det_errors=errors[:10],
        )
    return AgentResult(
        plan=plan,
        score=breakdown["score"],
        grader_breakdown=breakdown,
        deterministic_errors=errors,
        blocked=blocked,
        trace_id=trace_id,
    )
