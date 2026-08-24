"""O provedor sai do nome do modelo, e nada mais precisa mudar.

Trocar a geração de Claude para GPT foi decisão da fundadora (24/08/2026), pelo
custo: a mesma geração sai por menos da metade. O desenho mantém a troca
reversível por variável de ambiente.
"""

import pytest

from llm import client


@pytest.mark.anyio
async def test_modelo_gpt_vai_para_a_openai(monkeypatch):
    chamado = {}

    async def falso(**kwargs):
        chamado.update(kwargs)
        return "plano"

    monkeypatch.setattr("llm.openai_client.complete", falso)
    r = await client.complete(system="s", user="u", model="gpt-5", max_tokens=100)
    assert r == "plano"
    assert chamado["model"] == "gpt-5"


@pytest.mark.anyio
async def test_modelo_claude_nao_vai_para_a_openai(monkeypatch):
    async def nao_deveria(**kwargs):  # pragma: no cover
        raise AssertionError("modelo Claude não pode ir para a OpenAI")

    monkeypatch.setattr("llm.openai_client.complete", nao_deveria)

    class Falha(RuntimeError):
        pass

    def sem_cliente():
        raise Falha("parou no cliente da Anthropic, como esperado")

    monkeypatch.setattr(client, "get_client", sem_cliente)
    with pytest.raises(Falha):
        await client.complete(system="s", user="u", model="claude-haiku-4-5", max_tokens=100)


def test_blocos_viram_texto():
    from llm.openai_client import _texto

    blocos = [
        {"type": "text", "text": "instruções"},
        {"type": "text", "text": "catálogo", "cache_control": {"type": "ephemeral"}},
    ]
    assert _texto(blocos) == "instruções\n\ncatálogo"
    assert _texto("já é texto") == "já é texto"
