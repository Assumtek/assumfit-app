"""A saudação da manhã: o molde e o filtro que protege a tela de bloqueio."""

from models.morning import MorningFacts, _valido


def fatos(**kw) -> MorningFacts:
    base = dict(temperature_c=22, humidity_pct=60, trains_tomorrow=True)
    base.update(kw)
    return MorningFacts(**base)


class TestMolde:
    """O molde é a resposta quando a rede falha — e notificação agendada não
    tem segunda chance, então ele precisa ser correto sozinho."""

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


