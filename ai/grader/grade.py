"""Avaliação completa: modelo-juiz + checagens determinísticas, combinados."""

from __future__ import annotations

from core.settings import settings
from grader.criteria import load_criteria
from grader.deterministic import run_checks
from grader.judge import judge
from grader.score import combine


async def grade(*, question: str, answer: str, context: str, latency_ms: int = 0) -> dict:
    criteria = load_criteria()

    # Desligar o avaliador é para desenvolvimento e teste. Nota 10 sem julgar não
    # é "aprovado": é "não avaliado" — e o pipeline registra isso no breakdown.
    if not settings.grader_enabled:
        return {
            "score": 10.0,
            "judge_avg": 10.0,
            "penalty": 0.0,
            "hard_failures": [],
            "judges": [],
            "checks": [],
            "skipped": True,
        }

    judged = await judge(
        question=question, answer=answer, context=context, criteria=criteria.judges
    )
    checks = run_checks(answer=answer, latency_ms=latency_ms, checks=criteria.checks)
    return combine(judge_result=judged, checks=checks, criteria=criteria)
