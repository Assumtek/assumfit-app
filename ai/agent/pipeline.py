"""Pipeline do agente: gerar → validar → julgar → decidir.

Função assíncrona simples. Não há grafo de estados aqui porque não há
ramificação de verdade: é uma sequência com um laço de correção no meio.
"""

from __future__ import annotations

import json
import time
import uuid

from agent.generate import generate_plan
from agent.knowledge import gather_knowledge
from agent.models import AgentResult, WorkoutGenerationInput
from agent.validate import catalog_errors, json_errors, mechanical_errors, validate_plan
from core.logging import get_logger
from core.settings import settings
from grader.grade import grade

log = get_logger(__name__)


def _catalog_correction(errors: list[str]) -> str:
    """Instrução de correção com os ids inválidos da tentativa anterior."""
    ids = sorted({e.split(": ", 1)[1] for e in errors if ": " in e})
    listed = ", ".join(ids) if ids else "(ids nao identificados)"
    return (
        "# Correcao obrigatoria\n"
        f"A tentativa anterior prescreveu exercicios FORA do catalogo permitido: {listed}.\n"
        "Gere o plano novamente usando SOMENTE exerciseId presentes no catalogo permitido. "
        "Nunca invente ids nem use exercicios fora da lista."
    )


def _json_correction(errors: list[str]) -> str:
    """Instrução de correção para saída que não era JSON válido.

    Diz ONDE quebrou. O parser aponta linha e coluna, e devolver isso ao modelo
    é mais barato e mais eficaz que pedir "gere de novo" sem contexto.
    """
    detalhe = "; ".join(e.split(": ", 1)[1] for e in errors if ": " in e) or "(sem detalhe)"
    return (
        "# Correcao obrigatoria\n"
        f"A saida anterior NAO era JSON valido: {detalhe}.\n"
        "Devolva o plano inteiro como um unico objeto JSON valido, sem texto antes "
        "nem depois, sem comentarios e sem virgula sobrando."
    )


def _correcao(errors: list[str]) -> str:
    """A instrução da nova tentativa, específica para o que quebrou."""
    do_json = json_errors(errors)
    if do_json:
        return _json_correction(do_json)
    return _catalog_correction(catalog_errors(errors))


def _correcao_do_juiz(breakdown: dict) -> str:
    """A revisão pedida pelo AVALIADOR, com as objeções dele em texto.

    Reprovar e parar entrega nada a quem pediu o treino — e a objeção quase
    sempre é corrigível: volume alto demais para quem está voltando, progressão
    abrupta, frequência acima do que o perfil suporta. Devolver o parecer ao
    gerador é mais barato que uma geração nova às cegas, e mantém o critério de
    pé: o plano revisado é avaliado outra vez, pelos mesmos juízes.

    Só os juízes que REPROVARAM entram. Mandar o parecer inteiro faria o modelo
    tentar agradar notas que já passaram, mexendo no que estava certo.
    """
    reprovados = [
        j
        for j in breakdown.get("judges", [])
        if j.get("score") is not None and j["score"] < settings.grader_min_score + 1
    ]
    if not reprovados:
        reprovados = breakdown.get("judges", [])[:2]

    objecoes = "\n".join(
        f"- {j['name']} (nota {j['score']}): {str(j.get('reason', ''))[:400]}" for j in reprovados
    )
    return (
        "# Revisao obrigatoria\n"
        "A versao anterior do plano foi REPROVADA na avaliacao. Objecoes:\n"
        f"{objecoes}\n\n"
        "Gere o plano novamente CORRIGINDO cada objecao acima. Reduza volume, "
        "frequencia ou intensidade onde apontado, e mantenha o que nao foi "
        "criticado. Prefira um plano mais conservador a um plano reprovado: "
        "quem esta voltando de um periodo parado progride ao longo das semanas, "
        "nao na primeira."
    )


def _ressalvas(breakdown: dict) -> list[str]:
    """As objeções que sobraram, para a PESSOA ler — não para o modelo.

    O parecer do avaliador é técnico e escrito para outro modelo ("RSA alta
    intensidade + heavy leg criam risco de sobrecarga em membros inferiores").
    Aqui vira o que interessa a quem vai treinar: o que foi contido e por quê.

    Sai o nome do juiz e a nota; fica a justificativa, cortada na primeira frase
    completa. Uma ressalva que ninguém termina de ler não protege ninguém.
    """
    notas: list[str] = []
    for j in breakdown.get("judges", []):
        if j.get("score") is None or j["score"] >= settings.grader_min_score:
            continue
        razao = str(j.get("reason", "")).strip()
        if not razao:
            continue
        # Primeira frase inteira: o parecer é cortado em 300 caracteres na
        # origem e costuma terminar no meio de uma palavra.
        corte = razao.split(". ")[0].strip().rstrip(",;")
        if corte:
            notas.append(corte if corte.endswith(".") else f"{corte}.")
    return notas[:3]


