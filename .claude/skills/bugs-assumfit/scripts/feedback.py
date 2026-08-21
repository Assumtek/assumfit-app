#!/usr/bin/env python3
"""
Lê o feedback do TestFlight do AssumFit e devolve o que ainda NÃO foi tratado.

Por que API e não o painel: o App Store Connect corta o comentário na lista, e
a coleção só responde pelo relacionamento do APP — a direta e a por build dão
403/"não existe". Por que ledger: um feedback tratado e esquecido vira
retrabalho na rodada seguinte, e dois dos cinco primeiros (ago/2026) eram
pedidos de recurso que já existiam — classificar antes de abrir o código é a
parte que mais economiza.

Uso:
  feedback.py                 → pendentes (JSON)
  feedback.py --all           → tudo, com marca de tratado
  feedback.py --done ID SHA "nota"   → registra no ledger
"""
import base64, json, os, subprocess, sys, time, urllib.request
from pathlib import Path

APP_ID = "6796407503"
KEY_ID = "HL24V96G29"
ISSUER = "8d686404-5d05-47ec-a739-104be658ea8f"
KEY = Path.home() / ".credenciais/assumfit" / f"AuthKey_{KEY_ID}.p8"
REPO = Path(__file__).resolve().parents[4]
LEDGER = REPO / "relatorios/bugs/ledger.json"


