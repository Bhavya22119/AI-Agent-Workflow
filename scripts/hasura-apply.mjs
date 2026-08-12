#!/usr/bin/env node
/**
 * Applies this app's Hasura metadata (table tracking, relationships, both
 * permission layers, Actions, Event Triggers, Cron Trigger) to the Nhost
 * project.
 *
 * It deliberately does NOT blind-replace the whole metadata document. Nhost
 * manages the auth and storage schemas in the same Hasura instance, so the
 * script:
 *
 *   1. exports the live metadata,
 *   2. strips every object this app owns (so re-running is idempotent, and
 *      objects removed from the YAML disappear from Hasura),
 *   3. merges the hand-written YAML back in — including a narrow additive
 *      override for auth.users that keeps Nhost's own relationships,
 *   4. substitutes {{PLACEHOLDER}} values from the environment,
 *   5. replaces the metadata and asserts it is consistent.
 *
 * It also writes two generated artefacts for the repo:
 *   nhost/metadata/actions.graphql          (SDL view of actions.yaml)
 *   nhost/metadata/exported-metadata.json   (the full live metadata, as applied)
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import YAML from 'yaml';
import { config, env, ROOT } from './lib/env.mjs';
import { metadata, log } from './lib/hasura.mjs';

const MD = resolve(ROOT, 'nhost/metadata');

/** Objects owned by this application. Anything else in the metadata is left alone. */
const OWNED = {
  functions: ['start_workflow_run', 'consume_run_quota'],
  actions: [
    'triggerWorkflowRun',
    'approveStep',
    'rejectStep',
    'triggerWorkflowWebhook',
    'createOrganization',
    'upsertOrgMember',
    'getWebhookEndpoint',
    // legacy names from the previous implementation, removed on apply
    'invokeWorkflowWebhook',
  ],
  customTypes: [
    'TriggerRunOutput',
    'StepDecisionOutput',
    'CreateOrganizationOutput',
    'OrgMemberOutput',
    'WebhookEndpointOutput',
    // legacy
    'TriggerWorkflowRunOutput',
    'ApproveStepOutput',
  ],
  cronTriggers: ['workflow_scheduler'],
};

function loadYaml(file) {
  return YAML.parse(readFileSync(resolve(MD, file), 'utf8'));
}

/** Make sure the shared secrets exist; generate and persist them if not. */
function ensureSecrets() {
  const needed = ['HASURA_ACTION_SECRET', 'HASURA_WEBHOOK_SECRET'];
  const generated = [];
  const values = {};
  for (const key of needed) {
    const existing = env(key);
    if (existing) {
      values[key] = existing;
      continue;
    }
    const value = randomBytes(32).toString('hex');
    values[key] = value;
    generated.push(`${key}=${value}`);
    process.env[key] = value;
  }
  if (generated.length) {
    const envFile = resolve(ROOT, '.env.local');
    const prefix = existsSync(envFile) ? '\n' : '';
    appendFileSync(
      envFile,
      `${prefix}# Shared secrets between Hasura and the Action/Event handlers (generated ${new Date().toISOString()})\n${generated.join('\n')}\n`
    );
    log.warn(`Generated ${generated.length} missing secret(s) and appended them to .env.local`);
    log.info('Set the same values in your Vercel project environment when you deploy.');
  }
  return values;
}

/** Recursively replace {{VAR}} placeholders in every string of a structure. */
function substitute(node, vars) {
  if (typeof node === 'string') {
    return node.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
      const value = vars[key];
      if (!value) {
        throw new Error(
          `Metadata references {{${key}}} but that variable is not set. Add it to .env.local.`
        );
      }
      return value;
    });
  }
  if (Array.isArray(node)) return node.map((item) => substitute(item, vars));
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, substitute(v, vars)]));
  }
  return node;
}

/**
 * The live metadata contains the substituted action/event secrets. Replace them
 * with placeholders before writing the exported copy into the repo, so the
 * committed artefact never carries a credential.
 */
function redactSecrets(node) {
  if (Array.isArray(node)) return node.map(redactSecrets);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => {
        if (key === 'headers' && Array.isArray(value)) {
          return [
            key,
            value.map((header) =>
              header && typeof header === 'object' && 'value' in header
                ? { ...header, value: '<redacted>' }
                : header
            ),
          ];
        }
        return [key, redactSecrets(value)];
      })
    );
  }
  return node;
}

/** Render actions.yaml as GraphQL SDL, for humans and for the Hasura CLI. */
function renderActionsSdl(actions, customTypes) {
  const lines = [
    '# GENERATED FILE — do not edit.',
    '# Produced from nhost/metadata/actions.yaml by scripts/hasura-apply.mjs.',
    '',
  ];
  const byType = (kind) =>
    actions.filter((a) => (a.definition.type ?? 'mutation') === kind);

  for (const [kind, label] of [
    ['query', 'Query'],
    ['mutation', 'Mutation'],
  ]) {
    const group = byType(kind);
    if (!group.length) continue;
    lines.push(`type ${label} {`);
    for (const action of group) {
      const args = (action.definition.arguments ?? [])
        .map((arg) => `${arg.name}: ${arg.type}`)
        .join(', ');
      lines.push(`  ${action.name}${args ? `(${args})` : ''}: ${action.definition.output_type}`);
    }
    lines.push('}', '');
  }

  for (const object of customTypes.objects ?? []) {
    if (object.description) lines.push(`"""${object.description}"""`);
    lines.push(`type ${object.name} {`);
    for (const field of object.fields) lines.push(`  ${field.name}: ${field.type}`);
    lines.push('}', '');
  }
  return lines.join('\n');
}

