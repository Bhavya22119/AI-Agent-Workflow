'use client';

/**
 * Collapsible sidebar: a 60px rail that expands to 300px on hover, with a
 * full-screen drawer on small viewports.
 *
 * ---------------------------------------------------------------------------
 *  Adapted, not pasted
 * ---------------------------------------------------------------------------
 *  The reference implementation hard-codes `bg-neutral-100 dark:bg-neutral-800`
 *  and `text-neutral-700 dark:text-neutral-200`. This app has no `dark:` variants
 *  anywhere — its palette is a set of `@theme` custom properties that are
 *  redefined inside `prefers-color-scheme: dark`, so a token like `bg-surface` is
 *  already correct in both themes. Keeping the literal neutrals would have given
 *  the sidebar a colour scheme of its own, which is exactly the seam you notice.
 *  So the structure and animation are the reference's; the colours are this app's.
 *
 *  `animate={{ width }}` is the whole trick: React only re-renders when `open`
 *  flips, and Framer Motion drives the width on the compositor in between.
 */
import { createContext, useContext, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SidebarLinkItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Rendered on the right when expanded — a count, a badge, a dot. */
  trailing?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}

interface SidebarContextValue {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used inside <Sidebar>.');
  return context;
}

export function SidebarProvider({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>{children}</SidebarContext.Provider>
  );
}

export function Sidebar({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
}

export function SidebarBody(props: React.ComponentProps<typeof motion.div>) {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<'div'>)} />
    </>
  );
}

export function DesktopSidebar({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) {
  const { open, setOpen, animate } = useSidebar();
  return (
    <motion.div
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden border-r border-line bg-surface px-3 py-4 md:flex',
        className,
      )}
      animate={{ width: animate ? (open ? '272px' : '68px') : '272px' }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MobileSidebar({ className, children, ...props }: React.ComponentProps<'div'>) {
  const { open, setOpen } = useSidebar();
  return (
    <div
      className="flex h-14 w-full flex-row items-center justify-between border-b border-line bg-surface px-3 md:hidden"
      {...props}
    >
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Menu className="size-5" />
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface px-3 py-4',
                className,
              )}
            >
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="absolute top-3 right-3 rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-4" />
              </button>
              {children}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * A nav row. The label is animated out rather than unmounted, so the icons never
 * shift horizontally while the rail is collapsing.
 */
export function SidebarLink({
  link,
  className,
}: {
  link: SidebarLinkItem;
  className?: string;
}) {
  const { open, animate } = useSidebar();
  const collapsed = animate && !open;

  return (
    <Link
      href={link.href}
      onClick={link.onClick}
      aria-current={link.active ? 'page' : undefined}
      title={collapsed ? link.label : undefined}
      className={cn(
        'group/sidebar relative flex h-9.5 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors',
        link.active
          ? 'bg-accent-soft font-medium text-accent-ink'
          : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      <span className="grid size-5 shrink-0 place-items-center">{link.icon}</span>
      <motion.span
        animate={{ opacity: collapsed ? 0 : 1 }}
        transition={{ duration: 0.15 }}
        className="min-w-0 flex-1 truncate whitespace-pre"
      >
        {link.label}
      </motion.span>
      {link.trailing ? (
        <motion.span
          animate={{ opacity: collapsed ? 0 : 1 }}
          transition={{ duration: 0.15 }}
          className="shrink-0"
        >
          {link.trailing}
        </motion.span>
      ) : null}
    </Link>
  );
}

/**
 * Wrapper for anything that only makes sense at full width — an org switcher, a
 * quota bar, an email address. Collapsed, it yields to `collapsed` (usually a
 * single icon) so the rail stays 68px wide instead of being stretched by content
 * that cannot shrink.
 */
export function SidebarSection({
  children,
  collapsed,
  className,
}: {
  children: React.ReactNode;
  collapsed?: React.ReactNode;
  className?: string;
}) {
  const { open, animate } = useSidebar();
  const isCollapsed = animate && !open;

  if (isCollapsed) {
    return collapsed ? <div className={cn('flex justify-center', className)}>{collapsed}</div> : null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, delay: 0.04 }}
      className={cn('min-w-0', className)}
    >
      {children}
    </motion.div>
  );
}
