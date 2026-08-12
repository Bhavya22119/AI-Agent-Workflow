'use client';

/**
 * The "we have sent you an email" state.
 *
 * Shared by sign-up, password reset and re-send, so every email the app sends
 * produces the same unmistakable confirmation: which address it went to, what to
 * do next, and a way to send it again with a cooldown so nobody sits wondering
 * whether the button worked.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

const RESEND_COOLDOWN_SECONDS = 30;

export function EmailSent({
  email,
  title,
  description,
  onResend,
  footer,
}: {
  email: string;
  title: string;
  description: string;
  onResend?: () => Promise<void>;
  footer?: React.ReactNode;
}) {
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const [resentAt, setResentAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    if (!onResend) return;
    setResending(true);
    setError(null);
    try {
      await onResend();
      setResentAt(Date.now());
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that again.');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="animate-fade-rise space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ok-soft text-ok">
          <MailCheck className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-ink">{title}</h1>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            {description} We sent it to <span className="font-medium text-ink">{email}</span>.
          </p>
        </div>
      </div>

      <Alert tone="info">
        Nothing in your inbox after a minute? Check the spam folder — the message comes from
        Nhost, not from this app&apos;s domain.
      </Alert>

      {resentAt ? (
        <p className="flex items-center gap-1.5 text-sm text-ok">
          <CheckCircle2 className="size-4" />
          Sent again just now.
        </p>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {onResend ? (
        <Button onClick={resend} loading={resending} disabled={cooldown > 0} className="w-full">
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the email'}
        </Button>
      ) : null}

      {footer}
    </div>
  );
}
