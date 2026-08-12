import { createActionRoute } from '@/server/actions/route';
import { triggerWorkflowWebhook } from '@/server/actions/triggerWorkflowWebhook';

export const maxDuration = 60;

export const POST = createActionRoute('triggerWorkflowWebhook', triggerWorkflowWebhook);
