"""Combina as notas do avaliador e as checagens determinísticas numa nota 0–10."""

from __future__ import annotations

from grader.criteria import GraderCriteria


def combine(*, judge_result: dict, checks: list[dict], criteria: GraderCriteria) -> dict:
    judges_scores: list[dict] = []
    total_weight = 0.0
    weighted_sum = 0.0
    weight_by_name = {c.name: c.weight for c in criteria.judges}

    for item in judge_result.get("criterios", []):
        name = item.get("name")
        score = float(item.get("score", 0))
        weight = weight_by_name.get(name, 1.0)
        judges_scores.append(
            {"name": name, "score": score, "reason": item.get("reason", ""), "weight": weight}
        )
        weighted_sum += score * weight
        total_weight += weight

    judge_avg = weighted_sum / total_weight if total_weight else 0.0
    penalty = sum(c["penalty"] for c in checks if not c["passed"])
    base = max(0.0, min(10.0, judge_avg - penalty))

    # Hard gates: dimensões que, ao reprovar, zeram o veredito. É o que impede a
    # média de compensar segurança clínica ruim com clareza excelente.
    hard_failures: list[dict] = []
    hard_judges = {c.name: c for c in criteria.judges if c.hard_gate}
    for js in judges_scores:
        crit = hard_judges.get(js["name"])
        if crit and js["score"] < crit.hard_gate_min:
            hard_failures.append(
                {
                    "type": "judge",
                    "name": js["name"],
                    "score": js["score"],
                    "min": crit.hard_gate_min,
                }
            )
    for check in checks:
        if check.get("hard") and not check["passed"]:
            hard_failures.append({"type": "check", "name": check["name"]})

    # Um critério com hard gate que o avaliador simplesmente NÃO devolveu não é
    # aprovação: é ausência de veredito. Sem isto, um julgamento truncado que
    # perdesse a linha de segurança passaria como se tivesse sido avaliado.
    judged_names = {js["name"] for js in judges_scores}
    for name in hard_judges:
        if name not in judged_names:
            hard_failures.append({"type": "judge_missing", "name": name})

    final = 0.0 if hard_failures else base

    return {
        "score": round(final, 2),
        "judge_avg": round(judge_avg, 2),
        "penalty": round(penalty, 2),
        "hard_failures": hard_failures,
        "judges": judges_scores,
        "checks": checks,
    }
