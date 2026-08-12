/**
 * The `{{ path }}` templating used by step configs, which is how output flows
 * from one step into the next.
 *
 * Available roots:
 *   {{prev}}                  output of the previous completed step
 *   {{prev.text}}             a field of it (any depth, arrays by index)
 *   {{steps.1.output.text}}   output of the step at position 1
 *   {{trigger.payload.foo}}   the payload the run was started with
 *   {{run.id}}                ids of the current run
 *   {{input}} / {{prev_output}}  aliases for {{prev}}, kept for readability
 *
 * A placeholder that fills an entire string resolves to the raw value, so
 * `{"payload": "{{trigger.payload}}"}` produces a real nested object rather than
 * the string "[object Object]". Placeholders embedded in a longer string are
 * stringified.
 *
 * Unresolvable paths render as an empty string rather than throwing: a missing
 * optional field should not fail a run, and the step's recorded `input` shows
 * exactly what was sent.
 */
import type { Json, RunContext } from './types';

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;
const WHOLE_PLACEHOLDER = /^\{\{\s*([^{}]+?)\s*\}\}$/;

function normalizeRoot(path: string): string {
  if (path === 'input' || path === 'prev_output') return 'prev';
  if (path.startsWith('input.')) return `prev.${path.slice('input.'.length)}`;
  if (path.startsWith('prev_output.')) return `prev.${path.slice('prev_output.'.length)}`;
  return path;
}

/** Walks a dotted path through the context. Returns undefined if absent. */
export function lookupPath(ctx: RunContext, rawPath: string): Json | undefined {
  const path = normalizeRoot(rawPath.trim());
  if (!path) return undefined;

  let current: unknown = ctx;
  for (const rawSegment of path.split('.')) {
    const segment = rawSegment.trim();
    if (segment === '') return undefined;
    if (current === null || current === undefined) return undefined;

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current as Json | undefined;
}

function stringify(value: Json | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Renders a template string; always returns a string. */
export function renderTemplate(template: string, ctx: RunContext): string {
  return template.replace(PLACEHOLDER, (_match, path: string) =>
    stringify(lookupPath(ctx, path)),
  );
}

/**
 * Renders a string that may be a single whole placeholder, preserving the
 * resolved value's type in that case.
 */
export function resolveValue(template: string, ctx: RunContext): Json {
  const whole = template.match(WHOLE_PLACEHOLDER);
  if (whole) {
    const value = lookupPath(ctx, whole[1]);
    return value === undefined ? '' : value;
  }
  return renderTemplate(template, ctx);
}

/** Recursively renders every string inside a config value. */
export function renderDeep<T extends Json>(value: T, ctx: RunContext): Json {
  if (typeof value === 'string') return resolveValue(value, ctx);
  if (Array.isArray(value)) return value.map((item) => renderDeep(item, ctx));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renderDeep(item as Json, ctx)]),
    );
  }
  return value;
}

/** Reads a string field out of a step config, rendering templates in it. */
export function configString(
  config: Record<string, Json>,
  key: string,
  ctx: RunContext,
  fallback = '',
): string {
  const raw = config[key];
  if (typeof raw !== 'string') return raw === undefined || raw === null ? fallback : stringify(raw);
  return renderTemplate(raw, ctx);
}
