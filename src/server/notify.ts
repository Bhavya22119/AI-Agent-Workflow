/**
 * Notification delivery, invoked by the `notification_created` Hasura Event
 * Trigger rather than inline in the run.
 *
 * That separation is the point of implementing `notify` as an Event Trigger: a
 * Slack outage retries on Hasura's schedule (3 attempts, 10s apart) and never
 * marks the workflow run as failed. The delivery outcome is written back onto
 * the notification row, so the UI can show "sent" / "failed" per notification.
 */
import { serverEnv } from './env';
import { adminGraphql } from './hasura';

export interface NotificationRow {
  id: string;
  channel: 'slack' | 'email' | 'log';
  target: string | null;
  subject: string | null;
  body: string;
  attempt_count: number;
}

async function deliverSlack(notification: NotificationRow): Promise<void> {
  const url = notification.target || serverEnv.notify.slackWebhookUrl;
  if (!url) {
    throw new Error(
      'No Slack webhook URL: set SLACK_WEBHOOK_URL, or put one in the step\'s `target`.',
    );
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: notification.subject
        ? `*${notification.subject}*\n${notification.body}`
        : notification.body,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function deliverEmail(notification: NotificationRow): Promise<void> {
  const { smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom } = serverEnv.notify;
  if (!smtpHost || !smtpUser || !smtpPassword) {
    throw new Error('SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASSWORD).');
  }
  if (!notification.target) {
    throw new Error('An email notification needs a recipient in `target`.');
  }

  // Imported lazily so a deployment that never sends email does not pay for it.
  const { createTransport } = await import('nodemailer');
  const transport = createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPassword },
  });

  await transport.sendMail({
    from: smtpFrom ?? smtpUser,
    to: notification.target,
    subject: notification.subject ?? 'Workflow notification',
    text: notification.body,
  });
}

/**
 * Delivers one notification and records the outcome. Throws on failure so the
 * Event Trigger sees a non-2xx and retries.
 */
export async function deliverNotification(notification: NotificationRow): Promise<void> {
  const attempt = (notification.attempt_count ?? 0) + 1;

  try {
    switch (notification.channel) {
      case 'slack':
        await deliverSlack(notification);
        break;
      case 'email':
        await deliverEmail(notification);
        break;
      default:
        // The `log` channel is a first-class option, not a silent fallback: it
        // is how the demo shows the notify step working without external
        // credentials.
        console.log(
          `[notify:log] ${notification.subject ? `${notification.subject} — ` : ''}${notification.body}`,
        );
    }

    await adminGraphql(
      `mutation MarkSent($id: uuid!, $attempt: Int!, $at: timestamptz!) {
         update_notifications_by_pk(
           pk_columns: { id: $id }
           _set: { status: sent, sent_at: $at, attempt_count: $attempt, error: null }
         ) { id }
       }`,
      { id: notification.id, attempt, at: new Date().toISOString() },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await adminGraphql(
      `mutation MarkFailed($id: uuid!, $attempt: Int!, $error: String!) {
         update_notifications_by_pk(
           pk_columns: { id: $id }
           _set: { status: failed, attempt_count: $attempt, error: $error }
         ) { id }
       }`,
      { id: notification.id, attempt, error: message },
    );
    throw error;
  }
}
