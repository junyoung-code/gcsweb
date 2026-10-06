import Image from 'next/image';
import { cn } from '@/lib/utils';

interface BannerProps {
  className?: string;
  variant?: 'archive' | 'shop' | 'about';
}

export default function Banner({ className, variant = 'archive' }: BannerProps) {
  const srcMap: Record<NonNullable<BannerProps['variant']>, string> = {
    archive: '/assets/images/banner-archive.svg',
    shop: '/assets/images/banner-shop.svg',
    about: '/assets/images/banner-about.svg',
  };
  const src = srcMap[variant];

  return (
    <section className={cn('relative h-[113px] w-full', className)}>
      <Image src={src} alt="" fill aria-hidden className="object-cover" priority={variant === 'shop'} />
    </section>
  );
}
