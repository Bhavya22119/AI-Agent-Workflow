#!/usr/bin/env node
/**
 * Applies the SQL schema to the Nhost Postgres database through Hasura's
 * /v2/query endpoint (no Docker, no Hasura CLI required).
 *
 *   node scripts/db-apply.mjs           # apply migrations that have not run yet
 *   node scripts/db-apply.mjs --reset   # drop app objects, then apply all of them
 *
 * Applied migrations are recorded in `public.schema_migrations`, so re-running is
 * safe and only new migrations execute.
 *
 * `--reset` only ever touches objects this application owns in the `public`
 * schema. The Nhost-managed auth and storage schemas — and therefore every user
 * account — are left alone.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, ROOT } from './lib/env.mjs';
import { runSql, log } from './lib/hasura.mjs';

const reset = process.argv.includes('--reset');

function migrations() {
  const base = resolve(ROOT, 'nhost/migrations/default');
  return readdirSync(base)
    .filter((name) => statSync(resolve(base, name)).isDirectory())
    .sort()
    .map((name) => ({ name, up: resolve(base, name, 'up.sql') }));
}

async function ensureLedger() {
  await runSql(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function appliedMigrations() {
  const result = await runSql('SELECT name FROM public.schema_migrations ORDER BY name;', {
    readOnly: true,
  });
  return new Set((result.result ?? []).slice(1).map((row) => row[0]));
}

async function tableExists(name) {
  const result = await runSql(
    `SELECT to_regclass('public.${name}') IS NOT NULL AS present;`,
    { readOnly: true },
  );
  return (result.result ?? [])[1]?.[0] === 't';
}

async function main() {
  log.step(`Applying SQL schema to ${config.subdomain}.${config.region}`);

  if (reset) {
    const sql = readFileSync(resolve(ROOT, 'scripts/sql/reset.sql'), 'utf8');
    // cascade:true lets Hasura drop the metadata objects (tracked tables,
    // relationships, permissions) that depend on the tables being removed.
    await runSql(sql, { cascade: true });
    log.ok('Dropped previous application schema (auth/storage untouched)');
  }

  await ensureLedger();
  let applied = await appliedMigrations();
  const all = migrations();

  // One-time adoption: a database that already has the schema but no ledger was
  // created before the ledger existed. Record the first migration as applied
  // rather than trying to run it again over live tables.
  if (!reset && applied.size === 0 && (await tableExists('organizations'))) {
    const first = all[0];
    await runSql(
      `INSERT INTO public.schema_migrations (name) VALUES ('${first.name}')
         ON CONFLICT (name) DO NOTHING;`,
    );
    applied = await appliedMigrations();
    log.warn(`Recorded ${first.name} as already applied (schema was created before the ledger)`);
  }

  const pending = all.filter((migration) => !applied.has(migration.name));
  if (pending.length === 0) {
    log.ok(`No pending migrations (${all.length} already applied)`);
  }

  for (const migration of pending) {
    const sql = readFileSync(migration.up, 'utf8');
    await runSql(sql, { cascade: true });
    await runSql(
      `INSERT INTO public.schema_migrations (name) VALUES ('${migration.name}')
         ON CONFLICT (name) DO NOTHING;`,
    );
    log.ok(`Applied migration ${migration.name}`);
  }

  const check = await runSql(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> 'schema_migrations'
      ORDER BY table_name;`,
    { readOnly: true },
  );
  const names = (check.result ?? []).slice(1).map((row) => row[0]);
  log.ok(`public schema now has ${names.length} objects: ${names.join(', ')}`);
}

main().catch((err) => {
  log.fail(err.message);
  process.exit(1);
});