/**
 * Merge our additive auth.users override into the tracked table entry that
 * Nhost created, instead of replacing it.
 */
function mergeAuthOverride(liveTables, override) {
  const target = liveTables.find(
    (t) => t.table.schema === override.table.schema && t.table.name === override.table.name
  );
  if (!target) {
    log.warn(`auth.${override.table.name} is not tracked; adding it as a new entry`);
    liveTables.push(override);
    return;
  }
  const existingRels = target.array_relationships ?? [];
  const incomingRels = override.array_relationships ?? [];
  target.array_relationships = [
    ...existingRels.filter((r) => !incomingRels.some((i) => i.name === r.name)),
    ...incomingRels,
  ];
  // Replace only the `user` role select permission; leave any other role alone.
  const incomingPerms = override.select_permissions ?? [];
  target.select_permissions = [
    ...(target.select_permissions ?? []).filter(
      (p) => !incomingPerms.some((i) => i.role === p.role)
    ),
    ...incomingPerms,
  ];
}

async function main() {
  log.step(`Applying Hasura metadata to ${config.subdomain}.${config.region}`);

  const secrets = ensureSecrets();
  const vars = {
    APP_BASE_URL: config.appBaseUrl(),
    ...secrets,
  };
  log.info(`APP_BASE_URL = ${vars.APP_BASE_URL}`);
  if (vars.APP_BASE_URL.includes('localhost')) {
    log.warn(
      'APP_BASE_URL points at localhost, which Nhost-hosted Hasura cannot reach.\n' +
        '    Actions/Event Triggers will only fire once APP_BASE_URL is a public URL\n' +
        '    (your Vercel deployment or a tunnel). See README "Two transports".'
    );
  }

  const appTables = loadYaml('app-tables.yaml');
  const appFunctions = loadYaml('functions.yaml');
  const authOverrides = loadYaml('auth-overrides.yaml');
  const actionsDoc = loadYaml('actions.yaml');
  const cronDoc = loadYaml('cron-triggers.yaml');

  const live = await metadata('export_metadata');
  const source = live.sources.find((s) => s.name === 'default');
  if (!source) throw new Error('No Hasura source named "default" on this project.');

  // 1. Drop everything we own, so this script is idempotent.
  //    This app owns the whole `public` schema, so every public entry is
  //    dropped and re-added from YAML; auth.* and storage.* are preserved.
  source.tables = source.tables.filter((t) => t.table.schema !== 'public');
  source.functions = (source.functions ?? []).filter(
    (f) => !(f.function.schema === 'public' && OWNED.functions.includes(f.function.name))
  );
  live.actions = (live.actions ?? []).filter((a) => !OWNED.actions.includes(a.name));
  live.custom_types = live.custom_types ?? {};
  live.custom_types.objects = (live.custom_types.objects ?? []).filter(
    (o) => !OWNED.customTypes.includes(o.name)
  );
  live.cron_triggers = (live.cron_triggers ?? []).filter(
    (c) => !OWNED.cronTriggers.includes(c.name)
  );

  // 2. Merge ours back in.
  source.tables.push(...substitute(appTables, vars));
  source.functions = [...(source.functions ?? []), ...appFunctions];
  for (const override of authOverrides) mergeAuthOverride(source.tables, override);

  live.actions = [...live.actions, ...substitute(actionsDoc.actions, vars)];
  const incomingTypes = actionsDoc.custom_types ?? {};
  live.custom_types = {
    enums: [...(live.custom_types.enums ?? []), ...(incomingTypes.enums ?? [])],
    input_objects: [
      ...(live.custom_types.input_objects ?? []),
      ...(incomingTypes.input_objects ?? []),
    ],
    objects: [...live.custom_types.objects, ...(incomingTypes.objects ?? [])],
    scalars: [...(live.custom_types.scalars ?? []), ...(incomingTypes.scalars ?? [])],
  };
  live.cron_triggers = [...live.cron_triggers, ...substitute(cronDoc.cron_triggers, vars)];

  // 3. Apply.
  await metadata('replace_metadata', { allow_inconsistent_metadata: false, metadata: live });
  log.ok(
    `Tracked ${appTables.length} tables/views, ${appFunctions.length} functions, ` +
      `${actionsDoc.actions.length} actions, 1 cron trigger`
  );

  const inconsistent = await metadata('get_inconsistent_metadata');
  if (inconsistent.is_consistent === false || (inconsistent.inconsistent_objects ?? []).length) {
    log.fail('Metadata is inconsistent:');
    console.log(JSON.stringify(inconsistent.inconsistent_objects, null, 2));
    process.exit(1);
  }
  log.ok('Metadata is consistent');

  // 4. Generated artefacts for the repo.
  writeFileSync(
    resolve(MD, 'actions.graphql'),
    renderActionsSdl(actionsDoc.actions, actionsDoc.custom_types ?? {})
  );
  const exported = await metadata('export_metadata');
  writeFileSync(
    resolve(MD, 'exported-metadata.json'),
    `${JSON.stringify(redactSecrets(exported), null, 2)}\n`
  );
  log.ok('Wrote nhost/metadata/actions.graphql and exported-metadata.json');
}

main().catch((err) => {
  log.fail(err.message);
  process.exit(1);
});
