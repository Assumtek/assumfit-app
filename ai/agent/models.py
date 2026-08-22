"""Contratos do agente de prescrição de treino."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CatalogExercise(BaseModel):
    """Exercício do catálogo, o universo permitido de prescrição.

    O agente só pode referenciar `id` que apareça nesta lista. Não é uma
    sugestão do prompt: é checado depois, em `validate.py`, e de novo pela chave
    estrangeira do banco.
    """

    id: str
    name: str
    muscle_group: str | None = None
    equipment: str | None = None
    level: str | None = None
    type: str | None = None


class WorkoutGenerationInput(BaseModel):
    """Entrada da geração: fatos da pessoa + catálogo permitido + conhecimento.

    O backend produz os fatos e o catálogo; aqui se monta o plano. A divisão
    importa: quem conhece o usuário é o backend, quem conhece prescrição é este
    serviço, e nenhum dos dois precisa do que o outro sabe.
    """

    #: objetivo, experiência, frequência, sexo, idade, e o que o AssumFit mede
    #: de verdade — linha de base de HRV, cronótipo, score de energia.
    profile: dict = Field(default_factory=dict)
    #: cardiopata, gestante, lesao-ortopedica, glp1…
    flags: list[str] = Field(default_factory=list)
    history_summary: str = ""
    allowed_exercises: list[CatalogExercise] = Field(default_factory=list)
    #: equipamento, local, tempo por sessão, lesões declaradas.
    constraints: dict = Field(default_factory=dict)
    #: trechos recuperados da base de referências clínicas.
    knowledge: list[str] = Field(default_factory=list)


class AgentResult(BaseModel):
    """Saída do pipeline: plano candidato + veredito do avaliador."""

    #: JSON cru do plano. String, não objeto: quem persiste é o backend, e
    #: reparsear lá com o próprio schema é o que evita duas verdades sobre o
    #: mesmo formato.
    plan: str
    score: float
    grader_breakdown: dict
    deterministic_errors: list[str] = Field(default_factory=list)
    blocked: bool
    trace_id: str
    #: O que foi AJUSTADO no plano por exigência do avaliador, em linguagem de
    #: gente. Existe porque "não foi possível gerar o plano" é a pior resposta
    #: possível para quem respondeu uma anamnese inteira: o plano sai, e o que a
    #: pessoa precisa saber é o que foi contido e por quê — volume reduzido para
    #: quem está voltando, frequência menor, progressão mais lenta.
    revision_notes: list[str] = Field(default_factory=list)
