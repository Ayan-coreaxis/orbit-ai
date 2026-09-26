# Old SQLite setup (archive)

Orbit ran on SQLite (`prisma/dev.db`) until 2026-09-26. It now runs on **Postgres** (see `web/.env.example`).
These files are the old SQLite migrations and schema, kept only so `scripts/sqlite-to-postgres.mjs`
can copy an old `dev.db` into Postgres. Nothing reads them at runtime.
