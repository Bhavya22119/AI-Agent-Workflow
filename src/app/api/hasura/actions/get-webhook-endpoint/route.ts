import { createActionRoute } from '@/server/actions/route';
import { getWebhookEndpoint } from '@/server/actions/organization';

export const maxDuration = 30;

export const POST = createActionRoute('getWebhookEndpoint', getWebhookEndpoint);
