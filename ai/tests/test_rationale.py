import pytest

import agent.rationale as mod
from agent.rationale import reescrever_para_pessoa, tem_jargao

TECNICO = (
    "Perfil sem contraindicações (TIER_0, sem flags) e sem sinalização clínica: hierarquia "
    "de segurança permite prescrição, mas como a conta é nova (0 sessões registradas) o "
    "nível 'avançado' não pôde ser confirmado. Split Upper/Lower x2 (ACSM 12ª ed. e "
    "Schoenfeld et al. 2016) com RIR 2-3 (Zourdos et al.) e deload a cada 5-6 semanas."
)

HUMANO = (
    "Montei cinco treinos por semana, cada grupo muscular trabalhado duas vezes. Comecei por "
    "máquinas e halteres para você fixar a execução antes de subir carga. Nas duas primeiras "
    "semanas, pare com 3 a 4 repetições ainda no tanque; depois, com 2 a 3. A cada cinco ou "
    "seis semanas vem uma semana mais leve para o corpo assentar."
)


def test_detecta_jargao_no_texto_do_relato():
    assert tem_jargao(TECNICO)


def test_texto_para_a_pessoa_passa():
    assert not tem_jargao(HUMANO)


def test_sigla_traduzida_nao_conta():
    assert not tem_jargao("pare com 2 a 3 repetições ainda no tanque")
    assert tem_jargao("mantenha RIR 2-3 em todas as séries")


@pytest.mark.asyncio
async def test_reescreve_e_aceita_quando_limpo(monkeypatch):
    chamadas = []

    async def fake(**kw):
        chamadas.append(kw)
        return HUMANO

    monkeypatch.setattr(mod, "complete", fake)
    assert await reescrever_para_pessoa(TECNICO) == HUMANO
    assert len(chamadas) == 1
    assert "TIER_0" in chamadas[0]["user"]


@pytest.mark.asyncio
async def test_tenta_duas_vezes_e_fica_com_a_melhor(monkeypatch):
    respostas = iter(["Treino com RIR 2-3 e deload.", "Treino com RIR 2 ainda."])

    async def fake(**kw):
        return next(respostas)

    monkeypatch.setattr(mod, "complete", fake)
    saida = await reescrever_para_pessoa(TECNICO)
    # Duas tentativas com jargão: fica a última, que ainda é mais curta que o original.
    assert saida == "Treino com RIR 2 ainda."


@pytest.mark.asyncio
async def test_falha_do_modelo_devolve_o_original(monkeypatch):
    async def fake(**kw):
        raise RuntimeError("sem rede")

    monkeypatch.setattr(mod, "complete", fake)
    assert await reescrever_para_pessoa(TECNICO) == TECNICO


@pytest.mark.asyncio
async def test_vazio_continua_vazio():
    assert await reescrever_para_pessoa("") == ""
