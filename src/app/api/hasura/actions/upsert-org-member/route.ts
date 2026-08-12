import { createActionRoute } from '@/server/actions/route';
import { upsertOrgMember } from '@/server/actions/organization';

export const maxDuration = 30;

export const POST = createActionRoute('upsertOrgMember', upsertOrgMember);
