"""Ajuste conversacional do plano.

A pessoa pede um ajuste pontual e o agente responde em português propondo, quando
cabe, um DIFF de operações sobre o plano atual, nunca um plano novo. Quem valida
e aplica é o backend.

A escolha de devolver operações em vez de um plano reescrito é o que torna o
ajuste auditável: dá para mostrar na tela exatamente o que muda, e a pessoa
confirma antes de qualquer coisa acontecer com o treino dela.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from agent.generate import strip_code_fence
from agent.models import CatalogExercise
from agent.validate import VALID_DAYS, VALID_PHASE_TYPES, VALID_SUBTYPES
from core.logging import get_logger
from core.settings import settings
from llm.client import complete

log = get_logger(__name__)

ROOT = Path(__file__).resolve().parents[1]
ADJUST_PROMPT = ROOT / "prompts" / "adjust.md"

_CACHE_CONTROL = {"type": "ephemeral"}

#: Máximo de operações por resposta.
#:
#: Eram 5, com o argumento de que "quinze mudanças não é ajuste, é plano novo por
#: outro caminho". O argumento caiu: o produto passou a permitir QUALQUER
#: alteração no plano pelo chat (decisão da fundadora, ago/2026), e reorganizar
#: uma semana — abrir um dia, distribuir exercícios nele, mover os outros — passa
#: de cinco com facilidade. O teto continua existindo porque resposta sem teto é
#: como uma alucinação vira vinte escritas no banco de uma vez; 20 cobre a
#: reestruturação real e ainda é auditável numa tela.
MAX_OPERATIONS = 20


# --------------------------------------------------------------------------
# Entrada
# --------------------------------------------------------------------------


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class WorkoutAdjustInput(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[ChatMessage] = Field(default_factory=list)
    #: Mesmo formato JSON do plano gerado.
    current_plan: dict = Field(default_factory=dict)
    profile: dict = Field(default_factory=dict)
    flags: list[str] = Field(default_factory=list)
    constraints: dict = Field(default_factory=dict)
    allowed_exercises: list[CatalogExercise] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Operações e saída
# --------------------------------------------------------------------------


class SetPrescription(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    repetitions: str | int | None = None
    rest_time: int | None = Field(default=None, alias="restTime")
    load: str | float | None = None


class ReplaceExerciseOp(BaseModel):
    op: Literal["REPLACE_EXERCISE"]
    target_exercise_id: str
    new_exercise_id: str
    day_of_week: str


class AdjustSetsOp(BaseModel):
    op: Literal["ADJUST_SETS"]
    target_exercise_id: str
    day_of_week: str
    sets: list[SetPrescription] = Field(min_length=1)


class RemoveExerciseOp(BaseModel):
    op: Literal["REMOVE_EXERCISE"]
    target_exercise_id: str
    day_of_week: str


class AddExerciseOp(BaseModel):
    op: Literal["ADD_EXERCISE"]
    day_of_week: str
    phase_type: str
    exercise_id: str
    subtype: str
    sets: list[SetPrescription] = Field(min_length=1)


class MoveWorkoutOp(BaseModel):
    """Move o treino de um dia para outro, trocando com o que estiver lá.

    Existe porque "meu jogo passou de terça para quarta" é o pedido mais comum
    que o chat NÃO atendia: ele mexe na estrutura da semana, então caía na regra
    de "refaça a anamnese", e refazer a anamnese inteira para corrigir um dia
    é desproporcional. Visto em produção (ago/2026): a pessoa aceitou a oferta
    de reorganizar, e recebeu de volta a instrução de recomeçar do zero.

    É a única operação estrutural permitida, e ela é segura por natureza: não
    cria prescrição, não muda volume, não escolhe exercício. Só troca QUANDO, 
    os mesmos treinos, em dias diferentes.
    """

    op: Literal["MOVE_WORKOUT"]
    from_day: str
    to_day: str


class SetDayTypeOp(BaseModel):
    """Abre ou fecha um dia de treino, é como a FREQUÊNCIA semanal muda.

    Fechar (`OFF`) descarta o treino daquele dia. Abrir (`WORKOUT`) cria um dia
    vazio, que só vira treino de verdade com os `ADD_EXERCISE` que vierem na
    mesma resposta: um dia aberto e vazio é pior que nenhum dia, porque aparece
    na agenda prometendo algo que não existe. Quem cobra isso é o backend, na
    aplicação, não o prompt.
    """

    op: Literal["SET_DAY_TYPE"]
    day_of_week: str
    day_type: Literal["WORKOUT", "OFF"]
    #: Obrigatório ao abrir: o nome que a agenda mostra.
    workout_name: str | None = None
    muscle_groups: list[str] = Field(default_factory=list)


#: Vocabulário FECHADO de condições. O modelo não inventa flag clínica: ou a
#: condição está aqui, com o mesmo nome que a anamnese usa, ou a operação é
#: recusada. Uma flag inventada não casa com `CONDITION_TO_FLAG` no backend e
#: viraria uma condição registrada que a classificação de risco não enxerga —
#: o pior desfecho possível, porque parece registrada e não protege ninguém.
CONDICOES_CONHECIDAS = {
    "cardiopatia",
    "hipertensao",
    "diabetes",
    "asma",
    "artrose",
    "osteoporose",
    "depressao_ansiedade",
    "cancer",
    "gestante",
    # As do PAR-Q, que entram por outro campo mas pela mesma porta.
    "dor_no_peito",
    "tontura",
    "problema_osteoarticular",
    "medicacao_pressao",
}


class RecordConditionOp(BaseModel):
    """Registra na anamnese uma condição relatada na conversa.

    Existe por decisão de produto (ago/2026): condição nova relatada no chat
    deixou de mandar a pessoa refazer a anamnese inteira. Ela é registrada aqui,
    e o registro é o que faz a classificação de risco rodar de novo na próxima
    mensagem, inclusive para ENCAMINHAR, se for o caso.

    A operação não prescreve nada. Ela só grava o que a pessoa disse, no mesmo
    campo em que a anamnese gravaria. Quem decide o que fazer com isso continua
    sendo a classificação, e não o modelo.
    """

    op: Literal["RECORD_CONDITION"]
    condition: str
    #: O que a pessoa disse, com as palavras dela. Vai para o detalhe livre.
    detail: str | None = None


class RenameWorkoutOp(BaseModel):
    """Renomeia o treino de um dia.

    Existe por causa das outras: depois de trocar metade dos exercícios de
    "Peito e tríceps", o nome vira mentira. Renomear é a operação mais barata do
    conjunto e a que impede o plano de mentir sobre si mesmo.
    """

    op: Literal["RENAME_WORKOUT"]
    day_of_week: str
    name: str = Field(min_length=1, max_length=60)


AdjustOperation = Annotated[
    Union[
        ReplaceExerciseOp,
        AdjustSetsOp,
        RemoveExerciseOp,
        AddExerciseOp,
        MoveWorkoutOp,
        SetDayTypeOp,
        RenameWorkoutOp,
        RecordConditionOp,
    ],
    Field(discriminator="op"),
]


class LlmAdjustResponse(BaseModel):
    reply: str = Field(min_length=1)
    operations: list[AdjustOperation] = Field(default_factory=list)
    blocked: bool = False
    block_reason: str | None = None


class WorkoutAdjustResult(BaseModel):
    reply: str
    operations: list[AdjustOperation] = Field(default_factory=list)
    blocked: bool = False
    block_reason: str | None = None
    trace_id: str


# --------------------------------------------------------------------------
# Prompt
# --------------------------------------------------------------------------


def _load_adjust_template() -> str:
    if not ADJUST_PROMPT.exists():
        raise FileNotFoundError(f"prompt de ajuste não encontrado em {ADJUST_PROMPT}")
    return ADJUST_PROMPT.read_text(encoding="utf-8")


def _catalog_text(inp: WorkoutAdjustInput) -> str:
    catalog = json.dumps(
        [e.model_dump() for e in inp.allowed_exercises], ensure_ascii=False, indent=2
    )
    return "# Catalogo permitido (use SOMENTE estes exercicios, por id)\n" + catalog


def build_adjust_system(inp: WorkoutAdjustInput) -> list[dict]:
    return [
        {"type": "text", "text": _load_adjust_template()},
        {"type": "text", "text": _catalog_text(inp), "cache_control": _CACHE_CONTROL},
    ]


def build_adjust_user(inp: WorkoutAdjustInput, correction: str | None = None) -> list[dict]:
    payload = {
        "current_plan": inp.current_plan,
        "profile": inp.profile,
        "flags": inp.flags,
        "constraints": inp.constraints,
        "history": [m.model_dump() for m in inp.history],
        "message": inp.message,
    }
    text = (
        "# Plano atual, contexto e conversa (JSON)\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n\n"
        "Responda a mensagem agora, SOMENTE o JSON no formato especificado."
    )
    blocks = [{"type": "text", "text": text}]
    if correction:
        blocks.append({"type": "text", "text": correction})
    return blocks


_PARSE_CORRECTION = (
    "# Correcao obrigatoria\n"
    "A resposta anterior nao era um JSON valido no formato especificado. Responda "
    'novamente APENAS o JSON {"reply", "operations", "blocked", "block_reason"}, '
    "sem nenhum texto fora do JSON."
)


# --------------------------------------------------------------------------
# Validação determinística das operações
# --------------------------------------------------------------------------


def _plan_exercise_ids(current_plan: dict) -> set[str]:
    ids: set[str] = set()
    for day in current_plan.get("days") or []:
        if not isinstance(day, dict):
            continue
        workout = day.get("workout") or {}
        for phase in workout.get("phases") or []:
            if not isinstance(phase, dict):
                continue
            for exercise in phase.get("exercises") or []:
                if isinstance(exercise, dict) and exercise.get("exerciseId"):
                    ids.add(exercise["exerciseId"])
    return ids


def _plan_days(current_plan: dict) -> dict[str, bool]:
    """Dias do plano → tem treino? Serve para `MOVE_WORKOUT` não citar dia que não existe."""
    dias: dict[str, bool] = {}
    for day in current_plan.get("days") or []:
        if isinstance(day, dict) and day.get("dayOfWeek"):
            dias[day["dayOfWeek"]] = bool(day.get("workout"))
    return dias


def validate_operations(operations: list[AdjustOperation], inp: WorkoutAdjustInput) -> list[str]:
    """Violações determinísticas das operações. Vazia = aprovado.

    Falha aqui NÃO é erro do serviço: vira resposta bloqueada no chat, com motivo
    legível. A pessoa reformula; ninguém vê "erro interno".
    """
    errors: list[str] = []

    if len(operations) > MAX_OPERATIONS:
        errors.append(f"excesso_de_operacoes: {len(operations)} (maximo {MAX_OPERATIONS})")

    allowed_ids = {e.id for e in inp.allowed_exercises}
    plan_ids = _plan_exercise_ids(inp.current_plan)

    dias_do_plano = _plan_days(inp.current_plan)

    for i, op in enumerate(operations):
        prefix = f"op[{i}]({op.op})"

        if isinstance(op, MoveWorkoutOp):
            for campo, dia in (("from_day", op.from_day), ("to_day", op.to_day)):
                if dia not in VALID_DAYS:
                    errors.append(f"{prefix} {campo}_invalido: {dia}")
                elif dia not in dias_do_plano:
                    errors.append(f"{prefix} {campo}_fora_do_plano: {dia}")
            if op.from_day == op.to_day:
                errors.append(f"{prefix} dias_iguais: {op.from_day}")
            # Mover um dia de descanso para cima de outro descanso não é ajuste,
            # é ruído: nada muda e a pessoa confirma uma mudança inexistente.
            if op.from_day in dias_do_plano and not dias_do_plano.get(op.from_day):
                errors.append(f"{prefix} origem_sem_treino: {op.from_day}")
            continue

        if op.day_of_week not in VALID_DAYS:
            errors.append(f"{prefix} day_of_week_invalido: {op.day_of_week}")

        target_id = getattr(op, "target_exercise_id", None)
        if target_id is not None and target_id not in plan_ids:
            errors.append(f"{prefix} target_fora_do_plano: {target_id}")

        if isinstance(op, ReplaceExerciseOp) and op.new_exercise_id not in allowed_ids:
            errors.append(f"{prefix} exercicio_fora_do_catalogo: {op.new_exercise_id}")

        if isinstance(op, AddExerciseOp):
            if op.exercise_id not in allowed_ids:
                errors.append(f"{prefix} exercicio_fora_do_catalogo: {op.exercise_id}")
            if op.phase_type not in VALID_PHASE_TYPES:
                errors.append(f"{prefix} phase_type_invalido: {op.phase_type}")
            if op.subtype not in VALID_SUBTYPES:
                errors.append(f"{prefix} subtype_invalido: {op.subtype}")

        if isinstance(op, RecordConditionOp):
            if op.condition not in CONDICOES_CONHECIDAS:
                errors.append(f"{prefix} condicao_desconhecida: {op.condition}")
            continue

        if isinstance(op, SetDayTypeOp) and op.day_type == "WORKOUT" and not op.workout_name:
            errors.append(f"{prefix} abertura_sem_nome")

        if isinstance(op, RenameWorkoutOp) and not dias_do_plano.get(op.day_of_week):
            # Renomear descanso é renomear o que não existe.
            abre_no_lote = any(
                isinstance(o, SetDayTypeOp)
                and o.day_of_week == op.day_of_week
                and o.day_type == "WORKOUT"
                for o in operations
            )
            if not abre_no_lote:
                errors.append(f"{prefix} dia_sem_treino: {op.day_of_week}")

    return errors + _erros_entre_operacoes(operations)


def _erros_entre_operacoes(operations: list[AdjustOperation]) -> list[str]:
    """Violações que só existem no CONJUNTO, não em cada operação isolada.

    Um dia aberto e vazio é o caso que importa: `SET_DAY_TYPE` sozinho passa em
    qualquer verificação individual e produz uma agenda que promete treino e
    entrega nada. Só olhando o lote inteiro dá para ver que faltou exercício.
    """
    errors: list[str] = []
    abertos = {
        op.day_of_week
        for op in operations
        if isinstance(op, SetDayTypeOp) and op.day_type == "WORKOUT"
    }
    com_exercicio = {
        op.day_of_week for op in operations if isinstance(op, AddExerciseOp)
    }
    for dia in sorted(abertos - com_exercicio):
        errors.append(f"dia_aberto_sem_exercicio: {dia}")
    return errors


# --------------------------------------------------------------------------
# Pipeline do ajuste
# --------------------------------------------------------------------------


def _parse_llm_response(raw: str) -> LlmAdjustResponse:
    data = json.loads(strip_code_fence(raw))
    if not isinstance(data, dict):
        raise ValueError("resposta do modelo não é um objeto JSON")
    return LlmAdjustResponse(**data)


async def _complete_adjust(inp: WorkoutAdjustInput, correction: str | None = None) -> str:
    return await complete(
        system=build_adjust_system(inp),
        user=build_adjust_user(inp, correction),
        model=settings.llm_chat_model,
        max_tokens=settings.llm_max_tokens,
        effort=settings.llm_effort,
    )


# As respostas fixas seguem a mesma regra do prompt: duas frases, o limite e o
# caminho. Elas são as que mais aparecem na tela, e eram as mais longas.
_UNSAFE_REPLY = "Não consegui aplicar esse ajuste com segurança. Me diga de outra forma o que quer mudar."

_OUT_OF_SCOPE_REPLY = (
    "Aqui eu troco exercício, ajusto séries, repetições e descanso, removo ou incluo um. "
    "Treino novo ou mais um dia: atualize a anamnese e gere um plano."
)


async def adjust_plan(inp: WorkoutAdjustInput) -> WorkoutAdjustResult:
    """Roda o ajuste e devolve a resposta com o diff já validado."""
    trace_id = uuid.uuid4().hex

    raw = await _complete_adjust(inp)
    try:
        parsed = _parse_llm_response(raw)
    except (ValueError, ValidationError) as exc:
        log.warning("agent.adjust.parse_retry", trace_id=trace_id, error_type=type(exc).__name__)
        raw = await _complete_adjust(inp, correction=_PARSE_CORRECTION)
        try:
            parsed = _parse_llm_response(raw)
        except ValidationError as exc2:
            # JSON legível, mas operações fora do contrato — tipicamente o modelo
            # inventando uma operação para atender a um pedido que não cabe no
            # ajuste. Degrada para resposta bloqueada no chat em vez de estourar
            # e virar "erro interno" na tela.
            log.warning(
                "agent.adjust.invalid_operations_fallback",
                trace_id=trace_id,
                error_type=type(exc2).__name__,
            )
            return WorkoutAdjustResult(
                reply=_OUT_OF_SCOPE_REPLY,
                operations=[],
                blocked=True,
                block_reason=f"operacoes fora do contrato apos retry: {exc2.error_count()} erro(s)",
                trace_id=trace_id,
            )
        except ValueError as exc2:
            raise ValueError(
                f"resposta do modelo inválida após retry: {type(exc2).__name__}: {exc2}"
            ) from exc2

    # Recusa que o próprio modelo sinalizou: nunca propaga operações junto.
    if parsed.blocked:
        log.info("agent.adjust", trace_id=trace_id, blocked=True, operations=0)
        return WorkoutAdjustResult(
            reply=parsed.reply,
            operations=[],
            blocked=True,
            block_reason=parsed.block_reason or "pedido recusado por segurança",
            trace_id=trace_id,
        )

    errors = validate_operations(parsed.operations, inp)
    if errors:
        log.warning("agent.adjust.deterministic_block", trace_id=trace_id, errors=errors)
        return WorkoutAdjustResult(
            reply=_UNSAFE_REPLY,
            operations=[],
            blocked=True,
            block_reason="; ".join(errors),
            trace_id=trace_id,
        )

    log.info("agent.adjust", trace_id=trace_id, blocked=False, operations=len(parsed.operations))
    return WorkoutAdjustResult(
        reply=parsed.reply,
        operations=parsed.operations,
        blocked=False,
        block_reason=None,
        trace_id=trace_id,
    )
