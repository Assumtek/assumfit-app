"""A fundamentação do plano, escrita para a pessoa, um passo à parte.

O prompt do gerador já pede um "rationale" em palavras da pessoa, e o modelo
principal não obedece com constância: um plano de 22/08/2026 chegou à tela com
"Perfil sem contraindicações (TIER_0, sem flags)… RIR (Zourdos et al.)… ACSM
12ª ed.", e o testador, com razão, disse que continuava técnico.

Quem escreve para o revisor e para o log precisa do vocabulário técnico; quem
lê no celular, não. Então são dois textos: o técnico fica no rastro da geração
(log e `rationale_technical`), e o que vai ao app passa por AQUI, um modelo
barato reescreve com as mesmas regras do prompt, e um detector de jargão
decide se ficou bom. Se o jargão sobrevive a duas tentativas, vai o melhor
que saiu: ainda é mais legível que o original. Se o modelo falhar, vai o
original, um plano sem explicação é pior que um plano com explicação dura.
"""

from __future__ import annotations

import re

from core.logging import get_logger
from core.settings import settings
from llm.client import complete

log = get_logger(__name__)

#: Palavras de sistema que não cabem na tela da pessoa. Siglas só contam
#: quando aparecem soltas, sem tradução ao lado — "RIR 2-3" sim, "com 2 a 3
#: repetições ainda no tanque" não.
_JARGAO = re.compile(
    r"\b(tier[_ ]?\d|flags?|hierarquia de seguran[cç]a|conta (é )?nova|0 sess[õo]es|"
    r"n[ãa]o p[ôo]de ser confirmad|revis[ãa]o|engine|auditoria|modelo|"
    r"RIR|RPE|ACSM|NSCA|et al\.?|\d{4}\)|split|deload|upper/?lower)\b",
    re.IGNORECASE,
)

_SYSTEM = """Você reescreve a explicação de um plano de treino para a PESSOA que vai \
treinar, no celular, sozinha. Não é para o revisor nem para o log.

Regras:
1. Quatro a seis frases curtas, nesta ordem: o que foi montado; por que assim; como \
progride entre as semanas; quando alivia. Segunda pessoa ("você").
2. Decisão, não justificativa. "Comecei por máquinas e halteres para você fixar a \
execução antes de subir carga", nunca "o nível declarado não pôde ser confirmado".
3. Sem palavras de sistema: nada de tier, flag, hierarquia de segurança, conta nova, \
sessões registradas, revisão, modelo, auditoria. Sem siglas sem tradução: RIR 2-3 vira \
"pare com 2 a 3 repetições ainda no tanque"; split upper/lower vira "cada grupo \
muscular duas vezes por semana"; deload vira "uma semana mais leve a cada 5 ou 6"; \
aquecimento em rampa vira "duas séries leves antes do peso real".
4. Falta de acompanhamento ou de histórico: no máximo UMA menção, na última frase, \
como cuidado, nunca como motivo de o treino ser menor.
5. Sem referências, sem autores, sem anos, sem nomes de entidades.
6. Português do Brasil, tom direto e adulto. Só o texto, sem título, sem lista."""


def tem_jargao(texto: str) -> bool:
    return bool(_JARGAO.search(texto))


async def reescrever_para_pessoa(rationale: str) -> str:
    """O texto que vai ao app. Nunca lança: em falha, devolve o original."""
    if not rationale or not rationale.strip():
        return rationale
    melhor = rationale
    for tentativa in range(2):
        try:
            saida = (
                await complete(
                    system=_SYSTEM,
                    user=f"Explicação original:\n{rationale}",
                    model=settings.llm_chat_model,
                    max_tokens=700,
                    effort="low",
                )
            ).strip()
        except Exception as err:  # noqa: BLE001, passo opcional: falha não derruba a geração
            log.warning("agent.rationale.rewrite_failed", attempt=tentativa + 1, error=str(err))
            break
        if not saida:
            break
        melhor = saida
        if not tem_jargao(saida):
            return saida
        log.info("agent.rationale.jargao_restante", attempt=tentativa + 1)
    return melhor
