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


def test_imagem_vira_data_uri_para_a_openai():
    """A foto da refeição não pode sumir na conversão.

    Ela chega no formato da Anthropic (`image` + `source` base64). Se o
    conversor a descartasse, o modelo responderia sobre uma foto que nunca
    viu, e o número que sai daí é o que a pessoa lê como caloria do prato.
    """
    from llm.openai_client import _partes

    blocos = [
        {"type": "text", "text": "o que tem no prato?"},
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "QUJD"}},
    ]
    partes = _partes(blocos)
    assert partes[0] == {"type": "text", "text": "o que tem no prato?"}
    assert partes[1]["image_url"]["url"] == "data:image/jpeg;base64,QUJD"
