"""Critérios de avaliação do plano, lidos de `prompts/grader.yaml`.

Ficam em YAML e não em código porque são calibração, não lógica: os pesos e o
limiar do hard gate vão mudar conforme os planos reais forem observados, e isso
não deveria pedir deploy de código.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
CRITERIA_FILE = ROOT / "prompts" / "grader.yaml"


class Criterion(BaseModel):
    name: str
    description: str
    weight: float = 1.0
    #: Dimensão que, ao reprovar, ZERA o veredito — independente da média
    #: ponderada. Sem isto, um plano com segurança 4 e clareza 10 passaria pela
    #: média, e é exatamente o plano que não pode passar.
    hard_gate: bool = False
    hard_gate_min: float = 7.0


class DeterministicCheck(BaseModel):
    name: str
    #: regex_forbid | regex_require | max_latency_ms | json_schema
    kind: str
    value: str | int | dict
    penalty: float = 1.0
    hard: bool = False


class GraderCriteria(BaseModel):
    min_score: float = 7.0
    judges: list[Criterion] = Field(default_factory=list)
    checks: list[DeterministicCheck] = Field(default_factory=list)


@lru_cache
def load_criteria() -> GraderCriteria:
    data = yaml.safe_load(CRITERIA_FILE.read_text(encoding="utf-8")) or {}
    return GraderCriteria(**data)
