/**
 * Hasura Event Trigger: notifications INSERT -> deliver the notification.
 *
 * This is the `notify` step type. Returning a non-2xx makes Hasura retry
 * according to the trigger's retry_conf, which is exactly the behaviour you
 * want for an outbound alert and exactly what you do not get from delivering
 * inline inside the run.
 */
import { assertHasuraEvent, ActionError } from '@/server/auth';
import { deliverNotification, type NotificationRow } from '@/server/notify';

export const maxDuration = 30;

interface EventPayload {
  event?: { op?: string; data?: { new?: NotificationRow | null } };
  trigger?: { name?: string };
}

export async function POST(req: Request): Promise<Response> {
  try {
    assertHasuraEvent(req);
    const payload = (await req.json()) as EventPayload;
    const row = payload.event?.data?.new;

    if (!row?.id) {
      // Nothing actionable; 200 so Hasura does not retry a malformed event.
      return Response.json({ skipped: 'no row in payload' });
    }

    await deliverNotification(row);
    return Response.json({ delivered: row.id, channel: row.channel });
  } catch (error) {
    if (error instanceof ActionError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error('[event:notification-created]', message);
    // 500 -> Hasura retries.
    return Response.json({ message }, { status: 500 });
  }
}
