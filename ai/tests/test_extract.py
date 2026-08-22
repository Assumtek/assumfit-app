"""A validação da extração é NOSSA, não do prompt — e é ela que se testa aqui."""

import pytest

import agent.extract as extract_mod
from agent.extract import ExtractInput, ExtractQuestion, extract_answers


def _input():
    return ExtractInput(
        text="quero ganhar massa, treino em academia",
        questions=[
            ExtractQuestion(id="goal", label="Objetivo", options=["Ganhar massa", "Perder peso"]),
            ExtractQuestion(id="trainPlace", label="Local", options=["Academia", "Ao ar livre"]),
            ExtractQuestion(id="medications", label="Medicamentos", options=None),
        ],
    )


def _fake_complete(payload: str):
    async def fake(**_kwargs):
        return payload

    return fake


@pytest.mark.anyio
async def test_descarta_opcao_fora_da_lista(monkeypatch):
    # O modelo "extraiu" um valor que não é opção — o código barra, mesmo que o
    # prompt tenha falhado. É a linha entre orientar e garantir.
    monkeypatch.setattr(extract_mod, "complete", _fake_complete('{"goal": "Hipertrofia"}'))
    assert await extract_answers(_input()) == {}


@pytest.mark.anyio
async def test_aceita_opcao_canonica_e_texto_livre(monkeypatch):
    monkeypatch.setattr(
        extract_mod,
        "complete",
        _fake_complete('{"goal": "Ganhar massa", "medications": "losartana"}'),
    )
    assert await extract_answers(_input()) == {"goal": "Ganhar massa", "medications": "losartana"}


@pytest.mark.anyio
async def test_ignora_chave_desconhecida_e_lixo(monkeypatch):
    monkeypatch.setattr(
        extract_mod,
        "complete",
        _fake_complete('{"heartCondition": "Não", "goal": 42, "trainPlace": ""}'),
    )
    # `heartCondition` não estava na lista extraível — PAR-Q nunca está — e os
    # outros dois são tipos/valores inválidos.
    assert await extract_answers(_input()) == {}


@pytest.mark.anyio
async def test_json_quebrado_degrada_para_vazio(monkeypatch):
    monkeypatch.setattr(extract_mod, "complete", _fake_complete("desculpe, não sei"))
    assert await extract_answers(_input()) == {}


@pytest.mark.anyio
async def test_cerca_de_markdown_e_tolerada(monkeypatch):
    monkeypatch.setattr(
        extract_mod, "complete", _fake_complete('```json\n{"goal": "Ganhar massa"}\n```')
    )
    assert await extract_answers(_input()) == {"goal": "Ganhar massa"}


from agent.extract import frequencia_explicita


def test_prazo_nao_e_frequencia():
    assert not frequencia_explicita("quero hipertrofia em 3 meses, foco em ombros", "3")
    assert not frequencia_explicita("em 3 semanas viajo", "3")


def test_frequencia_explicita_nas_formas_comuns():
    assert frequencia_explicita("consigo treinar 4 vezes por semana", "4")
    assert frequencia_explicita("treino 3x por semana", "3")
    assert frequencia_explicita("uns 5 dias na semana", "5")
    assert frequencia_explicita("2 treinos por semana", "2")
    # Outro número na frase não empresta a frequência.
    assert not frequencia_explicita("consigo treinar 4 vezes por semana", "3")


@pytest.mark.asyncio
async def test_days_per_week_sem_frequencia_na_fala_e_descartado(monkeypatch):
    async def fake(**_):
        return '{"daysPerWeek": "3"}'

    monkeypatch.setattr("agent.extract.complete", fake)
    entrada = ExtractInput(
        text="quero hipertrofia em 3 meses",
        questions=[ExtractQuestion(id="daysPerWeek", label="Dias por semana", options=["2", "3", "4", "5"])],
    )
    assert await extract_answers(entrada) == {}


@pytest.mark.asyncio
async def test_days_per_week_com_frequencia_na_fala_passa(monkeypatch):
    async def fake(**_):
        return '{"daysPerWeek": "3"}'

    monkeypatch.setattr("agent.extract.complete", fake)
    entrada = ExtractInput(
        text="treino 3 vezes por semana",
        questions=[ExtractQuestion(id="daysPerWeek", label="Dias por semana", options=["2", "3", "4", "5"])],
    )
    assert await extract_answers(entrada) == {"daysPerWeek": "3"}
