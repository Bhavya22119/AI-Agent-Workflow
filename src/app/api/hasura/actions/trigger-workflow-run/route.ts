import { createActionRoute } from '@/server/actions/route';
import { triggerWorkflowRun } from '@/server/actions/triggerWorkflowRun';

// The action returns as soon as the run exists; `after()` keeps executing steps
// for the rest of this invocation's budget.
export const maxDuration = 60;

export const POST = createActionRoute('triggerWorkflowRun', triggerWorkflowRun);
