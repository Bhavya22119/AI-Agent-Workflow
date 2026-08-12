/**
 * The workflow runner.
 *
 * Execution follows the graph the canvas draws: each step's `next` maps an output
 * handle to the key of the next step. An ordinary step has one handle (`main`); a
 * conditional_branch has `true` and `false`, and the step decides which handle is
 * taken while the connection decides where that handle goes.
 *
 * Responsibilities:
 *   * walk edges from the start node, passing each step's output to the next
 *   * stop at an approval_gate, leaving the run `paused` (this is the whole
 *     pause/resume mechanism — no timer and no held connection: the run's state
 *     lives in Postgres, so resuming is just another invocation)
 *   * record status / input / output / error / attempt_count as it goes, which is
 *     what the client's step_runs subscription renders live
 *   * mark every node the run never reached as `skipped`
 *   * consume one unit of org quota when the run reaches a terminal state
 *
 * Resuming after an approval calls executeRun() again: the approved gate is now
 * `completed`, so the walk restarts from it and immediately follows its `main`
 * edge to the step after it.
 */
import { serverEnv } from '../env';
import { executeStep, StepConfigError } from './steps';
import {
  claimRun,
  consumeRunQuota,
  loadRun,
  markUnreachedStepsSkipped,
  setRunStatus,
  setStepRunStatus,
} from './store';
import { renderDeep } from './template';
import type { Json, LoadedRun, LoadedStep, RunContext } from './types';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

/** Rebuilds the templating context from whatever has already completed. */
function buildContext(run: LoadedRun): RunContext {
  const steps: RunContext['steps'] = {};
  let prev: Json = null;

  // Ordered by position, which is the graph's topological order, so `prev` ends
  // up being the output of the most recently completed step.
  for (const step of run.step_runs) {
    if (step.status !== 'completed') continue;
    steps[String(step.position)] = {
      type: step.step_type,
      status: step.status,
      output: step.output ?? null,
    };
    prev = step.output ?? null;
  }

  return {
    run: { id: run.id, workflow_id: run.workflow_id, org_id: run.org_id },
    trigger: { type: run.trigger_type, payload: run.trigger_payload ?? {} },
    prev,
    steps,
  };
}

/**
 * Where to begin: the first step that has not run yet, walking from the graph's
 * entry node. On a resume that is the approved gate (already `completed`), whose
 * edge is then followed normally.
 */
function startingStep(run: LoadedRun): LoadedStep | null {
  const paused = run.step_runs.find((step) => step.status === 'paused');
  if (paused) return paused;

  // A run that has not executed anything yet starts at the graph's entry node —
  // the one nothing points at. Starting at the lowest `position` instead only
  // looks equivalent because positions are normally assigned by a topological
  // walk; when they are not, it silently executes the wrong node and skips the
  // real entry.
  const hasStarted = run.step_runs.some((step) => step.status !== 'pending');
  if (!hasStarted) return entryStep(run) ?? null;

  const pending = run.step_runs.find((step) => step.status === 'pending');
  if (!pending) return null;

  // Resuming: if a decided gate sits before the first pending step, walk from
  // the gate so its outgoing edge decides what runs next.
  const justApproved = run.step_runs
    .filter((step) => step.step_type === 'approval_gate' && step.status === 'completed')
    .sort((a, b) => b.position - a.position)[0];
  if (justApproved && justApproved.position < pending.position) return justApproved;
  return pending;
}

function entryStep(run: LoadedRun): LoadedStep | undefined {
  const targeted = new Set(
    run.step_runs.flatMap((step) => Object.values(step.workflow_step.next ?? {})),
  );
  const roots = run.step_runs.filter((step) => !targeted.has(step.workflow_step.key));
  return (
    roots.sort((a, b) => a.position - b.position)[0] ??
    [...run.step_runs].sort((a, b) => a.position - b.position)[0]
  );
}

async function finalize(
  runId: string,
  status: 'completed' | 'failed' | 'cancelled',
  error?: string,
): Promise<void> {
  await markUnreachedStepsSkipped(runId);
  await setRunStatus(runId, status, { error: error ?? null, finished: true });
  // Quota is consumed by any run that *finishes*, not only by successful ones:
  // otherwise a workflow that always fails would be free to run forever.
  // consume_run_quota() is idempotent per run.
  const quota = await consumeRunQuota(runId);
  if (quota.counted) {
    console.log(
      `[engine] run ${runId} ${status}; quota now ${quota.quotaUsed}/${quota.quotaLimit}`,
    );
  }
}

export interface ExecuteRunResult {
  status: 'completed' | 'failed' | 'paused' | 'cancelled' | 'skipped';
  stepsExecuted: number;
  pausedStepRunId?: string;
}