def b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def token() -> str:
    # ES256 só com openssl: sem pyjwt na máquina e sem querer depender dele.
    now = int(time.time())
    h = b64(json.dumps({"alg": "ES256", "kid": KEY_ID, "typ": "JWT"}).encode())
    p = b64(json.dumps({"iss": ISSUER, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"}).encode())
    der = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", str(KEY), "-binary"],
        input=f"{h}.{p}".encode(), capture_output=True, check=True,
    ).stdout
    # DER (r,s) → raw 64 bytes, que é o que o JWT exige.
    asn = subprocess.run(["openssl", "asn1parse", "-inform", "DER"], input=der, capture_output=True, check=True).stdout.decode()
    ints = [l.split(":")[-1].strip() for l in asn.splitlines() if "INTEGER" in l]
    raw = b"".join(bytes.fromhex(i.rjust(64, "0")) for i in ints)
    return f"{h}.{p}.{b64(raw)}"


def get(path: str) -> dict:
    req = urllib.request.Request(
        f"https://api.appstoreconnect.apple.com/v1{path}",
        headers={"Authorization": f"Bearer {token()}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def ledger() -> dict:
    return json.loads(LEDGER.read_text()) if LEDGER.exists() else {"tratados": {}}


def feedbacks() -> list[dict]:
    d = get(f"/apps/{APP_ID}/betaFeedbackScreenshotSubmissions?limit=50&sort=-createdDate&include=build,tester")
    inc = {(i["type"], i["id"]): i["attributes"] for i in d.get("included", [])}
    out = []
    for x in d["data"]:
        a = x["attributes"]
        rel = x.get("relationships", {})
        b = rel.get("build", {}).get("data") or {}
        t = rel.get("tester", {}).get("data") or {}
        out.append({
            "id": x["id"],
            "em": a.get("createdDate"),
            "build": inc.get(("builds", b.get("id")), {}).get("version"),
            "testador": inc.get(("betaTesters", t.get("id")), {}).get("firstName"),
            "email": a.get("email"),
            "aparelho": f'{a.get("deviceModel")} · iOS {a.get("osVersion")}',
            "comentario": a.get("comment") or "",
            "capturas": [s.get("url") for s in (a.get("screenshots") or []) if s.get("url")],
        })
    # Crash capturado pelo sistema entra na mesma fila, marcado.
    try:
        c = get(f"/apps/{APP_ID}/betaFeedbackCrashSubmissions?limit=20&sort=-createdDate")
        for x in c["data"]:
            a = x["attributes"]
            out.append({"id": x["id"], "em": a.get("createdDate"), "build": None, "testador": None,
                        "email": a.get("email"), "aparelho": f'{a.get("deviceModel")} · iOS {a.get("osVersion")}',
                        "comentario": "[CRASH] " + (a.get("comment") or ""), "capturas": []})
    except Exception as e:  # noqa: BLE001 — a fila de capturas não pode morrer por causa da de crash
        print(f"crash submissions indisponível: {e}", file=sys.stderr)
    return out


SLACK_ENV = Path.home() / ".credenciais/assumfit/slack.env"


def slack_env() -> dict:
    """`SLACK_TOKEN=xoxb-…` e `SLACK_CHANNEL=assumfit-qa-feedback`, um por linha."""
    if not SLACK_ENV.exists():
        return {}
    out = {}
    for linha in SLACK_ENV.read_text().splitlines():
        if "=" in linha and not linha.lstrip().startswith("#"):
            k, v = linha.split("=", 1)
            out[k.strip()] = v.strip().strip('"')
    return out


def slack_get(token: str, method: str, **params) -> dict:
    from urllib.parse import urlencode
    req = urllib.request.Request(
        f"https://slack.com/api/{method}?{urlencode(params)}",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    if not d.get("ok"):
        raise RuntimeError(f"slack {method}: {d.get('error')}")
    return d


def slack_feedbacks() -> list[dict]:
    """
    O canal onde os relatos do WhatsApp são colados. O espaço de trabalho do
    AssumFit é outro — o conector da sessão não o enxerga —, então a leitura é
    por token de bot, guardado fora do repositório. Sem o arquivo, a fonte
    simplesmente não existe; não é erro.
    """
    env = slack_env()
    token, canal = env.get("SLACK_TOKEN"), env.get("SLACK_CHANNEL", "assumfit-qa-feedback")
    if not token:
        return []
    cid = None
    cursor = None
    while cid is None:
        d = slack_get(token, "conversations.list", types="public_channel,private_channel", limit=200, **({"cursor": cursor} if cursor else {}))
        for c in d["channels"]:
            if c["name"] == canal.lstrip("#"):
                cid = c["id"]
        cursor = d.get("response_metadata", {}).get("next_cursor") or None
        if cid is None and not cursor:
            raise RuntimeError(f"canal #{canal} não encontrado — o bot foi convidado?")
    h = slack_get(token, "conversations.history", channel=cid, limit=200)
    usuarios: dict[str, str] = {}
    out = []
    for m in h["messages"]:
        if m.get("subtype") in ("channel_join", "channel_leave", "bot_message"):
            continue
        uid = m.get("user", "")
        if uid and uid not in usuarios:
            try:
                usuarios[uid] = slack_get(token, "users.info", user=uid)["user"].get("real_name", uid)
            except Exception:  # noqa: BLE001
                usuarios[uid] = uid
        out.append({
            "id": f"slack:{m['ts']}",
            "em": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(float(m["ts"]))),
            "build": None,
            "testador": usuarios.get(uid, uid),
            "email": None,
            "aparelho": "(Slack)",
            "comentario": m.get("text", ""),
            "capturas": [f.get("url_private") for f in m.get("files", []) if f.get("url_private")],
            "thread": f"https://slack.com/archives/{cid}/p{m['ts'].replace('.', '')}",
        })
    return out


def proxima_versao() -> str:
    """`1.0.3 (7)`: a versão do app.json com o PRÓXIMO build — o que ainda não saiu."""
    cfg = json.loads((REPO / "app/app.json").read_text())["expo"]
    return f'{cfg["version"]} ({int(cfg["ios"]["buildNumber"]) + 1})'


def slack_responder(fid: str, texto: str) -> None:
    """Responde NA THREAD da mensagem original. Exige `chat:write` no bot."""
    env = slack_env()
    token, canal = env.get("SLACK_TOKEN"), env.get("SLACK_CHANNEL", "assumfit-qa-feedback")
    if not token or not fid.startswith("slack:"):
        return
    ts = fid.split(":", 1)[1]
    d = slack_get(token, "conversations.list", types="public_channel,private_channel", limit=200)
    cid = next(c["id"] for c in d["channels"] if c["name"] == canal.lstrip("#"))
    body = json.dumps({"channel": cid, "thread_ts": ts, "text": texto}).encode()
    req = urllib.request.Request(
        "https://slack.com/api/chat.postMessage", data=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.load(r)
    if not resp.get("ok"):
        raise RuntimeError(f"slack chat.postMessage: {resp.get('error')}")


def main() -> None:
    args = sys.argv[1:]
    if args[:1] == ["--responder"]:
        _, fid, *texto = args
        slack_responder(fid, " ".join(texto))
        print(f"respondido em {fid}")
        return
    if args[:1] == ["--done"]:
        _, fid, sha, *nota = args
        l = ledger()
        versao = proxima_versao()
        l["tratados"][fid] = {"commit": sha, "nota": " ".join(nota), "versao": versao, "em": time.strftime("%Y-%m-%dT%H:%M:%S")}
        LEDGER.write_text(json.dumps(l, ensure_ascii=False, indent=2) + "\n")
        print(f"registrado {fid} → {sha} · sobe na {versao}")
        # Regra da fundadora (ago/2026): resolveu, avisa NA MENSAGEM, com a versão.
        if fid.startswith("slack:"):
            try:
                slack_responder(fid, f"Resolvido ✅ ({sha}) — sobe na {versao}. {' '.join(nota)}".strip())
                print("  respondido na thread")
            except Exception as e:  # noqa: BLE001
                print(f"  sem resposta na thread: {e}", file=sys.stderr)
        return
    l = ledger()["tratados"]
    todos = feedbacks()
    try:
        todos += slack_feedbacks()
    except Exception as e:  # noqa: BLE001 — a fila do TestFlight não morre por causa da do Slack
        print(f"slack indisponível: {e}", file=sys.stderr)
    todos.sort(key=lambda f: f["em"] or "", reverse=True)
    if args[:1] == ["--all"]:
        for f in todos:
            f["tratado"] = l.get(f["id"])
        print(json.dumps(todos, ensure_ascii=False, indent=2))
        return
    pendentes = [f for f in todos if f["id"] not in l]
    print(json.dumps(pendentes, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
