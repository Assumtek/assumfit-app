"""Configuração do serviço de modelo.

Os modelos determinísticos (energia, cronótipo, idade biológica) nunca
precisaram de configuração — são função pura de entrada. O agente de treino
precisa: ele chama a Anthropic, e a chave, o modelo e os limiares do gate de
qualidade têm que ser ajustáveis sem deploy.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# O `.env` ao lado do serviço, carregado SEMPRE — sem depender de quem subiu o
# processo ter exportado a chave no shell. Foi assim que um reinício de rotina
# derrubou a extração em silêncio: o processo novo nasceu sem ANTHROPIC_API_KEY
# e cada chamada degradava para vazio, sem erro em lugar visível. Variável já
# exportada tem precedência (`override=False`), então ambiente gerenciado —
# Docker, produção — continua mandando.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)
from functools import lru_cache

from pydantic import BaseModel


class Settings(BaseModel):
    anthropic_api_key: str = ""
    #: Geração do plano. Tarefa longa, com catálogo de 370 exercícios no prompt e
    #: referências clínicas — é onde a capacidade do modelo aparece.
    #: Haiku por decisão de CUSTO (US$ 1/5 por MTok contra US$ 5/25 do Opus — 5×
    #: mais barato, e a geração é dominada pelo catálogo de 370 exercícios na
    #: entrada). As grades de segurança NÃO dependem do modelo: encaminhamento
    #: clínico é decidido em código antes de qualquer chamada, o catálogo é
    #: validado 3× de forma determinística, e critério ausente no juiz reprova.
    #: O custo real da troca é mais planos reprovados no gate. Reverter é uma
    #: variável de ambiente.
    #: A GERAÇÃO fica no Sonnet 5 e todo o resto no Haiku — é a configuração
    #: mais barata QUE PASSA NO PORTÃO. Testado em produção nesta ordem: Opus
    #: gerava a 8,16; Haiku sem pensamento escreveu esqueleto (nota 0); Haiku
    #: com pensamento escreveu plano válido e medíocre (6,37 contra portão de
    #: 7,0, depois uma falha dura). Geração bloqueada custa dinheiro e não
    #: entrega nada — o Sonnet a US$ 2/10 (lançamento) sai 60% mais barato que o
    #: Opus e passa. Para forçar Haiku de volta: LLM_MAIN_MODEL=claude-haiku-4-5.
    llm_main_model: str = "claude-sonnet-5"
    #: Avaliação do plano gerado. Mesmo modelo, papel diferente: o julgamento é
    #: sobre segurança clínica, e economizar aqui economiza justamente na
    #: barreira que existe para não entregar plano ruim.
    llm_grader_model: str = "claude-haiku-4-5"
    #: O chat de ajuste responde CURTO mas carrega o catálogo inteiro na
    #: entrada — é a chamada mais frequente do produto. Haiku aqui corta o
    #: custo por mensagem pela metade, e as operações que ele propõe não são
    #: aplicadas automaticamente: o servidor ainda é quem decide.
    llm_chat_model: str = "claude-haiku-4-5"
    #: A análise de foto de prato tem modelo PRÓPRIO, um degrau acima do chat:
    #: identificar alimento e estimar porção é visão fina, onde o Haiku erra o
    #: que o Sonnet acerta — e a chamada é rara (uma por refeição fotografada),
    #: então o custo extra não pesa. Separado do chat para um ajuste não
    #: arrastar o outro.
    nutrition_model: str = "claude-sonnet-5"
    #: Profundidade do raciocínio. Substitui o antigo orçamento de tokens de
    #: pensamento, que os modelos 5 rejeitam. `high` é o piso para trabalho
    #: sensível a acerto; abaixo disso a prescrição fica rasa.
    llm_effort: str = "high"
    # Teto de SAÍDA da geração de plano.
    #
    # 16384 truncava. O log de produção (ago/2026) mostra
    # `stop_reason: "max_tokens"` com 16384 tokens em geração após geração: o
    # plano era cortado no meio e o JSON chegava inválido — a famosa vírgula
    # faltando na linha 61. Cada tentativa queimava o teto inteiro e voltava
    # quebrada, o que multiplicava retries, revisões e latência até estourar o
    # tempo do backend.
    #
    # Um plano de seis dias com aquecimento, série principal e alongamento não
    # cabe em 16k, e o raciocínio ainda consome parte disso. Era o defeito de
    # baixo de toda a pilha que investiguei hoje.
    llm_max_tokens: int = 32768

    grader_enabled: bool = True
    #: Nota mínima (0–10) para o plano passar. Abaixo disso, bloqueia.
    #: 6,0 por decisão de produto (jul/2026): com a geração no Sonnet, o portão
    #: em 7,0 rejeitava plano utilizável e cada bloqueio cobra a geração sem
    #: entregar nada. As falhas DURAS não passam por esta régua — critério de
    #: segurança reprovado ou ausente bloqueia com qualquer nota.
    grader_min_score: float = 6.0
    #: Bloqueio por OPINIÃO do juiz só vale com maioria (2 de 3). Medido na
    #: rodada de testes 1 (jul/2026): o mesmo perfil limpo levou hard-fail de
    #: segurança em 1 de 4 avaliações — ruído do juiz, não risco clínico. O
    #: caminho aprovado não ganha chamada nenhuma; só bloqueio disputado paga
    #: até duas avaliações extras do Haiku. Erro determinístico não re-vota.
    grader_confirm_blocks: bool = True
    #: Quantas vezes re-gerar quando o modelo referencia um exercício que não
    #: existe no catálogo. É erro mecânico (id alucinado), não erro de juízo —
    #: vale corrigir e tentar de novo antes de gastar o avaliador.
    max_catalog_retries: int = 2
    # Quantas REVISÕES o plano ganha quando o avaliador reprova por opinião.
    # Reprovar sem revisar entrega nada a quem pediu; revisar sem teto gastaria
    # a geração inteira num perfil que o modelo não consegue atender.
    max_judge_retries: int = 2

    log_level: str = "INFO"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    try:
        return float(raw) if raw else default
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


@lru_cache
def get_settings() -> Settings:
    return Settings(
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        llm_main_model=os.getenv("LLM_MAIN_MODEL", "claude-sonnet-5"),
        llm_grader_model=os.getenv("LLM_GRADER_MODEL", "claude-haiku-4-5"),
        llm_chat_model=os.getenv("LLM_CHAT_MODEL", "claude-haiku-4-5"),
        nutrition_model=os.getenv("NUTRITION_MODEL", "claude-sonnet-5"),
        llm_effort=os.getenv("LLM_EFFORT", "high"),
        llm_max_tokens=_env_int("LLM_MAX_TOKENS", 32768),
        grader_enabled=_env_bool("GRADER_ENABLED", True),
        grader_min_score=_env_float("GRADER_MIN_SCORE", 6.0),
        grader_confirm_blocks=_env_bool("GRADER_CONFIRM_BLOCKS", True),
        max_catalog_retries=_env_int("MAX_CATALOG_RETRIES", 2),
        max_judge_retries=_env_int("MAX_JUDGE_RETRIES", 2),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
    )


settings = get_settings()
