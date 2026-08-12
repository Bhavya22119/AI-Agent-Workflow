import { createActionRoute } from '@/server/actions/route';
import { rotateWebhookSecret } from '@/server/actions/organization';

export const maxDuration = 30;

export const POST = createActionRoute('rotateWebhookSecret', rotateWebhookSecret);
