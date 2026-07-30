"""Log estruturado do agente.

Log de linha solta não serve aqui: uma geração passa por recuperação de
conhecimento, chamada de modelo, validação e julgamento, e o que se quer depois
é reconstruir uma geração específica pelo `trace_id`. Campo nomeado permite
isso; string formatada não.

**Nada de valor biométrico nem flag clínica junto do id do usuário.** Vale a
mesma regra do backend: `trace_id` é o identificador que circula no log, e ele
não diz quem é a pessoa.
"""

from __future__ import annotations

import json
import logging
import sys
from typing import Any

from core.settings import settings


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname.lower(),
            "event": record.getMessage(),
            "logger": record.name,
        }
        extra = getattr(record, "fields", None)
        if extra:
            payload.update(extra)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


class BoundLogger:
    """Superfície mínima de log estruturado: `log.info("evento", campo=valor)`."""

    def __init__(self, name: str) -> None:
        self._log = logging.getLogger(name)

    def _emit(self, level: int, event: str, exc_info: bool = False, **fields: Any) -> None:
        self._log.log(level, event, extra={"fields": fields}, exc_info=exc_info)

    def debug(self, event: str, **fields: Any) -> None:
        self._emit(logging.DEBUG, event, **fields)

    def info(self, event: str, **fields: Any) -> None:
        self._emit(logging.INFO, event, **fields)

    def warning(self, event: str, **fields: Any) -> None:
        self._emit(logging.WARNING, event, **fields)

    def error(self, event: str, exc_info: bool = False, **fields: Any) -> None:
        self._emit(logging.ERROR, event, exc_info=exc_info, **fields)


def configure_logging() -> None:
    root = logging.getLogger()
    if any(isinstance(h.formatter, _JsonFormatter) for h in root.handlers):
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    root.handlers = [handler]
    root.setLevel(settings.log_level)


def get_logger(name: str) -> BoundLogger:
    configure_logging()
    return BoundLogger(name)
