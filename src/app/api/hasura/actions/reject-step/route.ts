import { createActionRoute } from '@/server/actions/route';
import { rejectStep } from '@/server/actions/stepDecision';

export const maxDuration = 30;

export const POST = createActionRoute('rejectStep', rejectStep);
