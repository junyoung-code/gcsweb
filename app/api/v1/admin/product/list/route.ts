import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeImageUrl } from '@/lib/image-url';
import { jsonError, parseOptionalProductType, requireAdmin } from '../_utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const keywordParam = url.searchParams.get('keyword');
    const keyword = typeof keywordParam === 'string' ? keywordParam.trim() : '';
    const parsedType = parseOptionalProductType(url.searchParams.get('type'));

    if (!parsedType.ok) {
      return jsonError(400, 'INVALID_INPUT', '요청 파라미터 형식이 올바르지 않습니다.');
    }

    const repo = prisma as any;

    const where: any = {
      isAdminApproved: true,
      ...(parsedType.value != null ? { type: parsedType.value } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword, mode: 'insensitive' } },
              { team: { teamName: { contains: keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const products = await repo.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        teamId: true,
        type: true,
        name: true,
        description: true,
        isHome: true,
        isPublic: true,
        salesStartDate: true,
        salesEndDate: true,
        currentAmount: true,
        goalAmount: true,
        likeCount: true,
        team: { select: { teamName: true } },
        likes: {
          where: { userId: auth.session.user.id },
          select: { id: true },
        },
        images: {
          select: { thumbnailImgUrl: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    return NextResponse.json({
      status: 'success',
      data: {
        products: products.map((p: any) => ({
          id: p.id,
          teamId: p.teamId,
          teamName: p.team?.teamName ?? '',
          type: p.type,
          name: p.name,
          description: p.description ?? '',
          thumbnailUrl: normalizeImageUrl(p.images?.[0]?.thumbnailImgUrl ?? '') ?? '',
          isHome: Boolean(p.isHome),
          isPublic: Boolean(p.isPublic),
          salesStartDate: p.salesStartDate,
          salesEndDate: p.salesEndDate,
          currentAmount: p.type === 0 ? (p.currentAmount ?? 0) : null,
          goalAmount: p.type === 0 ? (p.goalAmount ?? null) : null,
          likeCount: p.likeCount ?? 0,
          isLiked: p.likes && p.likes.length > 0,
        })),
      },
    });
  } catch (error) {
    console.error('Admin product list error:', error);
    return jsonError(500, 'SERVER_ERROR', '서버 내부 로직 오류');
  }
}
