"""API do modelo AssumFit.

Serviço sem estado: recebe o que precisa no corpo, calcula e devolve. Quem lê e
escreve no banco é o backend Node — manter a persistência num lugar só evita
duas conexões concorrentes ao mesmo dado e mantém este serviço trivial de testar.
"""

from __future__ import annotations

from typing import Literal

from fastapi import Body, FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from models import chronotype as chrono
from models.bio_age import calc_bio_age
from models.energy_score import CALIBRATION_DAYS, calc_energy
from models.correlations import sleep_onset_vs_next_hrv, steps_vs_deep_sleep, water_vs_energy
from models.insight import build as build_insight
from models.insight_llm import Facts, write as write_insight
from models.lifestyle import Lifestyle, chronotype_from, circadian_shift

app = FastAPI(title="AssumFit AI", version="1.0.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


class EnergyInput(BaseModel):
    hrv_ms: float = Field(gt=0, le=400)
    #: Ausente quando não há leitura de sono da noite. O peso é redistribuído —
    #: ver `energy_score._components`.
    sleep_score: float | None = Field(default=None, ge=0, le=100)
    resting_hr: float = Field(gt=20, le=240)
    temperature_c: float = Field(default=36.6, ge=25, le=45)
    hour: int = Field(ge=0, le=23)
    #: Ausente enquanto não houver histórico suficiente.
    hrv_baseline: float | None = None
    chronotype: Literal["matutino", "vespertino", "intermediario"] = "intermediario"
    #: Água registrada hoje. Ausente = sem registro, entra neutra.
    water_ml: float | None = Field(default=None, ge=0, le=20000)
    water_goal_ml: float = Field(default=2500, gt=0, le=20000)
    #: Dia da semana no padrão do JavaScript: 0 = domingo. Sem ele o contexto de
    #: treino não é gerado — o modelo não tem relógio próprio, é sem estado.
    weekday: int | None = Field(default=None, ge=0, le=6)
    lifestyle: LifestyleInput | None = None


class LifestyleInput(BaseModel):
    occupation: str | None = None
    work_posture: Literal["sitting", "standing", "alternating", "moving"] | None = None
    posture_hours: int | None = Field(default=None, ge=0, le=24)
    work_schedule: Literal["business", "shifts", "night", "flexible"] | None = None
    bedtime: float | None = Field(default=None, ge=0, lt=24)
    exercises: Literal["regular", "sometimes", "none"] | None = None
    activities: list[str] = Field(default=[], max_length=10)
    train_days: list[int] = Field(default=[], max_length=7)
    train_period: str | None = None
    goal: str | None = None


def _lifestyle(data: EnergyInput) -> Lifestyle | None:
    if data.lifestyle is None:
        return None
    return Lifestyle(**data.lifestyle.model_dump())


def _energy(data: EnergyInput):
    return calc_energy(
        hrv_ms=data.hrv_ms,
        sleep_score=data.sleep_score,
        resting_hr=data.resting_hr,
        temperature_c=data.temperature_c,
        hour=data.hour,
        hrv_baseline=data.hrv_baseline,
        # O cronótipo declarado tem precedência sobre a estimativa do perfil; a
        # estimativa só existe para a primeira semana, antes de haver noites
        # medidas suficientes para o cálculo observado.
        chronotype=data.chronotype if data.chronotype != "intermediario" else chronotype_from(_lifestyle(data)),
        water_ml=data.water_ml,
        water_goal_ml=data.water_goal_ml,
        circadian_shift=circadian_shift(_lifestyle(data)),
    )


@app.post("/energy/score")
def energy_score(data: EnergyInput) -> dict:
    return {**_energy(data).to_dict(), "calibration_days": CALIBRATION_DAYS}


def _redigir(energy, hour, *, calibration_days=7, lifestyle=None, weekday=None):
    """Molde primeiro, LLM por cima — nesta ordem, sempre.

    O determinístico é calculado ANTES de qualquer chamada de rede, e é o que
    volta se o modelo falhar, demorar ou responder algo implausível. Assim a
    tela inicial nunca depende de a API estar no ar.

    O LLM não recalcula nada: recebe os fatos que o molde já apurou — score,
    sinal dominante com o valor formatado, transição — e apenas os redige.
    """
    molde = build_insight(
        energy, hour, calibration_days=calibration_days, lifestyle=lifestyle, weekday=weekday
    )

    escrito = write_insight(
        Facts(
            score=energy.score,
            level=energy.level,
            calibrating=energy.calibrating,
            driver=_par(energy, molde.driver_key) if molde.driver_key else None,
            lift=None,
            next_label=molde.next_label,
            hour=hour,
            routine=molde.context,
        ),
        molde,
    )
    return escrito or molde


def _par(energy, key):
    """Nome legível e valor formatado do componente — o que o modelo pode citar."""
    for c in energy.components:
        if c.key == key:
            return (c.label, c.value)
    return None


@app.post("/energy/insight")
def energy_insight(data: EnergyInput) -> dict:
    """Score mais o texto que a tela inicial exibe.

    Um endpoint só, e não dois, porque o insight é função do MESMO cálculo: pedir
    score e texto separados faria o app somar duas latências para exibir uma
    tela, e abriria a chance de os dois virem de estados diferentes se uma
    leitura entrasse no meio.
    """
    result = _energy(data)
    return {
        **result.to_dict(),
        "calibration_days": CALIBRATION_DAYS,
        "insight": _redigir(
            result,
            data.hour,
            calibration_days=CALIBRATION_DAYS,
            lifestyle=_lifestyle(data),
            weekday=data.weekday,
        ).to_dict(),
    }


class BioAgeInput(BaseModel):
    real_age: int = Field(ge=16, le=110)
    sex: Literal["f", "m"]
    hrv_ms: float = Field(gt=0, le=400)
    resting_hr: float = Field(gt=20, le=240)
    spo2_pct: float = Field(ge=50, le=100)
    deep_sleep_pct: float = Field(ge=0, le=1)
    temp_range_c: float = Field(default=0.7, ge=0, le=10)


@app.post("/bioage/calcular")
def bioage(data: BioAgeInput) -> dict:
    return calc_bio_age(
        real_age=data.real_age,
        sex=data.sex,
        hrv_ms=data.hrv_ms,
        resting_hr=data.resting_hr,
        spo2_pct=data.spo2_pct,
        deep_sleep_pct=data.deep_sleep_pct,
        temp_range_c=data.temp_range_c,
    ).to_dict()


class NightInput(BaseModel):
    sleep_onset: float = Field(ge=0, lt=24)
    wake_time: float = Field(ge=0, lt=24)


#: Teto de itens por lista.
#:
#: Sem ele, um corpo com dez milhões de elementos derruba o processo por
#: memória — e este serviço não tem autenticação própria, então o teto é a
#: única barreira. Um ano de noites cabe folgado em 400.
MAX_ITEMS = 400


@app.post("/chronotype")
def chronotype(nights: list[NightInput] = Body(max_length=MAX_ITEMS)) -> dict:
    return chrono.identify([chrono.Night(sleep_onset=n.sleep_onset, wake_time=n.wake_time) for n in nights]).to_dict()


class CorrelationInput(BaseModel):
    sleep_onsets: list[float] = Field(default=[], max_length=MAX_ITEMS)
    next_day_hrv: list[float] = Field(default=[], max_length=MAX_ITEMS)
    water_ml: list[float] = Field(default=[], max_length=MAX_ITEMS)
    energy_scores: list[float] = Field(default=[], max_length=MAX_ITEMS)
    steps: list[float] = Field(default=[], max_length=MAX_ITEMS)
    deep_sleep_pct: list[float] = Field(default=[], max_length=MAX_ITEMS)


@app.post("/insights")
def insights(data: CorrelationInput) -> dict:
    """Só devolve o que passa em amostra mínima e significância.

    Lista vazia é resposta legítima — e preferível a um insight fabricado sobre
    coincidência, que o usuário usaria para mudar hábito.
    """
    found = [
        sleep_onset_vs_next_hrv(data.sleep_onsets, data.next_day_hrv)
        if len(data.sleep_onsets) == len(data.next_day_hrv)
        else None,
        water_vs_energy(data.water_ml, data.energy_scores) if len(data.water_ml) == len(data.energy_scores) else None,
        steps_vs_deep_sleep(data.steps, data.deep_sleep_pct) if len(data.steps) == len(data.deep_sleep_pct) else None,
    ]
    return {"insights": [i.to_dict() for i in found if i is not None]}


# ==========================================================================
# AGENTE DE TREINO
#
# Os endpoints acima são função pura: entram números, saem números, sem estado
# e sem rede. Estes dois são de outra natureza — chamam um modelo de linguagem,
# levam de 50 a 120 segundos e custam dinheiro por chamada. Ficam no mesmo
# serviço porque compartilham o deploy e o Python; não porque sejam parecidos.
#
# Quem persiste continua sendo o backend Node. Aqui não há banco.
# ==========================================================================

from agent.adjust import WorkoutAdjustInput, adjust_plan
from agent.extract import ExtractInput, extract_answers
from agent.models import WorkoutGenerationInput
from agent.pipeline import run_agent
from core.logging import get_logger
from llm.client import LlmRefusal

_log = get_logger("agent.http")


@app.post("/agent/generate")
async def agent_generate(data: WorkoutGenerationInput) -> JSONResponse:
    """Gera o plano e devolve o veredito do avaliador junto.

    O `blocked` é a resposta, não o erro: um plano reprovado no gate é um
    desfecho previsto do produto, e quem decide o que fazer com ele é o backend.
    """
    try:
        result = await run_agent(data)
    except LlmRefusal as exc:
        # Recusa do classificador: não houve plano para julgar. É falha técnica,
        # não plano ruim — o backend reprocessa em vez de marcar como reprovado.
        _log.error("agent.http.generate.refusal", category=exc.category)
        return JSONResponse(
            {"error": "recusa do modelo", "detail": str(exc), "retryable": True},
            status_code=502,
        )
    except Exception as exc:  # noqa: BLE001
        # Sem este wrap, qualquer falha vira o 500 opaco do framework, sem log e
        # sem causa. O 502 diz ao backend que a dependência falhou — reprocessa,
        # não marca o treino como reprovado.
        _log.error(
            "agent.http.generate.failed",
            error_type=type(exc).__name__,
            error=str(exc),
            exc_info=True,
        )
        return JSONResponse(
            {"error": "falha ao gerar o plano", "detail": f"{type(exc).__name__}: {exc}"},
            status_code=502,
        )

    _log.info("agent.http.generate", trace_id=result.trace_id, blocked=result.blocked)
    return JSONResponse(
        {
            "plan": result.plan,
            "score": result.score,
            "blocked": result.blocked,
            "deterministic_errors": result.deterministic_errors,
            "trace_id": result.trace_id,
            "grader_breakdown": result.grader_breakdown,
        }
    )


@app.post("/agent/extract")
async def agent_extract(data: ExtractInput) -> JSONResponse:
    """Extrai respostas do roteiro a partir da fala livre da anamnese."""
    try:
        answers = await extract_answers(data)
    except Exception as exc:  # noqa: BLE001
        # Extração é ACELERADOR, não portão: falhou, a entrevista pergunta tudo.
        # Devolver 200 vazio em vez de 502 é o que mantém essa degradação suave.
        _log.error("agent.http.extract.failed", error_type=type(exc).__name__, error=str(exc))
        return JSONResponse({"answers": {}})
    return JSONResponse({"answers": answers})


@app.post("/agent/adjust")
async def agent_adjust(data: WorkoutAdjustInput) -> JSONResponse:
    """Ajuste conversacional: devolve a resposta e o diff de operações."""
    try:
        result = await adjust_plan(data)
    except LlmRefusal as exc:
        _log.error("agent.http.adjust.refusal", category=exc.category)
        return JSONResponse(
            {"error": "recusa do modelo", "detail": str(exc), "retryable": True},
            status_code=502,
        )
    except Exception as exc:  # noqa: BLE001
        _log.error(
            "agent.http.adjust.failed",
            error_type=type(exc).__name__,
            error=str(exc),
            exc_info=True,
        )
        return JSONResponse(
            {"error": "falha ao ajustar o plano", "detail": f"{type(exc).__name__}: {exc}"},
            status_code=502,
        )

    _log.info("agent.http.adjust", trace_id=result.trace_id, blocked=result.blocked)
    return JSONResponse(result.model_dump(mode="json"))
