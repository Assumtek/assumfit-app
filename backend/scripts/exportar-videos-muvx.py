#!/usr/bin/env python3
"""Gera `prisma/data/exercise-videos.json` a partir do catálogo do MUVX.

Os exercícios do AssumFit são exportação do MUVX (mesmos ids); o vídeo
demonstrativo fica lá, na tabela `exercises` (coluna `videoUrl`) ou na
biblioteca `exercise_videos` (via `exerciseVideoId`). Este script casa por id
e escreve só o que o AssumFit usa.

Uso:  MUVX_DATABASE_URL=postgresql://... python3 scripts/exportar-videos-muvx.py
Depois: npm run seed:exercises (local) ou no contêiner de produção.

Em 22/08/2026 rodou contra HOMOLOGAÇÃO (cdn-homol.muvx.app): 116 vídeos de
370 exercícios casados. Produção deve ter mais — regerar quando houver acesso.
Precisa de `psycopg` (o venv de `ai/` tem).
"""
import json, os, re, sys
from pathlib import Path

import psycopg

url = os.environ.get("MUVX_DATABASE_URL", "").split("?")[0]
if not url:
    sys.exit("defina MUVX_DATABASE_URL")
raiz = Path(__file__).resolve().parents[1]
ids = {e["id"] for e in json.load(open(raiz / "prisma/data/exercises.json"))}
with psycopg.connect(url, connect_timeout=15) as c, c.cursor() as cur:
    cur.execute(
        '''select e.id, coalesce(e."videoUrl", v."videoUrl"), v."thumbnailUrl"
           from exercises e left join exercise_videos v on v.id = e."exerciseVideoId"
           where e.id = any(%s) and coalesce(e."videoUrl", v."videoUrl") is not null order by e.id''',
        (list(ids),),
    )
    rows = [{"id": r[0], "videoUrl": r[1], "thumbnailUrl": r[2]} for r in cur.fetchall()]
host = re.sub(r"https?://([^/]+)/.*", r"\1", rows[0]["videoUrl"]) if rows else "-"
saida = raiz / "prisma/data/exercise-videos.json"
json.dump({"origem": f"catálogo do MUVX ({host})", "videos": rows}, open(saida, "w"), indent=2, ensure_ascii=False)
print(f"{len(rows)} vídeos de {len(ids)} exercícios → {saida}")
