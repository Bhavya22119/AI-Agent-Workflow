import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The landing hero: a ruled grid, an arc of light along the bottom edge, and a
 * headline clipped out of a gradient.
 *
 * ---------------------------------------------------------------------------
 *  What was adapted, and why
 * ---------------------------------------------------------------------------
 *  * The reference used `<Button asChild>` from shadcn. This project's Button has
 *    a different variant set and is used at 46 call sites, so introducing a second
 *    one — or shadowing it — would have been the expensive way to render a link.
 *    The `cta` slot takes whatever the caller wants instead, which on this page is
 *    the auth-aware CTA that already exists.
 *  * Colours moved from literal `#fff` / `#000` / `#e8e8e8` to the design tokens,
 *    so the two themes come for free and the hero's bottom edge meets the page
 *    without a seam. Those live in globals.css as `.hero-wash` / `.hero-grid` /
 *    `.hero-arc` / `.hero-title`, because a mask and a two-layer radial are past
 *    the point where arbitrary-value utilities are readable.
 *  * `font-geist` is now the app's actual font, loaded by next/font in
 *    app/layout.tsx, so the class is unnecessary.
 *  * The decorative layers are `aria-hidden` and the section is `isolate`, which
 *    keeps their negative z-index from escaping behind the page background.
 */
export function Hero({
  eyebrow,
  eyebrowHref,
  title,
  subtitle,
  cta,
  footnote,
  className,
}: {
  eyebrow?: string;
  /** Makes the eyebrow a link. Without it, it stays a non-interactive label. */
  eyebrowHref?: string;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  cta?: React.ReactNode;
  /** Small print under the call to action — a tech list, a caveat. */
  footnote?: React.ReactNode;
  className?: string;
}) {
  const eyebrowContent = eyebrow ? (
    <span
      className={cn(
        'mx-auto flex w-fit items-center justify-center rounded-full px-4 py-1.5',
        'border border-line bg-surface/70 backdrop-blur',
        'text-[11px] font-medium tracking-[0.1em] text-ink-3 uppercase',
        eyebrowHref && 'transition-colors group-hover:border-line-strong group-hover:text-ink-2',
      )}
    >
      {eyebrow}
      {eyebrowHref ? (
        <ChevronRight
          className="ml-1.5 size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
          aria-hidden
        />
      ) : null}
    </span>
  ) : null;

  return (
    <section
      id="hero"
      className={cn(
        'relative isolate w-full overflow-hidden rounded-b-[1.75rem] border-b border-line',
        'px-6 pt-28 pb-0 text-center md:px-8 md:pt-36',
        className,
      )}
    >
      {/* svh, not vh: on mobile Safari `vh` includes the address bar, so a full
          viewport hero is always taller than the viewport actually is. */}
      <div className="flex min-h-[calc(100svh-14rem)] flex-col">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 hero-wash" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] hero-grid"
        />
        <div
          aria-hidden
          className={cn(
            'animate-fade-up pointer-events-none absolute left-1/2 -z-10 -translate-x-1/2 rounded-[100%]',
            'top-[calc(100%-5rem)] h-[30rem] w-[44rem]',
            'md:w-[68rem] lg:top-[calc(100%-8rem)] lg:h-[44rem] lg:w-[140%]',
            'hero-arc',
          )}
        />

        {eyebrowContent ? (
          <div className="animate-fade-in">
            {eyebrowHref ? (
              <Link href={eyebrowHref} className="group">
                {eyebrowContent}
              </Link>
            ) : (
              eyebrowContent
            )}
          </div>
        ) : null}

        <h1
          className={cn(
            'animate-fade-in delay-1 hero-title mx-auto max-w-4xl text-balance py-6',
            'text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.03em]',
            'sm:text-6xl md:text-7xl',
          )}
        >
          {title}
        </h1>

        <p className="animate-fade-in delay-2 mx-auto mb-10 max-w-2xl text-balance text-base leading-relaxed text-ink-2 md:text-lg">
          {subtitle}
        </p>

        {cta ? (
          <div className="animate-fade-in delay-3 relative z-10 flex justify-center">{cta}</div>
        ) : null}

        {footnote ? (
          <p className="animate-fade-in delay-3 relative z-10 mt-7 text-xs text-ink-3">
            {footnote}
          </p>
        ) : null}
      </div>
    </section>
  );
}
