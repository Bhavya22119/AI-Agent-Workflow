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
import { CheckCircle2, MailCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

const RESEND_COOLDOWN_SECONDS = 30;

export function EmailSent({
  email,
  title,
  description,
  onResend,
  onCheckVerified,
  footer,
}: {
  email: string;
  title: string;
  description: string;
  onResend?: () => Promise<void>;
  /**
   * "I have clicked the link" — verifies and signs the user in without making
   * them come back to a login form. Resolves only if it worked; throwing is how
   * it reports "not verified yet", because the only way to know is to ask the
   * server, and the server's answer is an error.
   */
  onCheckVerified?: () => Promise<void>;
  footer?: React.ReactNode;
}) {
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const [resentAt, setResentAt] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);
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
    setNotYet(false);
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

  async function checkVerified() {
    if (!onCheckVerified) return;
    setChecking(true);
    setError(null);
    setNotYet(false);
    try {
      await onCheckVerified();
      // On success the caller navigates, so this component unmounts; leaving
      // `checking` true keeps the button busy for that beat instead of flashing
      // back to idle first.
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      // Nhost answers an unverified sign-in with a specific refusal. Anything
      // else — a wrong password, a network failure — deserves its own words.
      if (/verif/i.test(message) || /unverified/i.test(message)) {
        setNotYet(true);
      } else {
        setError(message || 'Could not check that yet. Try again in a moment.');
      }
      setChecking(false);
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

      {notYet ? (
        <Alert tone="warning">
          Not confirmed yet. Open the link in that email first, then press this again — you do
          not need to leave this page.
        </Alert>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {/* Two actions, because there are exactly two things a person can do while
          waiting on an email: ask for another one, or say they have dealt with
          it. The confirm action is primary — it is the one that ends the wait. */}
      <div className="grid gap-2 sm:grid-cols-2">
        {onResend ? (
          <Button onClick={resend} loading={resending} disabled={cooldown > 0 || checking}>
            <RefreshCw className="size-4" />
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
          </Button>
        ) : null}

        {onCheckVerified ? (
          <Button
            variant="primary"
            onClick={checkVerified}
            loading={checking}
            disabled={resending}
            className={onResend ? undefined : 'sm:col-span-2'}
          >
            <ShieldCheck className="size-4" />
            I&apos;ve verified
          </Button>
        ) : null}
      </div>

      {footer}
    </div>
  );
}
