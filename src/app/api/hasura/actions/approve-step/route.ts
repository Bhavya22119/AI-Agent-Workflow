import { createActionRoute } from '@/server/actions/route';
import { approveStep } from '@/server/actions/stepDecision';

export const maxDuration = 60;

export const POST = createActionRoute('approveStep', approveStep);
