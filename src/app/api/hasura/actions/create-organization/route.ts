import { createActionRoute } from '@/server/actions/route';
import { createOrganization } from '@/server/actions/organization';

export const maxDuration = 30;

export const POST = createActionRoute('createOrganization', createOrganization);
