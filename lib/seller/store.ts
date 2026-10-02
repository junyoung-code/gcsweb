import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * 판매자 본인 상점 조회 헬퍼.
 *
 * Store.userId 는 unique 이므로 한 유저는 상점을 하나만 갖는다.
 * 상점을 아직 만들지 않은 판매자도 있으므로 `store`가 null인 경우를 정상으로 다룬다.
 */

export type SellerStore = {
  storeId: string;
  name: string;
  storeSlug: string;
  handle: string | null;
  imageUrl: string | null;
};

const STORE_SELECT = {
  storeId: true,
  name: true,
  storeSlug: true,
  handle: true,
  imageUrl: true,
} as const;

export type SellerContext =
  | { ok: false; reason: 'UNAUTHORIZED' }
  | { ok: true; userId: string; store: SellerStore | null };

/** 세션에서 판매자와 그 상점을 찾는다. 로그인하지 않았으면 ok=false. */
export async function getSellerContext(): Promise<SellerContext> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return { ok: false, reason: 'UNAUTHORIZED' };

  const store = await prisma.store.findUnique({
    where: { userId },
    select: STORE_SELECT,
  });

  return { ok: true, userId, store };
}

/** 방문객이 QR로 진입할 주문 URL. 실제 규칙이 확정되면 여기만 고치면 된다. */
export function buildVisitorOrderUrl(storeSlug: string) {
  return `/QRshop?store=${encodeURIComponent(storeSlug)}`;
}

/** KST 기준 오늘 0시~24시를 UTC Date 범위로 돌려준다. */
export function todayRangeInKst(now = new Date()) {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const kstMidnight = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
  );
  const start = new Date(kstMidnight - KST_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
