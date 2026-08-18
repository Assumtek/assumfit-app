"""Validação determinística do plano: estrutura + catálogo.

É a camada que NÃO depende de modelo nenhum. Garante que todo exercício
prescrito existe no catálogo permitido, e ao falhar bloqueia o plano.

A mesma checagem acontece de novo no backend, perto do Prisma, e uma terceira
vez na chave estrangeira da tabela. Redundância deliberada: um id inventado que
chegasse ao banco viraria um treino que a tela não consegue renderizar, e a
pessoa descobriria isso no meio da academia.
"""

from __future__ import annotations

import json

from agent.models import WorkoutGenerationInput

VALID_DAYS = {"MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"}
VALID_DAY_TYPES = {"WORKOUT", "OFF"}
VALID_PHASE_TYPES = {"ALONGAMENTO", "TREINO", "CARDIO"}
VALID_SUBTYPES = {"STRENGTH", "CARDIO", "MOBILITY"}

#: Prefixos de erro que indicam id fora do catálogo. São mecânicos — o pipeline
#: re-gera com correção em vez de bloquear direto.
CATALOG_ERROR_PREFIXES = ("exercicio_fora_do_catalogo", "used_id_fora_do_catalogo")

# Erros MECÂNICOS: o modelo errou a forma, não o juízo clínico. Valem uma nova
# tentativa antes de gastar avaliação e devolver veredito reprovado.
#
# `json_invalido` entrou depois de um caso em produção (ago/2026): a saída veio
# com um delimitador faltando na linha 61, o plano foi descartado inteiro e a
# pessoa recebeu "não deu para gerar" por um erro de vírgula. Uma falha de
# formatação é o exemplo mais puro do que se resolve pedindo de novo.
MECHANICAL_ERROR_PREFIXES = CATALOG_ERROR_PREFIXES + ("json_invalido",)


def validate_plan(plan_json: str, inp: WorkoutGenerationInput) -> list[str]:
    """Lista de violações. Vazia = aprovado nesta camada."""
    errors: list[str] = []

    try:
        plan = json.loads(plan_json)
    except json.JSONDecodeError as exc:
        return [f"json_invalido: {exc}"]

    if not isinstance(plan, dict):
        return ["plano_nao_e_objeto"]

    status = plan.get("status")
    if status == "REFERRAL":
        # Encaminhamento é saída válida: exige motivo e nenhum dia prescrito.
        if not plan.get("referral_reason"):
            errors.append("referral_sem_motivo")
        if plan.get("days"):
            errors.append("referral_com_dias")
        return errors
    if status != "GENERATED":
        errors.append(f"status_invalido: {status}")

    allowed_ids = {e.id for e in inp.allowed_exercises}

    days = plan.get("days")
    if not isinstance(days, list) or not days:
        errors.append("days_vazio_ou_invalido")
        return errors

    seen_days: set[str] = set()
    for day in days:
        if not isinstance(day, dict):
            errors.append("dia_nao_e_objeto")
            continue

        day_of_week = day.get("dayOfWeek")
        if day_of_week not in VALID_DAYS:
            errors.append(f"dayOfWeek_invalido: {day_of_week}")
        elif day_of_week in seen_days:
            # O plano vira uma linha por (plano, dia) no banco: um dia repetido
            # violaria a unicidade lá e derrubaria a transação inteira.
            errors.append(f"dayOfWeek_duplicado: {day_of_week}")
        else:
            seen_days.add(day_of_week)

        day_type = day.get("dayType")
        if day_type not in VALID_DAY_TYPES:
            errors.append(f"dayType_invalido: {day_type}")
        if day_type == "OFF":
            continue

        workout = day.get("workout") or {}
        if not workout.get("name"):
            errors.append(f"workout_sem_nome: {day_of_week}")

        phases = workout.get("phases") or []
        if not phases:
            errors.append(f"workout_sem_fases: {day_of_week}")

        for phase in phases:
            if phase.get("type") not in VALID_PHASE_TYPES:
                errors.append(f"phase_type_invalido: {phase.get('type')}")
            for exercise in phase.get("exercises", []):
                if exercise.get("subtype") not in VALID_SUBTYPES:
                    errors.append(f"subtype_invalido: {exercise.get('subtype')}")
                exercise_id = exercise.get("exerciseId")
                if not exercise_id or exercise_id not in allowed_ids:
                    errors.append(f"exercicio_fora_do_catalogo: {exercise_id}")

    missing = VALID_DAYS - seen_days
    if missing:
        errors.append(f"dias_faltando: {','.join(sorted(missing))}")

    for exercise_id in plan.get("used_exercise_ids") or []:
        if exercise_id not in allowed_ids:
            errors.append(f"used_id_fora_do_catalogo: {exercise_id}")

    return errors


def catalog_errors(errors: list[str]) -> list[str]:
    """Filtra só as violações de catálogo."""
    return [e for e in errors if e.startswith(CATALOG_ERROR_PREFIXES)]


def mechanical_errors(errors: list[str]) -> list[str]:
    """Os erros de FORMA — catálogo e JSON —, que valem re-gerar."""
    return [e for e in errors if e.startswith(MECHANICAL_ERROR_PREFIXES)]


def json_errors(errors: list[str]) -> list[str]:
    """Só as falhas de parse, para a instrução de correção ser específica."""
    return [e for e in errors if e.startswith("json_invalido")]
