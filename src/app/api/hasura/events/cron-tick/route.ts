/**
 * Hasura Cron Trigger: fires once a minute and starts every `scheduled`
 * workflow trigger whose cron expression is due.
 *
 * Keeping the per-workflow schedule in the database (rather than one Hasura cron
 * trigger per workflow) means a user creating a schedule in the UI does not need
 * permission to write Hasura metadata.
 */
import { assertHasuraEvent, ActionError } from '@/server/auth';
import { runDueSchedules } from '@/server/triggers';

export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  try {
    assertHasuraEvent(req);
    const started = await runDueSchedules();
    return Response.json({ checked_at: new Date().toISOString(), started });
  } catch (error) {
    if (error instanceof ActionError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error('[cron:tick]', message);
    return Response.json({ message }, { status: 500 });
  }
}
