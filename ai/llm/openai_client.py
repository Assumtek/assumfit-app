"""O mesmo contrato de `llm.client.complete`, falando com a OpenAI.

Existe porque a fundadora decidiu (24/08/2026) migrar a geração de plano para
o GPT-5, que custa menos da metade por chamada. A escolha é de configuração,
não de código: `settings.llm_main_model` decide, e `llm.client.complete`
encaminha pelo prefixo do nome do modelo.

Três diferenças de contrato que este módulo esconde de quem chama:

1. **Blocos com `cache_control` não existem aqui.** A OpenAI cacheia prefixo
   automaticamente, sem marcação e sem custo de escrita; os blocos viram texto
   concatenado.
2. **`system` é uma mensagem**, não um campo separado.
3. **O parâmetro de raciocínio é `reasoning_effort`**, e só os modelos que
   raciocinam o aceitam. Mandar para os outros é 400.
"""

from __future__ import annotations

from openai import APIError, AsyncOpenAI

from core.logging import get_logger
from core.settings import settings

log = get_logger(__name__)

_client: AsyncOpenAI | None = None

#: Modelos que aceitam `reasoning_effort`. Os demais rejeitam com 400.
_COM_RACIOCINIO = ("gpt-5", "o1", "o3", "o4")


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY ausente e o modelo escolhido é da OpenAI")
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


def _texto(conteudo) -> str:
    """Blocos de TEXTO do formato Anthropic viram um texto só."""
    if isinstance(conteudo, str):
        return conteudo
    return "\n\n".join(
        b.get("text", "") for b in conteudo if isinstance(b, dict) and b.get("type") == "text"
    )


def _partes(conteudo) -> list[dict] | str:
    """Converte blocos, incluindo IMAGEM, para o formato de partes da OpenAI.

    A foto da refeição vem como bloco `{"type": "image", "source": {"type":
    "base64", ...}}`, que é a forma da Anthropic. Aqui ela vira `image_url`
    com data URI. Sem isto, a imagem sumiria em silêncio e o modelo receberia
    só o texto, respondendo sobre uma foto que nunca viu: o pior desfecho
    possível para uma tela que mostra caloria.
    """
    if isinstance(conteudo, str):
        return conteudo
    partes: list[dict] = []
    for b in conteudo:
        if not isinstance(b, dict):
            continue
        if b.get("type") == "text":
            partes.append({"type": "text", "text": b.get("text", "")})
        elif b.get("type") == "image":
            fonte = b.get("source") or {}
            if fonte.get("type") == "base64":
                media = fonte.get("media_type", "image/jpeg")
                dados = fonte.get("data", "")
                partes.append(
                    {"type": "image_url", "image_url": {"url": f"data:{media};base64,{dados}"}}
                )
    return partes


async def complete(
    *,
    system,
    user,
    model: str,
    max_tokens: int = 1024,
    effort: str = "high",
) -> str:
    kwargs: dict = {
        "model": model,
        "max_completion_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": _texto(system)},
            {"role": "user", "content": _partes(user)},
        ],
    }
    if model.startswith(_COM_RACIOCINIO):
        kwargs["reasoning_effort"] = effort

    try:
        resp = await get_client().chat.completions.create(**kwargs)
    except APIError as exc:
        log.error(
            "llm.complete.api_error",
            provedor="openai",
            model=model,
            error_type=type(exc).__name__,
            message=str(exc),
        )
        raise

    escolha = resp.choices[0]
    uso = resp.usage
    log.info(
        "llm.complete",
        provedor="openai",
        model=resp.model,
        stop_reason=escolha.finish_reason,
        input_tokens=getattr(uso, "prompt_tokens", 0),
        cache_read_tokens=getattr(getattr(uso, "prompt_tokens_details", None), "cached_tokens", 0) or 0,
        output_tokens=getattr(uso, "completion_tokens", 0),
    )

    # Recusa do classificador chega como sucesso com conteúdo vazio, igual à
    # Anthropic: ler o texto direto estouraria.
    texto = escolha.message.content
    if not texto:
        raise RuntimeError(
            f"resposta vazia da OpenAI (finish_reason={escolha.finish_reason})"
        )
    return texto
