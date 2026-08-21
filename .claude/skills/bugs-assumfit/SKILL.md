---
name: bugs-assumfit
description: >
  Lê o feedback dos testadores do AssumFit (TestFlight, via API), separa bug de
  pedido de recurso, reproduz com evidência de produção, corrige na branch com
  testes verdes, empurra e registra no ledger. Use quando a fundadora pedir para
  "ler os bugs", "ver o que os testadores mandaram", "rodar o fluxo de bugs", ou
  como corpo de um /loop. NÃO gera build nem faz deploy: isso continua sendo
  decisão dela, a cada rodada.
---

# /bugs-assumfit — do relato ao commit, sem passar por ninguém

## O que este fluxo É e o que NÃO é

É um ciclo fechado até o **push**: ler, classificar, reproduzir, corrigir, testar,
commitar, registrar. **Não** gera build, **não** faz deploy e **não** responde ao
testador. Essas três são de quem manda no produto, e a rodada termina com um
relatório que a deixa pronta para decidir.

## 1. Ler

```bash
python3 .claude/skills/bugs-assumfit/scripts/feedback.py          # pendentes
python3 .claude/skills/bugs-assumfit/scripts/feedback.py --all    # com os tratados
```

Duas fontes, na mesma fila:

- **TestFlight** (sempre): capturas de tela e crashes, pela API da Apple.
- **Slack `#assumfit-qa-feedback`** (quando `~/.credenciais/assumfit/slack.env`
  existir, com `SLACK_TOKEN=xoxb-…` e `SLACK_CHANNEL=assumfit-qa-feedback`):
  é onde os relatos do WhatsApp são colados. O espaço de trabalho do AssumFit
  é outro — o conector da sessão não o enxerga —, por isso o token de bot
  (escopos `channels:history`, `channels:read`, `users:read`; `groups:*` se o
  canal for privado), com o bot convidado ao canal. Itens vêm com `id`
  `slack:<ts>` e `thread` (link da mensagem).

Cada item traz `id`, `em`, `build`, `testador`, `aparelho`, `comentario` e
`capturas` (URLs, válidas por pouco tempo — baixe na hora se precisar).
Lista vazia → registre "sem pendências" e encerre. Não invente trabalho.

## 2. Classificar ANTES de abrir o código

Para cada pendente, decida e anote uma destas categorias:

| categoria | o que fazer |
|---|---|
| **defeito** | segue para o passo 3 |
| **recurso que já existe** | a correção é de VISIBILIDADE (texto, posição, estado vazio que explica), não de função. Dois dos cinco primeiros relatos eram isso |
| **recurso novo** | não implementa. Vai para o relatório como proposta, com estimativa |
| **elogio / ambíguo** | não toca no código. Vai para o relatório com a pergunta a fazer ao testador |
| **já corrigido** | aponte o commit/build e registre no ledger sem mexer em nada |

Leia o tom. "Não sei qual a metodologia, ele intercala peito e costas" era uma
pergunta; "entendeu que quero ganhar massa" era elogio. Relato sem verbo de
queixa não é defeito até prova em contrário.

## 3. Reproduzir com evidência — nunca por hipótese

Evidência de produção antes de qualquer edição. O que está disponível:

- **Banco**: `ssh -i ~/.ssh/assumfit-prod.pem ubuntu@52.67.144.172 "docker exec assumfit-postgres-1 psql -U assumfit -d assumfit -tAc \"...\""`. Só agregados e presença (`IS NOT NULL`, `jsonb_typeof`, contagens) — **nunca** selecione valor biométrico com identificação junto (LGPD).
- **Log de acesso**: `docker exec assumfit-proxy-1 sh -c 'cat /var/log/caddy/api-access.log'` (JSON por linha; `status 0` com `duration` redondo = o cliente desligou no teto).
- **Log do backend**: `docker logs assumfit-backend-1 --since ...` — some a cada deploy; o do Caddy não.
- **O app do testador**: o `build` do feedback diz se a correção já estava lá.

Se a evidência contradisser o relato, o relatório diz isso — com o dado.

## 4. Corrigir

- Uma correção por defeito, no lugar de origem (domínio antes de tela; ponte
  antes de store). Respeite [CLAUDE.md](../../../CLAUDE.md) — tokens, `ratings.ts`,
  sem cor em `StyleSheet`, etc.
- Swift mudou? Compile local **antes** de considerar pronto:
  `cd app/ios && xcodebuild -project Pods/Pods.xcodeproj -target QCBand -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build` (e o mesmo com `iOS Simulator`).
- Teste novo para todo comportamento de domínio que mudou.

## 5. Verificar — os três, sempre

```bash
cd app && npx tsc --noEmit && npx jest
cd backend && npx tsc --noEmit && npx jest
cd ai && ./venv/bin/python -m pytest tests -q
```

Qualquer vermelho: não commita, registra no relatório o que travou.

## 6. Commitar, empurrar, registrar

- Commit em pt-BR, no padrão do repositório (o que era, por que acontecia, o que
  muda), um por tema. Na branch corrente — **nunca** em `main`.
- `git push`.
- Para cada feedback resolvido (ou classificado como não-defeito):
  `python3 .claude/skills/bugs-assumfit/scripts/feedback.py --done <id> <sha> "<nota>"`
  e commite o `relatorios/bugs/ledger.json` junto.
- **Regra da fundadora (ago/2026): resolveu, responde NA MENSAGEM** — o `--done`
  já faz isso para itens do Slack, na thread, com o commit e a versão em que
  sobe (`1.0.3 (N+1)`, lida do `app.json`). Para item do TestFlight não há
  thread: a versão vai no relatório, e ela avisa o testador. A nota do `--done`
  vira a frase da resposta — escreva-a para o testador ler, não para o git.
- Classificado como "recurso já existe" ou "elogio" também responde: diz onde
  o recurso está. Silêncio numa mensagem respondida lê como ignorada.

## 7. Relatório da rodada

Escreva `relatorios/bugs/rodada-AAAA-MM-DD.md` e resuma para a fundadora:
por item — categoria, evidência, o que mudou, commit. No fim, **o que só ela
decide**: precisa de build? (código nativo → sim; JS → sim; backend → deploy.)
Há algo a perguntar a um testador? Há recurso novo proposto?

## Regras que não se negociam

- Correção sem evidência de produção não entra.
- Build, deploy e resposta ao testador são dela.
- Segredo não entra em log, relatório nem commit. Valor biométrico identificado, idem.
- Se o mesmo relato voltar depois de "corrigido", o defeito é o diagnóstico — abra com isso.