export async function executeRun(runId: string): Promise<ExecuteRunResult> {
  if (!(await claimRun(runId))) {
    // Already running elsewhere, or already finished.
    return { status: 'skipped', stepsExecuted: 0 };
  }

  const run = await loadRun(runId);
  if (!run) {
    console.error(`[engine] run ${runId} disappeared before execution`);
    return { status: 'skipped', stepsExecuted: 0 };
  }
  if (TERMINAL.has(run.status)) return { status: 'skipped', stepsExecuted: 0 };

  const byKey = new Map(run.step_runs.map((step) => [step.workflow_step.key, step]));
  const ctx = buildContext(run);

  let current: LoadedStep | null | undefined = startingStep(run) ?? entryStep(run);
  if (!current) {
    await finalize(runId, 'completed');
    return { status: 'completed', stepsExecuted: 0 };
  }

  const visited = new Set<string>();
  let stepsExecuted = 0;

  while (current) {
    if (stepsExecuted >= serverEnv.maxStepsPerRun) {
      await finalize(
        runId,
        'failed',
        `Run exceeded the ${serverEnv.maxStepsPerRun}-step execution limit.`,
      );
      return { status: 'failed', stepsExecuted };
    }

    const step: LoadedStep = current;
    const key = step.workflow_step.key;

    // The graph is expected to be acyclic; a cycle would otherwise spin until the
    // step cap. Report it as a configuration problem instead.
    if (visited.has(key)) {
      await finalize(
        runId,
        'failed',
        `The workflow graph loops back to "${step.workflow_step.name || key}". Loops are not supported.`,
      );
      return { status: 'failed', stepsExecuted };
    }
    visited.add(key);

    let handle: 'main' | 'true' | 'false' = 'main';

    if (step.status === 'completed' || step.status === 'skipped') {
      // Already dealt with — typically the gate we are resuming from. Adopt its
      // output into the context and follow its edge.
      if (step.status === 'completed') {
        ctx.steps[String(step.position)] = {
          type: step.step_type,
          status: step.status,
          output: step.output ?? null,
        };
        ctx.prev = step.output ?? null;
        // A previously-decided branch remembers which way it went.
        const recorded = (step.output as { branch?: string } | null)?.branch;
        if (step.step_type === 'conditional_branch') {
          handle = recorded === 'false' ? 'false' : 'true';
        }
      }
    } else {
      const config = (step.workflow_step.config ?? {}) as Record<string, Json>;
      let renderedInput: Json;
      try {
        renderedInput = renderDeep(config as Json, ctx);
      } catch {
        renderedInput = config as Json;
      }

      await setStepRunStatus(step.id, 'running', {
        input: renderedInput,
        started: true,
        attemptCount: 0,
        error: null,
      });

      try {
        const outcome = await executeStep({
          run,
          step,
          config,
          ctx,
          onAttempt: async (attempt) => {
            await setStepRunStatus(step.id, 'running', { attemptCount: attempt });
          },
        });
        stepsExecuted += 1;

        if (outcome.kind === 'pause') {
          await setStepRunStatus(step.id, 'paused', { output: outcome.output });
          await setRunStatus(runId, 'paused');
          console.log(`[engine] run ${runId} paused at "${step.workflow_step.name}" awaiting approval`);
          return { status: 'paused', stepsExecuted, pausedStepRunId: step.id };
        }

        await setStepRunStatus(step.id, 'completed', {
          output: outcome.output,
          finished: true,
          error: null,
        });
        ctx.steps[String(step.position)] = {
          type: step.step_type,
          status: 'completed',
          output: outcome.output,
        };
        ctx.prev = outcome.output;
        step.status = 'completed';
        step.output = outcome.output;

        if (outcome.kind === 'branch') handle = outcome.handle;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isConfigError = error instanceof StepConfigError;
        await setStepRunStatus(step.id, 'failed', {
          error: isConfigError ? `Configuration error: ${message}` : message,
          finished: true,
        });
        await finalize(
          runId,
          'failed',
          `Step "${step.workflow_step.name || step.step_type}" failed: ${message}`,
        );
        console.error(`[engine] run ${runId} failed at ${key}: ${message}`);
        return { status: 'failed', stepsExecuted };
      }
    }

    const targetKey = step.workflow_step.next?.[handle];
    if (!targetKey) break; // nothing wired to this output: this path ends here

    const target = byKey.get(targetKey);
    if (!target) {
      // A dangling edge is a broken graph, not a silent end.
      await finalize(
        runId,
        'failed',
        `Step "${step.workflow_step.name || key}" points at "${targetKey}", which is not part of this workflow.`,
      );
      return { status: 'failed', stepsExecuted };
    }
    current = target;
  }

  await finalize(runId, 'completed');
  return { status: 'completed', stepsExecuted };
}

/**
 * Runs a workflow in the background and never rejects, so a caller can hand
 * execution off with `after(() => runInBackground(id))` without an unhandled
 * rejection taking down the response.
 */
export async function runInBackground(runId: string): Promise<void> {
  try {
    await executeRun(runId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[engine] unhandled failure in run ${runId}: ${message}`);
    try {
      await setRunStatus(runId, 'failed', { error: `Engine error: ${message}`, finished: true });
      await markUnreachedStepsSkipped(runId);
      await consumeRunQuota(runId);
    } catch {
      // Nothing more we can do; the run stays as-is for inspection.
    }
  }
}
