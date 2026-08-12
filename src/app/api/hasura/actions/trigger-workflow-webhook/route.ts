import { createActionRoute } from '@/server/actions/route';
import { triggerWorkflowWebhookAction } from '@/server/actions/triggerWorkflowWebhook';

export const maxDuration = 60;

// The `…Action` wrapper returns exactly the fields of the declared output type.
// The REST alias in /api/webhooks/[triggerId] calls the fuller handler, which can
// also hold the connection open until the run finishes — a transport detail that
// has no place in the GraphQL contract.
export const POST = createActionRoute('triggerWorkflowWebhook', triggerWorkflowWebhookAction);
