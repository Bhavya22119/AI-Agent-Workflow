import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The Agent Flow wordmark and mark.
 *
 * The source artwork is white on transparency, so it is legible on the dark theme
 * and invisible on the light one. `invert dark:invert-0` fixes that with the one
 * mechanism a raster image responds to: inverting pure white gives pure black, and
 * transparent pixels are unaffected because a filter does not touch alpha.
 *
 * This is the only place in the app that uses a `dark:` variant. Everywhere else,
 * colour comes from `@theme` tokens redefined under `prefers-color-scheme` — but a
 * token cannot recolour a PNG, and Tailwind's `dark:` resolves to the same media
 * query, so the two agree rather than compete.
 */
export function Logo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt="Agent Flow"
      width={508}
      height={152}
      priority={priority}
      className={cn('h-9 w-auto invert dark:invert-0', className)}
    />
  );
}

/** Just the mark, for places too narrow for the wordmark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/mark.png"
      alt="Agent Flow"
      width={174}
      height={174}
      className={cn('size-8 invert dark:invert-0', className)}
    />
  );
}
