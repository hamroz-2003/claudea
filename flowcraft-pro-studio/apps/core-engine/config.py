"""Engine configuration, SQLite state and the multi-key API rotator.

State lives in ``<data_dir>/flowcraft.db``:

* ``settings``  - key/value JSON blobs (LLM provider, default voice, ...)
* ``api_keys``  - BYOK keys per service with exhaustion timestamps
* ``jobs``      - background job history (status, progress, error)

Projects themselves are stored as human-readable ``project.json`` files under
``<data_dir>/projects/<project_id>/`` so they can be versioned and hand-edited.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator, Optional

ENGINE_ROOT = Path(__file__).resolve().parent
REPO_ROOT = ENGINE_ROOT.parent.parent
ASSETS_DIR = Path(os.environ.get("FLOWCRAFT_ASSETS", REPO_ROOT / "assets"))


def _default_data_dir() -> Path:
    env = os.environ.get("FLOWCRAFT_DATA")
    if env:
        return Path(env)
    return Path.home() / ".flowcraft-pro-studio"


@dataclass
class EngineSettings:
    host: str = os.environ.get("FLOWCRAFT_HOST", "127.0.0.1")
    port: int = int(os.environ.get("FLOWCRAFT_PORT", "4100"))
    data_dir: Path = field(default_factory=_default_data_dir)

    @property
    def projects_dir(self) -> Path:
        return self.data_dir / "projects"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "flowcraft.db"

    def ensure(self) -> None:
        self.projects_dir.mkdir(parents=True, exist_ok=True)


_SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT NOT NULL,
    label TEXT,
    secret TEXT NOT NULL,
    exhausted_until REAL NOT NULL DEFAULT 0,
    last_used REAL NOT NULL DEFAULT 0,
    failures INTEGER NOT NULL DEFAULT 0,
    UNIQUE(service, secret)
);
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    message TEXT,
    error TEXT,
    created REAL NOT NULL,
    updated REAL NOT NULL
);
"""


class StateStore:
    """Thread-safe SQLite wrapper (one connection per call, WAL mode)."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        with self._conn() as c:
            c.execute("PRAGMA journal_mode=WAL")
            c.executescript(_SCHEMA)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    # settings -------------------------------------------------------------- #
    def get_setting(self, key: str, default: Any = None) -> Any:
        with self._conn() as c:
            row = c.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def set_setting(self, key: str, value: Any) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                "INSERT INTO settings(key, value) VALUES(?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, json.dumps(value)),
            )

    def all_settings(self) -> dict[str, Any]:
        with self._conn() as c:
            rows = c.execute("SELECT key, value FROM settings").fetchall()
        return {r["key"]: json.loads(r["value"]) for r in rows}

    # api keys -------------------------------------------------------------- #
    def add_key(self, service: str, secret: str, label: str | None = None) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                "INSERT OR IGNORE INTO api_keys(service, label, secret) VALUES(?, ?, ?)",
                (service, label, secret.strip()),
            )

    def remove_key(self, key_id: int) -> None:
        with self._lock, self._conn() as c:
            c.execute("DELETE FROM api_keys WHERE id=?", (key_id,))

    def list_keys(self, service: str | None = None) -> list[dict]:
        q = "SELECT id, service, label, secret, exhausted_until, last_used, failures FROM api_keys"
        args: tuple = ()
        if service:
            q += " WHERE service=?"
            args = (service,)
        with self._conn() as c:
            rows = [dict(r) for r in c.execute(q + " ORDER BY id", args).fetchall()]
        for r in rows:  # never hand full secrets to the UI
            s = r.pop("secret")
            r["masked"] = f"{s[:4]}…{s[-4:]}" if len(s) > 10 else "…"
        return rows

    def _raw_keys(self, service: str) -> list[sqlite3.Row]:
        with self._conn() as c:
            return c.execute(
                "SELECT * FROM api_keys WHERE service=? ORDER BY last_used ASC, id ASC", (service,)
            ).fetchall()

    def mark_used(self, key_id: int) -> None:
        with self._lock, self._conn() as c:
            c.execute("UPDATE api_keys SET last_used=?, failures=0 WHERE id=?", (time.time(), key_id))

    def mark_exhausted(self, key_id: int, seconds: float) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE api_keys SET exhausted_until=?, failures=failures+1 WHERE id=?",
                (time.time() + seconds, key_id),
            )

    # jobs ------------------------------------------------------------------ #
    def upsert_job(self, job_id: str, *, project_id: str | None, kind: str, status: str,
                   progress: float = 0.0, message: str | None = None, error: str | None = None) -> None:
        now = time.time()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO jobs(id, project_id, kind, status, progress, message, error, created, updated)
                   VALUES(?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET status=excluded.status, progress=excluded.progress,
                   message=excluded.message, error=excluded.error, updated=excluded.updated""",
                (job_id, project_id, kind, status, progress, message, error, now, now),
            )

    def get_job(self, job_id: str) -> Optional[dict]:
        with self._conn() as c:
            row = c.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        return dict(row) if row else None

    def list_jobs(self, project_id: str | None = None, limit: int = 50) -> list[dict]:
        with self._conn() as c:
            if project_id:
                rows = c.execute("SELECT * FROM jobs WHERE project_id=? ORDER BY created DESC LIMIT ?",
                                 (project_id, limit)).fetchall()
            else:
                rows = c.execute("SELECT * FROM jobs ORDER BY created DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]


class NoKeyAvailable(RuntimeError):
    pass


class KeyRotator:
    """Round-robin over a service's BYOK keys, skipping exhausted ones.

    Callers report quota errors with :meth:`exhausted`; the key is parked
    until the provider's quota window resets (YouTube Data API: midnight
    Pacific, approximated as 24h; per-minute LLM limits: 60s).
    """

    def __init__(self, store: StateStore, service: str):
        self.store = store
        self.service = service

    def next(self) -> tuple[int, str]:
        now = time.time()
        for row in self.store._raw_keys(self.service):
            if row["exhausted_until"] <= now:
                self.store.mark_used(row["id"])
                return row["id"], row["secret"]
        env = os.environ.get(f"FLOWCRAFT_{self.service.upper()}_KEY")
        if env:
            return -1, env
        raise NoKeyAvailable(f"No usable {self.service} API key (all exhausted or none configured)")

    def exhausted(self, key_id: int, *, seconds: float = 24 * 3600) -> None:
        if key_id >= 0:
            self.store.mark_exhausted(key_id, seconds)

    def has_keys(self) -> bool:
        return bool(self.store._raw_keys(self.service)) or bool(
            os.environ.get(f"FLOWCRAFT_{self.service.upper()}_KEY")
        )
