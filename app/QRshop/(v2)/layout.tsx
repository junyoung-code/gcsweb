import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'QR Shop | GCS',
  description: 'QR 전용 간편 주문',
  robots: { index: false, follow: false },
};

export default function QRshopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh bg-neutral-4 font-pretendard text-neutral-12 antialiased">{children}</div>
  );
}