def _plano_com_nomes(plan: str, catalogo) -> str:
    """A cópia do plano que os JUÍZES leem, com o nome de cada exercício.

    O plano referencia o catálogo por `exerciseId`, e o juiz de clareza dava
    nota 2 por "exercícios ilegíveis, só UUIDs" — um defeito do NOSSO payload,
    não do plano: o app resolve os nomes pelo catálogo, o juiz não tinha como.
    Anota `exerciseName` ao lado de cada id só na cópia julgada; o plano que
    segue para o banco continua o original.
    """
    nomes = {e.id: e.name for e in catalogo}
    try:
        data = json.loads(plan)
    except json.JSONDecodeError:
        return plan

    def anotar(node: object) -> None:
        if isinstance(node, dict):
            ex_id = node.get("exerciseId")
            if isinstance(ex_id, str) and ex_id in nomes:
                node["exerciseName"] = nomes[ex_id]
            for value in node.values():
                anotar(value)
        elif isinstance(node, list):
            for value in node:
                anotar(value)

    anotar(data)
    return json.dumps(data, ensure_ascii=False, indent=2)


def _juiz_reprovou(breakdown: dict) -> bool:
    return bool(breakdown.get("hard_failures")) or breakdown["score"] < settings.grader_min_score


def _e_opiniao(breakdown: dict) -> bool:
    """Verdadeiro quando nada determinístico participou da reprovação.

    Checagem dura reprovada (`type == "check"`) repete idêntica em qualquer
    re-voto; nota derrubada por PENALTY também, mas aí o juiz ainda pode ter
    variado — o re-voto converge sozinho e custa uma chamada, então só a
    checagem dura é excluída de vez.
    """
    return all(f.get("type") != "check" for f in breakdown.get("hard_failures", []))


