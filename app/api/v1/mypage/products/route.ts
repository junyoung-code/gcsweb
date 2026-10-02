import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeImageUrl } from '@/lib/image-url';
import { apiError, apiErrors } from '@/lib/api-response';
import { isSelectableProductType } from '@/lib/product-type';

function toDateOnlyInKst(date: Date | null | undefined): string | null {
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

/** 내가 등록한 상품(판매팀 보유 팀 기준) 목록 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiErrors.unauthorized('Login required.');
    }

    const myTeams = await prisma.team.findMany({
      where: {
        OR: [{ userId: session.user.id }, { teamMember: { has: session.user.id } }],
      },
      select: { id: true },
    });
    const teamIds = myTeams.map((t) => t.id);
    if (teamIds.length === 0) {
      return NextResponse.json({ status: 'success', data: { products: [] } });
    }

    const products = await prisma.product.findMany({
      where: {
        teamId: { in: teamIds },
        isAdminApproved: true,
      },
      include: {
        images: { take: 1, orderBy: { createdAt: 'asc' } },
        team: { select: { teamName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const list = products.map((p) => {
      const thumb = p.images[0]?.thumbnailImgUrl ?? null;
      const goal = p.goalAmount ?? 0;
      const current = p.currentAmount ?? 0;
      const progressPercent = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
      return {
        id: p.id,
        type: p.type,
        name: p.name,
        description: p.description ?? '',
        teamName: p.team.teamName,
        likeCount: p.likeCount,
        salesStartDate: toDateOnlyInKst(p.salesStartDate),
        salesEndDate: toDateOnlyInKst(p.salesEndDate),
        goalAmount: goal,
        currentAmount: current,
        progressPercent,
        thumbnailImgUrl: normalizeImageUrl(thumb),
      };
    });

    return NextResponse.json({ status: 'success', data: { products: list } });
  } catch (error) {
    console.error('My products list error:', error);
    return apiErrors.serverError('Server error.');
  }
}

function parseDate(str: string | undefined, endOfDay = false): Date | undefined {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return undefined;
  const d = new Date(`${str}T${endOfDay ? '23:59:59.000' : '00:00:00.000'}+09:00`);
  return isNaN(d.getTime()) ? undefined : d;
}

function parseAndValidateOptions(options: unknown) {
  if (options == null) return { ok: true as const, value: [] as Array<{ optionName: string; values: Array<{ value: string; extraPrice: number }> }> };
  if (!Array.isArray(options)) return { ok: false as const };

  const optionNameSet = new Set<string>();
  const parsed: Array<{ optionName: string; values: Array<{ value: string; extraPrice: number }> }> = [];

  for (const option of options) {
    if (!option || typeof option !== 'object') return { ok: false as const };
    const optionName = typeof (option as any).optionName === 'string' ? (option as any).optionName.trim() : '';
    const values = (option as any).values;
    if (!optionName || optionNameSet.has(optionName) || !Array.isArray(values) || values.length < 1) return { ok: false as const };
    optionNameSet.add(optionName);

    const parsedValues: Array<{ value: string; extraPrice: number }> = [];
    const valueSet = new Set<string>();
    for (const valueItem of values) {
      if (!valueItem || typeof valueItem !== 'object') return { ok: false as const };
      const value = typeof (valueItem as any).value === 'string' ? (valueItem as any).value.trim() : '';
      const extraPrice = (valueItem as any).extraPrice;
      if (!value || valueSet.has(value) || !Number.isInteger(extraPrice) || extraPrice < 0) return { ok: false as const };
      valueSet.add(value);
      parsedValues.push({ value, extraPrice });
    }

    parsed.push({ optionName, values: parsedValues });
  }

  return { ok: true as const, value: parsed };
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiErrors.unauthorized('Login required.');
    }

    const body = await request.json().catch(() => ({}));
    const {
      teamId,
      name,
      description,
      type,
      receiveMethod,
      salesStartDate,
      salesEndDate,
      goalAmount,
      productionStartDate,
      productionEndDate,
      deliveryStartDate,
      deliveryEndDate,
      pickupStartDate,
      pickupEndDate,
      pickupLocation,
      price,
      options,
      thumbnailImgUrl,
      detailImgUrls,
      noticeImgUrl,
    } = body as {
      teamId?: string;
      name?: string;
      description?: string;
      type?: number;
      receiveMethod?: number | null;
      salesStartDate?: string;
      salesEndDate?: string;
      goalAmount?: number;
      productionStartDate?: string;
      productionEndDate?: string;
      deliveryStartDate?: string;
      deliveryEndDate?: string;
      pickupStartDate?: string;
      pickupEndDate?: string;
      pickupLocation?: string;
      price?: number | string;
      options?: { optionName: string; values: { value: string; extraPrice: number }[] }[];
      thumbnailImgUrl?: string;
      detailImgUrls?: string[];
      noticeImgUrl?: string;
    };

    if (!teamId || typeof teamId !== 'string' || !name?.trim() || !isSelectableProductType(type)) {
      return apiErrors.invalidInput('Invalid request input.');
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, userId: true, teamMember: true },
    });
    if (!team) {
      return apiErrors.notFound('Not found.');
    }
    const memberIds = Array.isArray(team.teamMember) ? team.teamMember : [];
    const canCreate = team.userId === session.user.id || memberIds.includes(session.user.id);
    if (!canCreate) {
      return apiErrors.forbidden('Forbidden.');
    }

    const priceNum =
      typeof price === 'number' && Number.isFinite(price)
        ? Math.floor(price)
        : typeof price === 'string'
          ? (() => {
              const n = Number(price.replace(/\D/g, ''));
              return Number.isFinite(n) ? Math.floor(n) : 0;
            })()
          : 0;
    if (priceNum < 0) {
      return apiErrors.invalidInput('Invalid request input.');
    }

    if (!thumbnailImgUrl || typeof thumbnailImgUrl !== 'string' || !thumbnailImgUrl.trim()) {
      return apiErrors.invalidInput('Invalid request input.');
    }
    const normalizedThumbnailImgUrl = normalizeImageUrl(thumbnailImgUrl.trim());
    const detailUrls = Array.isArray(detailImgUrls)
      ? detailImgUrls
          .map((u) => normalizeImageUrl(typeof u === 'string' ? u : null))
          .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      : [];
    const normalizedNoticeImgUrl = normalizeImageUrl(typeof noticeImgUrl === 'string' ? noticeImgUrl : null);
    if (!normalizedThumbnailImgUrl) {
      return apiErrors.invalidInput('Invalid request input.');
    }
    if (detailUrls.length === 0) {
      return apiErrors.invalidInput('Invalid request input.');
    }

    if (normalizedNoticeImgUrl) {
      return apiErrors.invalidInput('Invalid request input.');
    }

    const salesStart = parseDate(salesStartDate);
    const salesEnd = parseDate(salesEndDate, true);
    if (!salesStart || !salesEnd) {
      return apiErrors.invalidInput('Invalid request input.');
    }

    if (type === 0) {
      if (!(receiveMethod === 0 || receiveMethod === 1)) {
        return apiErrors.invalidInput('Invalid request input.');
      }
      if (receiveMethod === 0) {
        if (
          !parseDate(productionStartDate) ||
          !parseDate(productionEndDate, true) ||
          !parseDate(deliveryStartDate) ||
          !parseDate(deliveryEndDate, true)
        ) {
          return apiErrors.invalidInput('Invalid request input.');
        }
      } else {
        if (
          !parseDate(pickupStartDate) ||
          !parseDate(pickupEndDate, true) ||
          !(typeof pickupLocation === 'string' && pickupLocation.trim())
        ) {
          return apiErrors.invalidInput('Invalid request input.');
        }
      }
    } else if (type === 1) {
      if (receiveMethod !== 1) {
        return apiErrors.invalidInput('Invalid request input.');
      }
    } else {
      if (receiveMethod !== null) {
        return apiErrors.invalidInput('Invalid request input.');
      }
    }

    const goalAmountNum = typeof goalAmount === 'number' ? goalAmount : typeof goalAmount === 'string' ? Number(goalAmount) : NaN;
    const resolvedGoalAmount = !Number.isNaN(goalAmountNum) && goalAmountNum >= 0 ? goalAmountNum : null;

    const productData = {
      teamId,
      name: name.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      type,
      status: 0,
      price: priceNum,
      goalAmount: resolvedGoalAmount,
      currentAmount: 0,
      salesStartDate: salesStart,
      salesEndDate: salesEnd,
      productionStartDate: parseDate(productionStartDate) ?? undefined,
      productionEndDate: parseDate(productionEndDate, true) ?? undefined,
      deliveryStartDate: parseDate(deliveryStartDate) ?? undefined,
      deliveryEndDate: parseDate(deliveryEndDate, true) ?? undefined,
      pickupStartDate: parseDate(pickupStartDate) ?? undefined,
      pickupEndDate: parseDate(pickupEndDate, true) ?? undefined,
      pickupLocation: typeof pickupLocation === 'string' && pickupLocation.trim() ? pickupLocation.trim() : undefined,
      receiveMethod,
      isPublic: false,
      likeCount: 0,
      viewCount: 0,
    };

    const parsedOptions = parseAndValidateOptions(options);
    if (!parsedOptions.ok) {
      return apiErrors.invalidInput('Invalid option payload.');
    }
    const optionList = parsedOptions.value;

    const product = await prisma.$transaction(async (tx) => {
      const createdProduct = await tx.product.create({
        data: {
          ...productData,
          isAdminApproved: true,
          isPublic: true,
          isHome: false,
        },
      });

      await tx.productImage.create({
        data: {
          productId: createdProduct.id,
          thumbnailImgUrl: normalizedThumbnailImgUrl,
          detailImgUrl: detailUrls,
          noticeImgUrl: normalizedNoticeImgUrl ?? null,
        },
      });

      for (const opt of optionList) {
        const optionName = opt.optionName;
        const optionRow = await tx.productOption.create({
          data: { productId: createdProduct.id, optionName },
        });

        for (const v of opt.values) {
          const value = v.value;
          const additionalPrice = v.extraPrice;
          await tx.productOptionValue.create({
            data: {
              optionId: optionRow.id,
              productId: createdProduct.id,
              optionName,
              value,
              additionalPrice,
            },
          });
        }
      }

      return createdProduct;
    });

    return NextResponse.json({
      status: 'success',
      data: {
        productId: product.id,
        message: '상품이 성공적으로 등록되었습니다.',
      },
    });
  } catch (error) {
    console.error('Product registration error:', error);
    return apiErrors.serverError('Server error.');
  }
}

