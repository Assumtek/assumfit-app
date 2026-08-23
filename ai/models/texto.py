"""Higiene de pontuação no texto que o modelo redige.

O produto não escreve com travessão (decisão da fundadora, ago/2026), e a regra
está em todos os prompts. Ainda assim ela escapa: o travessão é o hábito de
redação mais teimoso de um modelo de linguagem, e basta uma frase por semana
para a regra parecer não existir.

Isto NÃO reescreve conteúdo, e a diferença importa: trocar um sinal de
pontuação por outro preserva exatamente o que o modelo disse, enquanto
reescrever a frase produziria um texto que nem o modelo nem o molde
escreveram. É a mesma classe de ajuste da capitalização.
"""

TRAVESSAO = "—"
MEIA_RISCA = "–"


def sem_travessao(texto: str) -> str:
    """Troca travessão por vírgula, preservando o resto do texto.

    O travessão aparece em dois papéis:

    - Cercado de espaços ("treine às 17h — até lá, movimento leve"), onde ele
      separa orações e a vírgula ocupa o lugar sem perda.
    - Colado ("17h—18h"), onde é intervalo, e ali quem serve é a meia-risca,
      que continua permitida nesse papel.
    """
    if not texto:
        return texto
    saida = texto.replace(f" {TRAVESSAO} ", ", ")
    saida = saida.replace(f" {MEIA_RISCA} ", ", ")
    # Sobra o travessão sem espaço de um dos lados: vira meia-risca quando está
    # entre dígitos (intervalo), e vírgula no resto.
    resultado = []
    for i, ch in enumerate(saida):
        if ch != TRAVESSAO:
            resultado.append(ch)
            continue
        antes = saida[i - 1] if i > 0 else ""
        depois = saida[i + 1] if i + 1 < len(saida) else ""
        if antes.isdigit() and depois.isdigit():
            resultado.append(MEIA_RISCA)
        else:
            resultado.append(",")
    return "".join(resultado)


def sem_travessao_em(valor):
    """Aplica `sem_travessao` em toda string de uma estrutura aninhada.

    O resumo semanal vem como objeto com várias frases, e antes ele era
    DESCARTADO inteiro quando qualquer uma delas trazia travessão. Jogar fora
    um resumo bom por causa de um sinal de pontuação é caro para quem esperava
    o resumo, e a correção é de uma linha.
    """
    if isinstance(valor, str):
        return sem_travessao(valor)
    if isinstance(valor, list):
        return [sem_travessao_em(v) for v in valor]
    if isinstance(valor, dict):
        return {k: sem_travessao_em(v) for k, v in valor.items()}
    return valor
