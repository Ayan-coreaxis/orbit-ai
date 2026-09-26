#!/usr/bin/env node
/**
 * One-time copy of an old Orbit SQLite database (prisma/dev.db) into Postgres.
 *
 *   1. Point DATABASE_URL (and DIRECT_URL) at the new, EMPTY Postgres database.
 *   2. npx prisma migrate deploy          ← creates the tables
 *   3. node scripts/sqlite-to-postgres.mjs prisma/dev.db
 *
 * Needs Node 22.5+ (built-in node:sqlite). Copies every table row by row, converting SQLite's
 * 0/1 booleans and millisecond timestamps to real Postgres types. Foreign keys are checked only
 * after everything is in, so table order doesn't matter. Refuses to run into a non-empty database.
 */
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

const file = process.argv[2] || "prisma/dev.db";
const sqlite = new DatabaseSync(file, { readOnly: true });
const prisma = new PrismaClient();

const tables = sqlite
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'")
  .all()
  .map((r) => r.name);

const pgCols = await prisma.$queryRawUnsafe(
  "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema()",
);
const typeOf = new Map(pgCols.map((c) => [`${c.table_name}.${c.column_name}`, c.data_type]));
const pgTables = new Set(pgCols.map((c) => c.table_name));

for (const t of tables) {
  if (!pgTables.has(t)) continue;
  const [{ n }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${t}"`);
  if (n > 0) {
    console.error(`"${t}" in Postgres already has rows — run this only into an empty database.`);
    process.exit(1);
  }
}

function convert(value, pgType) {
  if (value === null || value === undefined) return null;
  if (pgType === "boolean") return value === 1 || value === "1" || value === true || value === "true";
  if (pgType?.startsWith("timestamp")) return new Date(typeof value === "number" || /^\d+$/.test(String(value)) ? Number(value) : String(value));
  if (pgType === "integer" || pgType === "bigint") return Number(value);
  if (pgType === "double precision" || pgType === "real" || pgType === "numeric") return Number(value);
  if (typeof value === "bigint") return Number(value);
  return value;
}

let total = 0;
await prisma.$transaction(
  async (tx) => {
    // Load every table first, check the foreign keys at the end.
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
    await tx.$executeRawUnsafe("SET session_replication_role = replica");
    for (const t of tables) {
      if (!pgTables.has(t)) {
        console.warn(`skip ${t} (not in the Postgres schema)`);
        continue;
      }
      const rows = sqlite.prepare(`SELECT * FROM "${t}"`).all();
      for (const row of rows) {
        const cols = Object.keys(row).filter((c) => typeOf.has(`${t}.${c}`));
        const vals = cols.map((c) => convert(row[c], typeOf.get(`${t}.${c}`)));
        const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
        await tx.$executeRawUnsafe(`INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${ph})`, ...vals);
      }
      if (rows.length) console.log(`${t}: ${rows.length}`);
      total += rows.length;
    }
    await tx.$executeRawUnsafe("SET session_replication_role = origin");
  },
  { timeout: 10 * 60 * 1000 },
);
console.log(`Done — copied ${total} rows from ${file}.`);
await prisma.$disconnect();
