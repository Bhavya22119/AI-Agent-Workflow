#!/usr/bin/env node
/**
 * One-command setup: schema, then Hasura metadata, then demo data.
 *
 *   npm run setup            # apply schema (drop + recreate), metadata, seed
 *   npm run setup -- --keep  # keep existing data: apply metadata + seed only
 *
 * Each step is a separate script you can run on its own; this only sequences
 * them, because the order matters — metadata cannot track tables that do not
 * exist yet, and seeding needs both.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { ROOT } from './lib/env.mjs';
import { log } from './lib/hasura.mjs';

const keepData = process.argv.includes('--keep');

function run(script, args = []) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [resolve(ROOT, 'scripts', script), ...args], {
      stdio: 'inherit',
      cwd: ROOT,
    });
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${script} exited with code ${code}`)),
    );
    child.on('error', reject);
  });
}

async function main() {
  if (keepData) {
    log.warn('--keep: leaving existing rows in place, applying metadata and seed only');
  } else {
    await run('db-apply.mjs', ['--reset']);
  }
  await run('hasura-apply.mjs');
  await run('seed.mjs');

  console.log(`
Setup complete. Next:

  npm run dev        then open http://localhost:3000 and sign in with an
                     account printed above
  npm run verify     run the 70-check assertion suite (needs the dev server)

If Actions fail with "Hasura could not reach the Action handler", you are running
locally: set NEXT_PUBLIC_ACTION_TRANSPORT=direct in .env.local, or deploy and
re-run "npm run hasura:apply" with APP_BASE_URL set to the deployment URL.
`);
}

main().catch((err) => {
  log.fail(err.message);
  process.exit(1);
});
