import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'QR Shop | GCS',
  description: 'QR 전용 간편 주문',
  robots: { index: false, follow: false },
};

export default function QRshopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f2f4f6] text-neutral-12 antialiased relative">
      <Link
        href="/?restock=1"
        className="fixed right-4 top-4 z-[100] flex items-center gap-1 rounded-full bg-white px-3 py-2 text-[13px] font-semibold text-neutral-11 shadow-[0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-orange-5 transition-all active:scale-95"
      >
        <span>재입고 알림</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </Link>
      {children}
    </div>
  );
}
