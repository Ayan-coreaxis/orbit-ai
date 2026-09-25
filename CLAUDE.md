# Instructions for every Claude session on this repo

This repo is worked on by more than one Claude session (a local desktop session and a cloud session). They share context through **`CONTEXT.md`**.

1. Before starting any task: `git pull`, then read `CONTEXT.md` and `TASKS.md`. App code is in `web/` — also follow `web/AGENTS.md` (Next.js 16 has breaking changes).
2. After finishing a piece of work: update `CONTEXT.md` (Status, Changelog, anything in "where things live" / "decisions" that changed), then commit and push so the other session sees it.
3. Never commit secrets: `.env*` (only `web/.env.example` is allowed), `*.db`, or `web/public/uploads/`.
4. The owner writes in Roman Urdu and wants short, direct replies.
5. Anything that changes a seller's live store goes through an Apply proposal — keep that rule when adding Orchestrator powers.
