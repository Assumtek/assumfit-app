"""Cliente Anthropic — geração do plano e avaliação (LLM-as-judge).

Três detalhes do contrato atual que o código anterior a eles quebra:

1. **`temperature`, `top_p` e `top_k` são REJEITADOS com 400** nos modelos 5.
   Quem controla profundidade agora é `output_config.effort`. Um `temperature=0`
   herdado de código antigo derruba toda geração.
2. **O raciocínio vem ligado por padrão** e consome o MESMO orçamento de
   `max_tokens` que a resposta. É a armadilha que truncou a frase da home em
   `models/insight_llm.py`; aqui o teto precisa caber os dois.
3. **Uma recusa não é erro**: volta HTTP 200 com `stop_reason == "refusal"` e
   `content` vazio. Ler `content[0]` direto estoura. Prescrição de exercício
   para perfil clínico passa perto do classificador — isto acontece.
"""

from __future__ import annotations

from anthropic import APIError, APIStatusError, AsyncAnthropic

from core.logging import get_logger
from core.settings import settings

log = get_logger(__name__)

_client: AsyncAnthropic | None = None

#: `system` e `user` aceitam string ou lista de blocos de conteúdo — cada bloco
#: `{"type": "text", "text": ..., "cache_control": {...}}`. Os blocos são o que
#: permite cachear o prefixo estável do prompt, e o prefixo aqui passa de 20 mil
#: tokens (instruções + catálogo de 370 exercícios + referências clínicas).
Content = str | list[dict]

#: Recusa do classificador de segurança devolve a requisição para outro modelo,
#: em vez de simplesmente parar. `"default"` deixa a escolha do substituto com a
#: própria API, roteada pela categoria da recusa — melhor que fixar um modelo,
#: que viraria migração nossa quando ele fosse aposentado.
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


class LlmRefusal(RuntimeError):
    """O classificador recusou a requisição, e o fallback também.

    Tratada como falha TÉCNICA pelo backend (reprocessa), não como plano ruim:
    não houve plano nenhum para julgar.
    """

    def __init__(self, category: str | None, explanation: str | None) -> None:
        super().__init__(f"recusa do modelo (categoria={category}): {explanation or 'sem detalhe'}")
        self.category = category
        self.explanation = explanation


def get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY ausente — o agente de treino não pode gerar")
        _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


async def complete(
    *,
    system: Content,
    user: Content,
    model: str | None = None,
    max_tokens: int = 1024,
    effort: str = "high",
) -> str:
    """Uma chamada ao modelo, em streaming, devolvendo o texto concatenado.

    Streaming não é sobre exibir token a token — aqui ninguém vê o fluxo. É que
    uma requisição sem stream com `max_tokens` alto bate no tempo limite de HTTP
    do SDK antes de terminar, e a geração de um plano de sete dias é longa.
    """
    resolved = model or settings.llm_main_model

    kwargs: dict = {
        "model": resolved,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    # `output_config.effort` existe da família 4.6 em diante — Opus 4.6+,
    # Sonnet 4.6, Sonnet 5, Opus 5, Fable 5. O Haiku 4.5 é anterior e REJEITA
    # com 400 ("This model does not support the effort parameter").
    #
    # CORREÇÃO (ago/2026): a versão anterior deste comentário afirmava que o
    # Sonnet 5 também rejeitava — está errado, confirmado pela Models API em
    # produção (`capabilities.effort.supported: true`). O 400 daquele dia veio
    # do `fallbacks` (que saiu de vez), não do `effort` no Sonnet.
    if not resolved.startswith("claude-haiku"):
        kwargs["output_config"] = {"effort": effort}
    elif max_tokens >= 4096:
        # O Haiku pensa no formato ANTIGO (`budget_tokens`) — e precisa pensar.
        # Sem nada, a primeira geração real saiu com 445 tokens: um esqueleto
        # que passou na validação estrutural e morreu no juiz com nota zero.
        # No Opus quem carregava o plano era o raciocínio adaptativo; aqui o
        # orçamento explícito cumpre o papel. Só nas chamadas GRANDES: dar
        # pensamento à extração de 500 tokens seria pagar para nada.
        kwargs["thinking"] = {"type": "enabled", "budget_tokens": min(8000, max_tokens // 2)}

    try:
        async with get_client().beta.messages.stream(**kwargs) as stream:
            resp = await stream.get_final_message()
    except APIStatusError as exc:
        # Erro COM resposta HTTP: 401 chave inválida, 404 modelo inexistente, 400
        # prompt grande demais, 429 limite, 529 sobrecarga. Logar a causa real é o
        # que separa "o agente falhou" de quinze minutos procurando o porquê.
        log.error(
            "llm.complete.api_error",
            model=resolved,
            status_code=exc.status_code,
            error_type=type(exc).__name__,
            message=str(exc),
        )
        raise
    except APIError as exc:
        log.error(
            "llm.complete.api_error",
            model=resolved,
            error_type=type(exc).__name__,
            message=str(exc),
        )
        raise

    usage = resp.usage
    log.info(
        "llm.complete",
        model=resp.model,
        stop_reason=resp.stop_reason,
        input_tokens=usage.input_tokens,
        cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
        cache_write_tokens=getattr(usage, "cache_creation_input_tokens", 0) or 0,
        output_tokens=usage.output_tokens,
    )

    # Antes de tocar em `content`: a recusa chega como sucesso, com a lista vazia.
    if resp.stop_reason == "refusal":
        details = getattr(resp, "stop_details", None)
        raise LlmRefusal(
            category=getattr(details, "category", None),
            explanation=getattr(details, "explanation", None),
        )

    text = "".join(block.text for block in resp.content if block.type == "text")

    # Sem texto e sem recusa: quase sempre o raciocínio consumiu `max_tokens`
    # inteiro. Falhar com essa mensagem evita depurar um JSON vazio.
    if not text:
        raise RuntimeError(
            f"modelo devolveu resposta sem texto (stop_reason={resp.stop_reason}); "
            f"provável estouro de max_tokens={max_tokens} pelo raciocínio"
        )
    return text
