import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeImageUrl } from '@/lib/image-url';
import { apiError, apiErrors } from '@/lib/api-response';
import { isSelectableProductType } from '@/lib/product-type';

function toDateOnlyInKst(date: Date | null | undefined): string {
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
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

function isValidProductId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function getMyTeamIds(userId: string): Promise<string[]> {
  const myTeams = await prisma.team.findMany({
    where: {
      OR: [{ userId }, { teamMember: { has: userId } }],
    },
    select: { id: true },
  });
  return myTeams.map((t) => t.id);
}

export async function GET(
  _request: Request,
  { params }: { params: { productId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiErrors.unauthorized('Login required.');
    }

    const productId = params?.productId;
    if (!isValidProductId(productId)) {
      return apiErrors.invalidInput('Invalid request input.');
    }

    const teamIds = await getMyTeamIds(session.user.id);
    if (teamIds.length === 0) {
      return apiErrors.forbidden('Forbidden.');
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId.trim(),
        teamId: { in: teamIds },
      },
      include: {
        team: { select: { teamName: true } },
        images: { orderBy: { createdAt: 'asc' }, take: 1 },
        options: {
          orderBy: { optionName: 'asc' },
          include: {
            values: {
              orderBy: { value: 'asc' },
            },
          },
        },
      },
    });

    if (!product) {
      return apiErrors.notFound('Not found.');
    }

    const image = product.images?.[0] ?? null;

    return NextResponse.json({
      status: 'success',
      data: {
        product: {
          id: product.id,
          teamId: product.teamId,
          teamName: product.team?.teamName ?? '',
          name: product.name,
          description: product.description ?? '',
          type: product.type,
          receiveMethod: product.receiveMethod,
          price: product.price,
          goalAmount: product.goalAmount ?? 0,
          salesStartDate: toDateOnlyInKst(product.salesStartDate),
          salesEndDate: toDateOnlyInKst(product.salesEndDate),
          productionStartDate: toDateOnlyInKst(product.productionStartDate),
          productionEndDate: toDateOnlyInKst(product.productionEndDate),
          deliveryStartDate: toDateOnlyInKst(product.deliveryStartDate),
          deliveryEndDate: toDateOnlyInKst(product.deliveryEndDate),
          pickupStartDate: toDateOnlyInKst(product.pickupStartDate),
          pickupEndDate: toDateOnlyInKst(product.pickupEndDate),
          pickupLocation: product.pickupLocation ?? '',
          thumbnailImgUrl: normalizeImageUrl(image?.thumbnailImgUrl ?? null) ?? '',
          detailImgUrls: (image?.detailImgUrl ?? [])
            .map((url) => normalizeImageUrl(url))
            .filter((url): url is string => typeof url === 'string' && url.length > 0),
          options: (product.options ?? []).map((option) => ({
            optionName: option.optionName,
            values: (option.values ?? []).map((value) => ({
              value: value.value,
              extraPrice: value.additionalPrice,
            })),
          })),
        },
      },
    });
  } catch (error) {
    console.error('My product detail error:', error);
    return apiErrors.serverError('Server error.');
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { productId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiErrors.unauthorized('Login required.');
    }

    const productId = params?.productId;
    if (!isValidProductId(productId)) {
      return apiErrors.invalidInput('Invalid request input.');
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
    const canUpdate = team.userId === session.user.id || memberIds.includes(session.user.id);
    if (!canUpdate) {
      return apiErrors.forbidden('Forbidden.');
    }

    const targetProduct = await prisma.product.findFirst({
      where: {
        id: productId.trim(),
        teamId: { in: await getMyTeamIds(session.user.id) },
      },
      select: { id: true },
    });

    if (!targetProduct) {
      return apiErrors.notFound('Not found.');
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

    if (!normalizedNoticeImgUrl) {
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

    const goalAmountNum =
      typeof goalAmount === 'number'
        ? goalAmount
        : typeof goalAmount === 'string'
          ? Number(goalAmount)
          : NaN;
    const resolvedGoalAmount =
      !Number.isNaN(goalAmountNum) && goalAmountNum >= 0 ? goalAmountNum : null;

    const parsedOptions = parseAndValidateOptions(options);
    if (!parsedOptions.ok) {
      return apiErrors.invalidInput('Invalid option payload.');
    }
    const optionList = parsedOptions.value;

    const updatedProduct = await prisma.$transaction(async (tx) => {
      const productRow = await tx.product.update({
        where: { id: targetProduct.id },
        data: {
          name: name.trim(),
          description: typeof description === 'string' ? description.trim() : '',
          type,
          price: priceNum,
          goalAmount: resolvedGoalAmount,
          salesStartDate: salesStart,
          salesEndDate: salesEnd,
          productionStartDate: parseDate(productionStartDate) ?? null,
          productionEndDate: parseDate(productionEndDate, true) ?? null,
          deliveryStartDate: parseDate(deliveryStartDate) ?? null,
          deliveryEndDate: parseDate(deliveryEndDate, true) ?? null,
          pickupStartDate: parseDate(pickupStartDate) ?? null,
          pickupEndDate: parseDate(pickupEndDate, true) ?? null,
          pickupLocation: typeof pickupLocation === 'string' && pickupLocation.trim() ? pickupLocation.trim() : null,
          receiveMethod,
        },
      });

      await tx.productImage.deleteMany({
        where: { productId: targetProduct.id },
      });
      await tx.productImage.create({
        data: {
          productId: targetProduct.id,
          thumbnailImgUrl: normalizedThumbnailImgUrl,
          detailImgUrl: detailUrls,
          noticeImgUrl: normalizedNoticeImgUrl ?? null,
        },
      });

      await tx.productOption.deleteMany({
        where: { productId: targetProduct.id },
      });
      for (const opt of optionList) {
        const optionName = opt.optionName;
        const reqOption = await tx.productOption.create({
          data: { productId: targetProduct.id, optionName },
        });

        for (const v of opt.values) {
          const value = v.value;
          const additionalPrice = v.extraPrice;
          await tx.productOptionValue.create({
            data: {
              optionId: reqOption.id,
              productId: targetProduct.id,
              optionName,
              value,
              additionalPrice,
            },
          });
        }
      }

      return productRow;
    });

    return NextResponse.json({
      status: 'success',
      data: {
        productId: targetProduct.id,
        message: 'Product successfully updated.',
      },
    });
  } catch (error) {
    console.error('Product update request error:', error);
    return apiErrors.serverError('Server error.');
  }
}

