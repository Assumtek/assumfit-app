#!/usr/bin/env python3
"""
Receptor de eventos do #assumfit-qa-feedback por Socket Mode.

Conexão de SAÍDA para o Slack — nenhum endpoint público, nenhum backend no
meio. Cada mensagem nova de gente (não do bot) vira UMA linha no stdout, e é
essa linha que acorda a sessão do fluxo de bugs. Precisa de um token de nível
de app (`xapp-…`, escopo connections:write) em `~/.credenciais/assumfit/slack.env`
como SLACK_APP_TOKEN, e do evento `message.channels` assinado no app.

Reconecta sozinho quando o Slack pede (`disconnect`) ou quando a conexão cai.
"""
import asyncio, json, sys, time, urllib.request
from pathlib import Path

import websockets

ENV = Path.home() / ".credenciais/assumfit/slack.env"
CANAL = "C0BR3T267DJ"


def env() -> dict:
    out = {}
    for l in ENV.read_text().splitlines():
        if "=" in l and not l.lstrip().startswith("#"):
            k, v = l.split("=", 1)
            out[k.strip()] = v.strip().strip('"')
    return out


def abrir_conexao(app_token: str) -> str:
    req = urllib.request.Request(
        "https://slack.com/api/apps.connections.open", method="POST",
        headers={"Authorization": f"Bearer {app_token}", "Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    if not d.get("ok"):
        raise RuntimeError(f"apps.connections.open: {d.get('error')}")
    return d["url"]


async def escutar(app_token: str) -> None:
    url = abrir_conexao(app_token)
    async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
        async for bruto in ws:
            m = json.loads(bruto)
            tipo = m.get("type")
            if tipo == "hello":
                print("LIGADO", flush=True)
                continue
            if tipo == "disconnect":
                print(f"RECONECTAR {m.get('reason')}", flush=True)
                return
            # Toda envelope é confirmada na hora — sem isso o Slack reenvia e
            # depois derruba a conexão.
            if m.get("envelope_id"):
                await ws.send(json.dumps({"envelope_id": m["envelope_id"]}))
            if tipo != "events_api":
                continue
            ev = (m.get("payload") or {}).get("event") or {}
            if ev.get("type") != "message" or ev.get("channel") != CANAL:
                continue
            if ev.get("bot_id") or ev.get("subtype") in ("message_changed", "message_deleted", "channel_join", "bot_message"):
                continue
            texto = (ev.get("text") or "").replace("\n", " ")
            thread = " (em thread)" if ev.get("thread_ts") and ev.get("thread_ts") != ev.get("ts") else ""
            print(f"NOVA slack:{ev.get('ts')} {ev.get('user')}{thread}: {texto[:200]}", flush=True)


def main() -> None:
    token = env().get("SLACK_APP_TOKEN")
    if not token:
        print("SEM_TOKEN: falta SLACK_APP_TOKEN (xapp-…) em ~/.credenciais/assumfit/slack.env", flush=True)
        sys.exit(2)
    atraso = 2
    while True:
        try:
            asyncio.run(escutar(token))
            atraso = 2
        except Exception as e:  # noqa: BLE001 — reconexão é a regra, não a exceção
            print(f"QUEDA {type(e).__name__}: {e}", flush=True)
            time.sleep(atraso)
            atraso = min(atraso * 2, 60)


if __name__ == "__main__":
    main()
