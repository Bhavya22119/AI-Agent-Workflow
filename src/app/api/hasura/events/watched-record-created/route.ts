/**
 * Hasura Event Trigger: watched_records INSERT -> start matching runs.
 *
 * This is the `database_event` trigger type: a row change in a watched table
 * starts a workflow with no button click and no user session.
 */
import { assertHasuraEvent, ActionError } from '@/server/auth';
import { handleWatchedRecord, type WatchedRecord } from '@/server/triggers';

export const maxDuration = 60;

interface EventPayload {
  event?: { op?: string; data?: { new?: WatchedRecord | null } };
}

export async function POST(req: Request): Promise<Response> {
  try {
    assertHasuraEvent(req);
    const payload = (await req.json()) as EventPayload;
    const row = payload.event?.data?.new;

    if (!row?.id || !row.org_id) {
      return Response.json({ skipped: 'no row in payload' });
    }

    const runs = await handleWatchedRecord(row);
    return Response.json({ watched_record_id: row.id, started: runs });
  } catch (error) {
    if (error instanceof ActionError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error('[event:watched-record-created]', message);
    return Response.json({ message }, { status: 500 });
  }
}
