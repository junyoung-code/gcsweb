import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SalesManagementTab {
  href: string;
  label: string;
}

interface SalesManagementPageShellProps {
  title: string;
  children: ReactNode;
  backHref?: string;
  tabs?: SalesManagementTab[];
  activeTabHref?: string;
  className?: string;
  contentClassName?: string;
}

export default function SalesManagementPageShell({
  title,
  children,
  backHref = '/',
  tabs = [],
  activeTabHref,
  className,
  contentClassName,
}: SalesManagementPageShellProps) {
  return (
    <div className={cn('min-h-dvh bg-neutral-4 text-neutral-10', className)}>
      <header className="bg-neutral-1 shadow-[0_1px_2px_rgba(99,81,73,0.1)]">
        <div className="mx-auto flex h-[58px] w-full max-w-[1248px] items-center gap-3 px-6 xl:px-0">
          <Link
            href={backHref}
            aria-label="뒤로가기"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-neutral-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-5"
          >
            <Image src="/assets/icons/icon-back.svg" alt="" width={12} height={24} />
          </Link>
          <h1 className="typo-heading-small">{title}</h1>
        </div>

        {tabs.length > 0 ? (
          <nav
            aria-label={`${title} 메뉴`}
            className="mx-auto flex w-full max-w-[1248px] overflow-x-auto px-6 xl:px-0"
          >
            {tabs.map((tab) => {
              const isActive = tab.href === activeTabHref;

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'shrink-0 whitespace-nowrap border-b-2 px-4 py-3 typo-body-small-bold transition-colors',
                    isActive
                      ? 'border-orange-5 text-orange-5'
                      : 'border-transparent text-neutral-7 hover:text-neutral-10',
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </header>

      <main className={cn('mx-auto w-full max-w-[1248px] px-6 py-6 xl:px-0', contentClassName)}>
        {children}
      </main>
    </div>
  );
}