async def run_agent(inp: WorkoutGenerationInput) -> AgentResult:
    trace_id = uuid.uuid4().hex

    if not inp.knowledge:
        inp = inp.model_copy(update={"knowledge": gather_knowledge(inp)})

    started = time.perf_counter()
    plan = await generate_plan(inp)

    errors = validate_plan(plan, inp)

    # Erro MECÂNICO — id fora do catálogo ou JSON malformado — é falha de FORMA,
    # não de juízo clínico. Vale corrigir e tentar de novo antes de gastar uma
    # chamada de avaliação e devolver um veredito reprovado.
    #
    # O JSON entrou nesta classe depois de um caso em produção (ago/2026): faltou
    # um delimitador na linha 61 e o plano inteiro foi descartado, com a pessoa
    # recebendo "não deu para gerar" por causa de uma vírgula.
    retries = 0
    while mechanical_errors(errors) and retries < settings.max_catalog_retries:
        retries += 1
        log.info(
            "agent.mechanical_retry",
            trace_id=trace_id,
            attempt=retries,
            errors=len(mechanical_errors(errors)),
            kinds=sorted({e.split(":", 1)[0] for e in mechanical_errors(errors)}),
        )
        plan = await generate_plan(inp, correction=_correcao(errors))
        errors = validate_plan(plan, inp)

    latency_ms = int((time.perf_counter() - started) * 1000)

    # O avaliador recebe só o perfil e as referências. O catálogo fica de fora
    # de propósito: a conformidade com ele já foi checada deterministicamente, e
    # mandar 370 exercícios para um juízo que não os usa é desperdício puro.
    context = "\n\n".join(inp.knowledge)
    request = json.dumps(
        {
            "profile": inp.profile,
            "flags": inp.flags,
            "history_summary": inp.history_summary,
            "constraints": inp.constraints,
        },
        ensure_ascii=False,
        indent=2,
    )
    plano_julgado = _plano_com_nomes(plan, inp.allowed_exercises)
    breakdown = await grade(
        question=request, answer=plano_julgado, context=context, latency_ms=latency_ms
    )
    blocked = bool(errors) or _juiz_reprovou(breakdown)

    # Bloqueio por opinião exige maioria. O mesmo plano, mesmo perfil, levou
    # hard-fail de segurança em 1 de 4 avaliações na rodada de testes 1 — e um
    # falso bloqueio cobra a geração inteira de novo sem entregar nada. Só entra
    # aqui o veredito que é PURAMENTE do juiz: erro determinístico (validação ou
    # checagem dura) re-votaria para o mesmo lugar, então não re-vota.
    if blocked and not errors and settings.grader_confirm_blocks and _e_opiniao(breakdown):
        contra, a_favor = 1, 0
        while contra < 2 and a_favor < 2:
            revoto = await grade(
                question=request, answer=plano_julgado, context=context, latency_ms=latency_ms
            )
            if _juiz_reprovou(revoto):
                contra += 1
            else:
                a_favor += 1
            # A última avaliação sempre concorda com o veredito final: quem
            # fecha a maioria é quem dá o breakdown que o chamador vê.
            breakdown = revoto
            log.info(
                "agent.regrade",
                trace_id=trace_id,
                contra=contra,
                a_favor=a_favor,
                score=revoto["score"],
            )
        blocked = contra >= 2

    # ----------------------------------------------------------------------
    # Reprovado pelo juiz? REVISA — não devolve as mãos abanando.
    #
    # A regra do produto (ago/2026, decisão da fundadora): SEMPRE sai um plano,
    # e a pessoa lê o que foi ajustado. Quem respondeu uma anamnese inteira não
    # pode receber "não foi possível gerar"; pode receber um plano mais
    # conservador com o motivo escrito.
    #
    # O critério de segurança continua valendo — ele deixou de ser um portão
    # fechado e virou um revisor: o parecer volta ao gerador, o plano é
    # refeito e avaliado de novo. O que muda é o desfecho quando as revisões
    # se esgotam: entrega o melhor plano com as ressalvas à vista, em vez de
    # entregar nada.
    #
    # O encaminhamento clínico (TIER de risco) NÃO passa por aqui: ele é
    # decidido no backend, antes do modelo, e continua sendo o único caso em
    # que não gerar é a resposta responsável.
    # ----------------------------------------------------------------------
    revisoes = 0
    while blocked and revisoes < settings.max_judge_retries:
        revisoes += 1
        # A correção diz o que ESTÁ errado — validação ou parecer do juiz. Uma
        # falha estrutural ("dia repetido") é tão corrigível quanto volume alto
        # demais, e as duas se resolvem do mesmo jeito: dizendo ao gerador.
        instrucao = _correcao(errors) if errors else _correcao_do_juiz(breakdown)
        log.info(
            "agent.judge_revision",
            trace_id=trace_id,
            attempt=revisoes,
            por=("validacao" if errors else "avaliador"),
        )
        plan = await generate_plan(inp, correction=instrucao)
        errors = validate_plan(plan, inp)
        # Uma revisão pode quebrar o JSON de novo — o retry mecânico vale aqui
        # também, senão a revisão troca um bloqueio por outro.
        mecanicas = 0
        while mechanical_errors(errors) and mecanicas < settings.max_catalog_retries:
            mecanicas += 1
            plan = await generate_plan(inp, correction=_correcao(errors))
            errors = validate_plan(plan, inp)
        plano_julgado = _plano_com_nomes(plan, inp.allowed_exercises)
        breakdown = await grade(
            question=request, answer=plano_julgado, context=context, latency_ms=latency_ms
        )
        blocked = bool(errors) or _juiz_reprovou(breakdown)

    # Esgotadas as revisões, o plano SAI com as ressalvas. Só continua bloqueado
    # o que não tem plano para entregar: erro determinístico significa que não
    # há JSON válido, e não existe "melhor esforço" de um plano que não parseia.
    notas: list[str] = []
    if blocked and not errors:
        notas = _ressalvas(breakdown)
        blocked = False
        log.info("agent.entregue_com_ressalvas", trace_id=trace_id, notas=len(notas))

    log.info(
        "agent.run",
        trace_id=trace_id,
        score=breakdown["score"],
        blocked=blocked,
        revisoes=revisoes,
        det_errors=len(errors),
        catalog_retries=retries,
        hard_failures=len(breakdown.get("hard_failures", [])),
        latency_ms=latency_ms,
    )
    # Bloqueio sem o PORQUÊ no log custou uma tarde de investigação às cegas:
    # o veredito zerado não dizia qual juiz reprovou nem com que justificativa.
    if blocked:
        log.info(
            "agent.run.blocked_detail",
            trace_id=trace_id,
            hard_failures=breakdown.get("hard_failures", []),
            judges=[
                {"name": j["name"], "score": j["score"], "reason": j.get("reason", "")[:300]}
                for j in breakdown.get("judges", [])
            ],
            det_errors=errors[:10],
        )
    return AgentResult(
        plan=plan,
        score=breakdown["score"],
        grader_breakdown=breakdown,
        deterministic_errors=errors,
        blocked=blocked,
        trace_id=trace_id,
        revision_notes=notas,
    )
