"""A saudação da manhã: o molde e o filtro que protege a tela de bloqueio."""

from models.morning import MorningFacts, _valido, fallback_morning


def fatos(**kw) -> MorningFacts:
    base = dict(temperature_c=22, humidity_pct=60, trains_tomorrow=True)
    base.update(kw)
    return MorningFacts(**base)


class TestMolde:
    """O molde é a resposta quando a rede falha — e notificação agendada não
    tem segunda chance, então ele precisa ser correto sozinho."""

    def test_frio_com_treino_convida(self):
        corpo = fallback_morning(fatos(temperature_c=10))["body"]
        assert "10°" in corpo
        assert "treino" in corpo.lower()

    def test_frio_em_dia_de_descanso_nao_empurra_treino(self):
        corpo = fallback_morning(fatos(temperature_c=10, trains_tomorrow=False))["body"]
        assert "treino" not in corpo.lower()

    def test_calor_pede_agua(self):
        corpo = fallback_morning(fatos(temperature_c=31))["body"]
        assert "31°" in corpo
        assert "água" in corpo.lower() or "hidrate" in corpo.lower()

    def test_ar_abafado_acrescenta_a_agua(self):
        corpo = fallback_morning(fatos(humidity_pct=88))["body"]
        assert "abafado" in corpo.lower()

    def test_umidade_normal_nao_fala_de_ar(self):
        assert "abafado" not in fallback_morning(fatos(humidity_pct=55))["body"].lower()

    def test_nunca_usa_exclamacao_nem_emoji(self):
        for t in (5, 20, 35):
            for treina in (True, False):
                corpo = fallback_morning(fatos(temperature_c=t, trains_tomorrow=treina))["body"]
                assert "!" not in corpo
                assert corpo.isascii() or "°" in corpo


class TestValidacao:
    """O filtro existe porque número inventado numa notificação de saúde é
    pior que o molde: ninguém tem como conferir de relance."""

    def test_aceita_texto_com_a_temperatura_dada(self):
        assert _valido({"title": "Bom dia", "body": "22° e tempo firme para treinar."}, fatos())

    def test_recusa_numero_que_nao_existe_nos_fatos(self):
        assert not _valido({"title": "Bom dia", "body": "Seus 78 bpm pedem calma."}, fatos())

    def test_recusa_texto_vazio(self):
        assert not _valido({"title": "", "body": "algo"}, fatos())
        assert not _valido({"title": "Bom dia", "body": "   "}, fatos())

    def test_recusa_texto_longo_demais_para_a_tela_de_bloqueio(self):
        assert not _valido({"title": "Bom dia", "body": "x" * 200}, fatos())
        assert not _valido({"title": "t" * 60, "body": "ok"}, fatos())

    def test_recusa_tipo_errado(self):
        assert not _valido({"title": 22, "body": "ok"}, fatos())

    def test_aceita_a_sequencia_quando_ela_foi_informada(self):
        f = fatos(streak_days=5)
        assert _valido({"title": "Bom dia", "body": "5 dias seguidos de movimento."}, f)

    def test_recusa_sequencia_inflada(self):
        f = fatos(streak_days=5)
        assert not _valido({"title": "Bom dia", "body": "50 dias seguidos."}, f)
