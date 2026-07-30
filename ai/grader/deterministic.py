"""Checagens que não dependem de modelo nenhum: regex, JSON e latência."""

from __future__ import annotations

import json
import re
from typing import Iterable

from grader.criteria import DeterministicCheck


def run_checks(
    *,
    answer: str,
    latency_ms: int,
    checks: Iterable[DeterministicCheck],
) -> list[dict]:
    results: list[dict] = []
    for check in checks:
        passed, detail = _evaluate(check, answer=answer, latency_ms=latency_ms)
        results.append(
            {
                "name": check.name,
                "kind": check.kind,
                "passed": passed,
                "penalty": 0.0 if passed else check.penalty,
                "hard": check.hard,
                "detail": detail,
            }
        )
    return results


def _evaluate(check: DeterministicCheck, *, answer: str, latency_ms: int) -> tuple[bool, str]:
    if check.kind == "regex_forbid":
        hit = re.search(str(check.value), answer)
        return (hit is None, f"matched={bool(hit)}")
    if check.kind == "regex_require":
        hit = re.search(str(check.value), answer)
        return (hit is not None, f"matched={bool(hit)}")
    if check.kind == "max_latency_ms":
        return (latency_ms <= int(check.value), f"latency_ms={latency_ms}")
    if check.kind == "json_schema":
        try:
            json.loads(answer)
            return (True, "valid_json")
        except json.JSONDecodeError as exc:
            return (False, f"invalid_json: {exc}")
    return (False, f"unknown_kind={check.kind}")
