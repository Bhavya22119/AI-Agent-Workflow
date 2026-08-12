/**
 * Pre-flight checks for a workflow graph.
 *
 * The engine runs what it is told. That is correct for an engine and wrong for
 * an editor: a condition wired to nothing, or reading a field the previous step
 * does not produce, will "succeed" by quietly ending the run — which looks
 * identical to a workflow that finished its work. These checks surface that on
 * the canvas *before* a run, so an incomplete workflow is visibly incomplete
 * rather than silently short.
 *
 * `error` blocks Run. `warning` does not — it is a shape that is legal but
 * probably not what was meant.
 */
import type { DraftStep, DraftTrigger, Json, StepType } from './types';

export interface NodeIssue {
  key: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface GraphIssues {
  issues: NodeIssue[];
  byKey: Map<string, NodeIssue[]>;
  errors: NodeIssue[];
  warnings: NodeIssue[];
}

const GRAPH_KEY = '__graph__';

function str(config: Record<string, Json>, key: string): string {
  const value = config[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** Which step's output `{{prev}}` refers to when this step runs. */
function predecessorOf(step: DraftStep, steps: DraftStep[]): DraftStep | undefined {
  return steps.find((candidate) =>
    Object.values(candidate.next ?? {}).some((target) => target === step.key),
  );
}

/** Fields a step type is known to publish, used to catch a template that cannot resolve. */
const OUTPUT_FIELDS: Partial<Record<StepType, string[]>> = {
  llm_call: ['text', 'provider', 'model', 'stubbed', 'latency_ms', 'usage'],
  http_request: ['status', 'ok', 'url', 'method', 'body'],
  conditional_branch: ['matched', 'branch', 'evaluated', 'followed', 'ends_run'],
  approval_gate: ['approved', 'approved_by', 'approved_at', 'note', 'awaiting_approval', 'message'],
  db_write: ['workflow_output_id', 'key', 'value'],
  notify: ['notification_id', 'channel', 'delivery'],
};

/** Flags `{{prev.foo}}` when the preceding step does not produce `foo`. */
function checkPrevReferences(
  step: DraftStep,
  steps: DraftStep[],
  push: (severity: NodeIssue['severity'], message: string) => void,
): void {
  const previous = predecessorOf(step, steps);
  if (!previous) return;
  const known = OUTPUT_FIELDS[previous.type];
  if (!known) return;

  const text = JSON.stringify(step.config ?? {});
  const matches = text.matchAll(/\{\{\s*(?:prev|input|prev_output)\.([A-Za-z0-9_]+)/g);
  const flagged = new Set<string>();
  for (const match of matches) {
    const field = match[1];
    if (known.includes(field) || flagged.has(field)) continue;
    flagged.add(field);
    push(
      'warning',
      `{{prev.${field}}} will be empty: the previous node (${previous.name || previous.type}) outputs ${known
        .slice(0, 4)
        .map((name) => `.${name}`)
        .join(', ')}.`,
    );
  }
}

export function validateGraph(steps: DraftStep[], triggers: DraftTrigger[]): GraphIssues {
  const issues: NodeIssue[] = [];
  const add = (key: string, severity: NodeIssue['severity'], message: string) =>
    issues.push({ key, severity, message });

  /* ------------------------------------------------------------ per node */
  for (const step of steps) {
    const config = step.config ?? {};
    const push = (severity: NodeIssue['severity'], message: string) =>
      add(step.key, severity, message);

    switch (step.type) {
      case 'llm_call':
        if (!str(config, 'prompt')) push('error', 'No prompt — this node has nothing to send.');
        break;

      case 'http_request': {
        const url = str(config, 'url');
        if (!url) push('error', 'No URL.');
        else if (!/^https?:\/\//i.test(url) && !url.includes('{{')) {
          push('error', 'The URL must start with http:// or https://.');
        }
        break;
      }

      case 'db_write':
        if (!str(config, 'key')) push('error', 'No key — the saved row needs a name.');
        break;

      case 'notify': {
        if (!str(config, 'body') && !str(config, 'message')) push('error', 'No message body.');
        const channel = str(config, 'channel') || 'log';
        if (channel === 'email' && !str(config, 'target')) {
          push('error', 'An email notification needs a recipient in Target.');
        }
        if (channel === 'slack' && !str(config, 'target')) {
          push('warning', 'No Slack URL here, so the server SLACK_WEBHOOK_URL will be used.');
        }
        break;
      }

      case 'conditional_branch': {
        const operator = str(config, 'operator') || 'contains';
        const needsValue = operator !== 'is_truthy' && operator !== 'is_empty';
        if (needsValue && !str(config, 'value')) {
          push('error', `Nothing to compare against for "${operator}".`);
        }
        const hasTrue = Boolean(step.next?.true);
        const hasFalse = Boolean(step.next?.false);
        if (!hasTrue && !hasFalse) {
          push('error', 'Neither output is connected, so this node always ends the run.');
        } else if (!hasTrue) {
          push('warning', 'The true output is not connected — a true result ends the run.');
        } else if (!hasFalse) {
          push('warning', 'The false output is not connected — a false result ends the run.');
        }
        break;
      }

      case 'approval_gate':
        break;
    }

    checkPrevReferences(step, steps, push);
  }

  /* -------------------------------------------------------------- graph */
  if (steps.length === 0) {
    add(GRAPH_KEY, 'error', 'This workflow has no nodes yet.');
  } else {
    const targeted = new Set(
      steps.flatMap((step) => Object.values(step.next ?? {})).filter(Boolean) as string[],
    );
    const roots = steps.filter((step) => !targeted.has(step.key));

    if (roots.length > 1) {
      add(
        GRAPH_KEY,
        'warning',
        `${roots.length} nodes have nothing feeding them; only "${roots[0].name || roots[0].key}" will run.`,
      );
    }

    // Anything the walk cannot reach will always be skipped.
    const byKey = new Map(steps.map((step) => [step.key, step]));
    const reachable = new Set<string>();
    const walk = (key?: string) => {
      if (!key || reachable.has(key)) return;
      const step = byKey.get(key);
      if (!step) return;
      reachable.add(key);
      walk(step.next?.main);
      walk(step.next?.true);
      walk(step.next?.false);
    };
    walk(roots[0]?.key ?? steps[0].key);

    for (const step of steps) {
      if (!reachable.has(step.key)) {
        add(step.key, 'warning', 'Nothing connects to this node, so it will never run.');
      }
      for (const [handle, target] of Object.entries(step.next ?? {})) {
        if (target && !byKey.has(target)) {
          add(step.key, 'error', `Its ${handle} output points at a node that no longer exists.`);
        }
      }
    }
  }

  const enabled = triggers.filter((trigger) => trigger.is_enabled);
  if (enabled.length === 0) {
    add(GRAPH_KEY, 'warning', 'No enabled trigger, so nothing can start this workflow.');
  }

  const byKey = new Map<string, NodeIssue[]>();
  for (const issue of issues) {
    const list = byKey.get(issue.key) ?? [];
    list.push(issue);
    byKey.set(issue.key, list);
  }

  return {
    issues,
    byKey,
    errors: issues.filter((issue) => issue.severity === 'error'),
    warnings: issues.filter((issue) => issue.severity === 'warning'),
  };
}

export { GRAPH_KEY };

/** True when this workflow can be started by a person pressing Run. */
export function hasManualTrigger(triggers: DraftTrigger[]): boolean {
  return triggers.some((trigger) => trigger.type === 'manual' && trigger.is_enabled);
}
