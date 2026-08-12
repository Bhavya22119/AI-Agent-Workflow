/**
 * Translation between the database rows and the canvas graph.
 *
 * The database stores the graph as `workflow_steps.next` — a map of output handle
 * to target step `key`. React Flow wants a flat list of nodes and edges. This
 * module converts each way, and computes the `position` values that go back into
 * the database.
 *
 * Why `key` and not the row id: saving a workflow deletes and re-inserts its
 * steps (positions are unique per workflow, so an in-place reorder would collide
 * mid-statement), which means row ids change on every save. Edges therefore
 * reference keys, which the client generates and keeps stable.
 */
import type { Edge, Node } from '@xyflow/react';
import { STEP_CATALOG } from '@/lib/step-catalog';
import type {
  DraftStep,
  DraftTrigger,
  Json,
  StepEdges,
  StepRun,
  StepRunStatus,
  StepType,
  Workflow,
} from '@/lib/types';
import type { NodeIssue } from '@/lib/validation';

export const HANDLES = { main: 'main', true: 'true', false: 'false' } as const;
export type HandleId = keyof typeof HANDLES;

/** What a run contributes to a node while the canvas is showing that run. */
export interface NodeRunState {
  status: StepRunStatus;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface StepNodeData extends Record<string, unknown> {
  kind: 'step';
  step: DraftStep;
  /** Live status, when the canvas is showing a run. */
  status?: StepRunStatus;
  attempts?: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  /** True when the caller's role may not modify this step type (Layer 2). */
  locked: boolean;
  /** True when the whole canvas is read-only. */
  readOnly: boolean;
  isEntry: boolean;
  /** Configuration problems to surface on the node itself. */
  issues: NodeIssue[];
}

export interface TriggerNodeData extends Record<string, unknown> {
  kind: 'trigger';
  trigger: DraftTrigger;
  locked: boolean;
  readOnly: boolean;
  /**
   * The workflow's Active switch. A trigger is only live when both it and the
   * workflow are on, so the node cannot show "live" from its own state alone.
   */
  workflowActive: boolean;
}

export type CanvasNode = Node<StepNodeData, 'step'> | Node<TriggerNodeData, 'trigger'>;

export const TRIGGER_NODE_PREFIX = 'trigger:';

export function triggerNodeId(trigger: DraftTrigger): string {
  return `${TRIGGER_NODE_PREFIX}${trigger.id ?? trigger.key}`;
}

/* ------------------------------------------------------------------ loading */

export function toDraftSteps(workflow: Workflow): DraftStep[] {
  return workflow.workflow_steps.map((step) => ({
    key: step.key,
    id: step.id,
    type: step.type,
    name: step.name,
    config: step.config ?? {},
    next: (step.next ?? {}) as StepEdges,
    canvas_x: step.canvas_x ?? 0,
    canvas_y: step.canvas_y ?? 0,
    retry_limit: step.retry_limit,
    timeout_ms: step.timeout_ms,
  }));
}

export function toDraftTriggers(workflow: Workflow): DraftTrigger[] {
  return workflow.workflow_triggers.map((trigger) => ({
    key: trigger.id,
    id: trigger.id,
    type: trigger.type,
    config: trigger.config ?? {},
    cron_expression: trigger.cron_expression,
    is_enabled: trigger.is_enabled,
    last_fired_at: trigger.last_fired_at,
  }));
}

/* ------------------------------------------------------------------- graph */

/** Keys that something points at — i.e. not an entry node. */
function targetedKeys(steps: DraftStep[]): Set<string> {
  const targets = new Set<string>();
  for (const step of steps) {
    for (const target of Object.values(step.next ?? {})) {
      if (target) targets.add(target);
    }
  }
  return targets;
}

/** The node execution starts at: no inbound edge, else the first one. */
export function entryKey(steps: DraftStep[]): string | null {
  if (steps.length === 0) return null;
  const targeted = targetedKeys(steps);
  const roots = steps.filter((step) => !targeted.has(step.key));
  return (roots[0] ?? steps[0]).key;
}

/**
 * Execution order, by walking the graph from the entry node. Used for
 * `position`, which orders the run timeline and is what `{{steps.N.output}}`
 * refers to. Nodes the walk cannot reach are appended, so every step still gets
 * a unique position.
 */
export function topologicalOrder(steps: DraftStep[]): DraftStep[] {
  const byKey = new Map(steps.map((step) => [step.key, step]));
  const ordered: DraftStep[] = [];
  const seen = new Set<string>();

  const walk = (key: string | null | undefined) => {
    if (!key || seen.has(key)) return;
    const step = byKey.get(key);
    if (!step) return;
    seen.add(key);
    ordered.push(step);
    // main first, then the branch outputs, so a linear chain keeps its order.
    walk(step.next?.main);
    walk(step.next?.true);
    walk(step.next?.false);
  };

  walk(entryKey(steps));
  for (const step of steps) if (!seen.has(step.key)) ordered.push(step);
  return ordered;
}

/** A fresh, readable, unique node key such as `llm_call_2`. */
export function nextStepKey(type: StepType, steps: DraftStep[]): string {
  const used = new Set(steps.map((step) => step.key));
  const base = type.replace(/[^a-z0-9_]/g, '');
  if (!used.has(base)) return base;
  for (let index = 2; index < 500; index += 1) {
    const candidate = `${base}_${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}_${Date.now().toString(36)}`;
}

/** Output handles a step type exposes. */
export function handlesFor(type: StepType): HandleId[] {
  return type === 'conditional_branch' ? ['true', 'false'] : ['main'];
}

/* ------------------------------------------------------- to React Flow -- */

export interface BuildFlowOptions {
  steps: DraftStep[];
  triggers: DraftTrigger[];
  readOnly: boolean;
  /** Which step types this role may modify (Layer 2 in the UI). */
  canUseStepType: (type: StepType) => boolean;
  canUseTriggerType: (trigger: DraftTrigger) => boolean;
  /** Live statuses keyed by step key, when showing a run. */
  statusByKey?: Map<string, NodeRunState>;
  /** Validation problems keyed by step key. */
  issuesByKey?: Map<string, NodeIssue[]>;
  /** The workflow's Active switch, needed to draw a trigger as live. */
  workflowActive?: boolean;
}

export function buildFlow({
  steps,
  triggers,
  readOnly,
  canUseStepType,
  canUseTriggerType,
  statusByKey,
  issuesByKey,
  workflowActive = true,
}: BuildFlowOptions): { nodes: CanvasNode[]; edges: Edge[] } {
  const entry = entryKey(steps);
  const byKey = new Set(steps.map((step) => step.key));

  const nodes: CanvasNode[] = [];
  const edges: Edge[] = [];

  for (const trigger of triggers) {
    const ui = (trigger.config?.ui ?? {}) as { x?: number; y?: number };
    nodes.push({
      id: triggerNodeId(trigger),
      type: 'trigger',
      position: { x: Number(ui.x ?? -320), y: Number(ui.y ?? 0) },
      deletable: !readOnly,
      draggable: !readOnly,
      data: {
        kind: 'trigger',
        trigger,
        locked: readOnly || !canUseTriggerType(trigger),
        readOnly,
        workflowActive,
      },
    });

    // Every trigger feeds the entry node. This edge is derived rather than
    // stored: "where a run starts" is a property of the graph (the node nothing
    // points at), so there is nothing here for a user to wire up incorrectly.
    if (entry) {
      edges.push({
        id: `${triggerNodeId(trigger)}->${entry}`,
        source: triggerNodeId(trigger),
        target: entry,
        sourceHandle: 'main',
        targetHandle: 'in',
        type: 'flow',
        deletable: false,
        selectable: false,
        data: { derived: true, enabled: trigger.is_enabled },
      });
    }
  }

  for (const step of steps) {
    const live = statusByKey?.get(step.key);
    nodes.push({
      id: step.key,
      type: 'step',
      position: { x: step.canvas_x, y: step.canvas_y },
      deletable: !readOnly,
      draggable: !readOnly,
      data: {
        kind: 'step',
        step,
        status: live?.status,
        attempts: live?.attempts,
        startedAt: live?.startedAt,
        finishedAt: live?.finishedAt,
        locked: readOnly || !canUseStepType(step.type),
        readOnly,
        isEntry: step.key === entry,
        issues: issuesByKey?.get(step.key) ?? [],
      },
    });

    for (const handle of handlesFor(step.type)) {
      const target = step.next?.[handle];
      if (!target || !byKey.has(target)) continue;
      edges.push({
        id: `${step.key}:${handle}->${target}`,
        source: step.key,
        sourceHandle: handle,
        target,
        targetHandle: 'in',
        type: 'flow',
        deletable: !readOnly,
        data: {
          handle,
          label: handle === 'main' ? undefined : handle,
          // "Live" means this wire is feeding the node that is executing now, so
          // the marching ants show where the run actually is.
          active: statusByKey?.get(target)?.status === 'running',
        },
      });
    }
  }

  return { nodes, edges };
}

/* --------------------------------------------------------------- mutations */

/** Sets one output handle's target, replacing whatever was wired to it. */
export function connectSteps(
  steps: DraftStep[],
  sourceKey: string,
  handle: HandleId,
  targetKey: string,
): DraftStep[] {
  if (sourceKey === targetKey) return steps;
  return steps.map((step) =>
    step.key === sourceKey ? { ...step, next: { ...step.next, [handle]: targetKey } } : step,
  );
}

export function disconnect(steps: DraftStep[], sourceKey: string, handle: HandleId): DraftStep[] {
  return steps.map((step) => {
    if (step.key !== sourceKey) return step;
    const next = { ...step.next };
    delete next[handle];
    return { ...step, next };
  });
}

/** Removes a step and any edge pointing at it. */
export function removeStep(steps: DraftStep[], key: string): DraftStep[] {
  return steps
    .filter((step) => step.key !== key)
    .map((step) => {
      const next = { ...step.next };
      let changed = false;
      for (const handle of Object.keys(next) as HandleId[]) {
        if (next[handle] === key) {
          delete next[handle];
          changed = true;
        }
      }
      return changed ? { ...step, next } : step;
    });
}

export function moveStep(steps: DraftStep[], key: string, x: number, y: number): DraftStep[] {
  return steps.map((step) =>
    step.key === key ? { ...step, canvas_x: Math.round(x), canvas_y: Math.round(y) } : step,
  );
}

export function moveTrigger(
  triggers: DraftTrigger[],
  nodeId: string,
  x: number,
  y: number,
): DraftTrigger[] {
  return triggers.map((trigger) =>
    triggerNodeId(trigger) === nodeId
      ? {
          ...trigger,
          config: {
            ...trigger.config,
            ui: { x: Math.round(x), y: Math.round(y) } as unknown as Json,
          },
        }
      : trigger,
  );
}

/**
 * A new step, placed to the right of whatever it is being added after and wired
 * up so a fresh node is never left dangling.
 */
export function createStep(
  type: StepType,
  steps: DraftStep[],
  placement: { x: number; y: number },
): DraftStep {
  const spec = STEP_CATALOG[type];
  return {
    key: nextStepKey(type, steps),
    type,
    name: spec.defaults.name,
    config: structuredClone(spec.defaults.config) as Record<string, Json>,
    next: {},
    canvas_x: Math.round(placement.x),
    canvas_y: Math.round(placement.y),
    retry_limit: spec.defaults.retry_limit,
    timeout_ms: spec.defaults.timeout_ms,
  };
}

/** Rightmost node, so a newly added node lands somewhere sensible. */
export function suggestPlacement(steps: DraftStep[]): { x: number; y: number } {
  if (steps.length === 0) return { x: 0, y: 0 };
  const rightmost = steps.reduce((best, step) => (step.canvas_x > best.canvas_x ? step : best));
  return { x: rightmost.canvas_x + 280, y: rightmost.canvas_y };
}

/* ------------------------------------------------------------- run mapping */

/** Maps a run's step_runs onto node keys, for the live canvas. */
export function statusesFromRun(
  stepRuns: StepRun[],
  steps: DraftStep[],
): Map<string, NodeRunState> {
  const byId = new Map(steps.filter((step) => step.id).map((step) => [step.id as string, step.key]));
  const byPosition = new Map(steps.map((step, index) => [index + 1, step.key]));
  const result = new Map<string, NodeRunState>();

  for (const stepRun of stepRuns) {
    // Match on the step row first; fall back to position for a run recorded
    // before the workflow was last saved (saving re-inserts the step rows).
    const key = byId.get(stepRun.workflow_step_id) ?? byPosition.get(stepRun.position);
    if (!key) continue;
    result.set(key, {
      status: stepRun.status,
      attempts: stepRun.attempt_count,
      startedAt: stepRun.started_at,
      finishedAt: stepRun.finished_at,
    });
  }
  return result;
}
