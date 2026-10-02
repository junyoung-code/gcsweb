import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { apiError, apiErrors, apiSuccess } from '@/lib/api-response';
import { buildVisitorOrderUrl, getSellerContext } from '@/lib/seller/store';

export const dynamic = 'force-dynamic';

/** 상점 아이디(URL 식별자). v1 등록 폼과 같은 규칙을 쓴다. */
const STORE_SLUG_PATTERN = /^[a-z0-9-]{3,20}$/;

const CreateStoreSchema = z.object({
  name: z.string().trim().min(2, '상점명은 2자 이상 입력해주세요.').max(30),
  storeSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(STORE_SLUG_PATTERN, '영문 소문자, 숫자, 하이픈으로 3~20자 입력해주세요.'),
  /** 판매자 화면에 `@handle` 로 노출. 생략하면 storeSlug 를 그대로 쓴다. */
  handle: z.string().trim().min(1).max(30).optional(),
  imageUrl: z.string().trim().max(2048).optional(),
});

const UpdateStoreSchema = z
  .object({
    name: z.string().trim().min(2, '상점명은 2자 이상 입력해주세요.').max(30).optional(),
    handle: z.string().trim().min(1).max(30).nullable().optional(),
    imageUrl: z.string().trim().max(2048).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: '수정할 값이 없습니다.',
  });

function toResponse(store: {
  storeId: string;
  name: string;
  storeSlug: string;
  handle: string | null;
  imageUrl: string | null;
}) {
  return {
    id: store.storeId,
    name: store.name,
    storeSlug: store.storeSlug,
    handle: store.handle,
    imageUrl: store.imageUrl,
    visitorOrderUrl: buildVisitorOrderUrl(store.storeSlug),
  };
}

/** 내 상점. 아직 만들지 않았으면 store=null 을 돌려준다(오류가 아니다). */
export async function GET() {
  try {
    const context = await getSellerContext();
    if (!context.ok) return apiErrors.unauthorized();

    return apiSuccess({ store: context.store ? toResponse(context.store) : null });
  } catch (error) {
    console.error('[seller/store] GET error:', error);
    return apiErrors.serverError();
  }
}

/**
 * 상점 등록.
 *
 * Store.userId 가 unique 라 한 유저는 상점을 하나만 갖는다.
 * 등록과 동시에 User.isSeller 를 켠다.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiErrors.unauthorized();

    const parsed = CreateStoreSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrors.invalidInput(parsed.error.issues[0]?.message);
    }
    const input = parsed.data;

    const existing = await prisma.store.findUnique({
      where: { userId },
      select: { storeId: true },
    });
    if (existing) {
      return apiError(409, 'STORE_EXISTS', '이미 상점을 가지고 있습니다.');
    }

    const slugTaken = await prisma.store.findUnique({
      where: { storeSlug: input.storeSlug },
      select: { storeId: true },
    });
    if (slugTaken) {
      return apiError(409, 'SLUG_TAKEN', '이미 사용 중인 상점 아이디입니다.');
    }

    const store = await prisma.$transaction(async (tx) => {
      const created = await tx.store.create({
        data: {
          userId,
          name: input.name,
          storeSlug: input.storeSlug,
          handle: input.handle ?? input.storeSlug,
          imageUrl: input.imageUrl || null,
        },
        select: {
          storeId: true,
          name: true,
          storeSlug: true,
          handle: true,
          imageUrl: true,
        },
      });

      await tx.user.update({ where: { id: userId }, data: { isSeller: true } });
      return created;
    });

    return apiSuccess({ store: toResponse(store) });
  } catch (error) {
    console.error('[seller/store] POST error:', error);
    return apiErrors.serverError();
  }
}

/**
 * 상점 수정.
 *
 * storeSlug 는 방문객 주문 URL·QR 의 기준이라 바꾸지 않는다(v1 등록 화면도 읽기전용).
 * 바꿔야 하면 별도 정책이 필요하다.
 */
export async function PATCH(request: Request) {
  try {
    const context = await getSellerContext();
    if (!context.ok) return apiErrors.unauthorized();
    if (!context.store) return apiErrors.notFound('상점을 찾을 수 없습니다.');

    const parsed = UpdateStoreSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrors.invalidInput(parsed.error.issues[0]?.message);
    }
    const input = parsed.data;

    if (input.handle) {
      const taken = await prisma.store.findFirst({
        where: { handle: input.handle, NOT: { storeId: context.store.storeId } },
        select: { storeId: true },
      });
      if (taken) return apiError(409, 'HANDLE_TAKEN', '이미 사용 중인 핸들입니다.');
    }

    const store = await prisma.store.update({
      where: { storeId: context.store.storeId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.handle !== undefined ? { handle: input.handle } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      },
      select: {
        storeId: true,
        name: true,
        storeSlug: true,
        handle: true,
        imageUrl: true,
      },
    });

    return apiSuccess({ store: toResponse(store) });
  } catch (error) {
    console.error('[seller/store] PATCH error:', error);
    return apiErrors.serverError();
  }
}
