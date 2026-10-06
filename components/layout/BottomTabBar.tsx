'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type BottomTabBarVariant =
  | 'about'
  | 'archive'
  | 'home'
  | 'shop'
  | 'shop_fund'
  | 'shop_buynow_partnerup';

interface BottomTabBarProps {
  variant?: BottomTabBarVariant;
  aboutHref?: string;
  archiveHref?: string;
  homeHref?: string;
  shopHref?: string;
  onOrder?: () => void;
}

function MaskIcon({ src, colorClassName }: { src: string; colorClassName: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-6 w-6', colorClassName)}
      style={{
        WebkitMaskImage: `url(${src})`,
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        WebkitMaskSize: '24px 24px',
        maskImage: `url(${src})`,
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        maskSize: '24px 24px',
        backgroundColor: 'currentColor',
      }}
    />
  );
}

function InfoSquareIcon({ active = false }: { active?: boolean }) {
  return <MaskIcon src="/assets/icons/light/info-square.svg" colorClassName={active ? 'text-orange-5' : 'text-neutral-7'} />;
}

function LayersIcon({ active = false }: { active?: boolean }) {
  return <MaskIcon src="/assets/icons/light/layers.svg" colorClassName={active ? 'text-orange-5' : 'text-neutral-7'} />;
}

function HomeIcon({ active = false }: { active?: boolean }) {
  return <MaskIcon src="/assets/icons/light/home.svg" colorClassName={active ? 'text-orange-5' : 'text-neutral-7'} />;
}

function BagIcon({ active = false }: { active?: boolean }) {
  return <MaskIcon src="/assets/icons/light/bag-2.svg" colorClassName={active ? 'text-orange-5' : 'text-neutral-7'} />;
}

function HeartIcon() {
  return <MaskIcon src="/assets/icons/light/heart.svg" colorClassName="text-neutral-6" />;
}

function CartIcon() {
  return <MaskIcon src="/assets/icons/light/cart.svg" colorClassName="text-neutral-6" />;
}

interface TabItemProps {
  href: string;
  label: string;
  active?: boolean;
  icon: ReactNode;
  widthClassName: string;
}

function TabItem({ href, label, active = false, icon, widthClassName }: TabItemProps) {
  return (
    <Link href={href} className={cn('flex flex-col items-center gap-px', widthClassName)}>
      <span className="inline-flex h-6 w-6 items-center justify-center">{icon}</span>
      <span className={cn('text-[11px] leading-[1.5]', active ? 'text-orange-5' : 'text-neutral-7')}>{label}</span>
    </Link>
  );
}

export default function BottomTabBar({
  variant = 'about',
  aboutHref = '/about',
  archiveHref = '/archive',
  homeHref = '/',
  shopHref = '/shop',
  onOrder,
}: BottomTabBarProps) {
  if (variant === 'shop_fund' || variant === 'shop_buynow_partnerup') {
    return (
      <div className={cn('w-full border-t border-neutral-4 bg-neutral-3 py-[13px]', variant === 'shop_buynow_partnerup' ? 'px-5' : 'px-[18px]')}>
        <div className={cn('mx-auto flex w-full max-w-[375px] items-center', variant === 'shop_buynow_partnerup' ? 'gap-5' : 'justify-between')}>
          <div className={cn('flex items-center', variant === 'shop_buynow_partnerup' ? 'gap-[10px]' : '')}>
            <HeartIcon />
            {variant === 'shop_buynow_partnerup' ? <CartIcon /> : null}
          </div>
          <button
            type="button"
            onClick={onOrder}
            className="h-[48px] flex-1 rounded-lg bg-orange-5 text-neutral-2 typo-body-small-bold"
          >
            {'\uC8FC\uBB38\uD558\uAE30'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full border-t border-neutral-4 bg-neutral-3 px-4 py-[13px]">
      <div className="mx-auto flex w-full max-w-[375px] items-center justify-between">
        <TabItem href={aboutHref} label="About" active={variant === 'about'} icon={<InfoSquareIcon active={variant === 'about'} />} widthClassName="w-[30px]" />
        <TabItem href={archiveHref} label="Archive" active={variant === 'archive'} icon={<LayersIcon active={variant === 'archive'} />} widthClassName="w-[39px]" />
        <TabItem href={homeHref} label="Home" active={variant === 'home'} icon={<HomeIcon active={variant === 'home'} />} widthClassName="w-[30px]" />
        <TabItem href={shopHref} label="Shop" active={variant === 'shop'} icon={<BagIcon active={variant === 'shop'} />} widthClassName="w-[26px]" />
      </div>
    </div>
  );
}
