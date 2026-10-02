import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeImageUrl } from '@/lib/image-url';
import { syncProductVariants } from '@/lib/product-variant';
import { isSelectableProductType } from '@/lib/product-type';
import {
  isNonEmptyString,
  isNonNegativeInt,
  jsonError,
  parseAdminOptionsInput,
  parseDateTime,
  requireAdmin,
} from '../../_utils';

function validRange(start: Date | null, end: Date | null) {
  return !!start && !!end && start.getTime() <= end.getTime();
}

function hasOwn(obj: unknown, key: string) {
  return !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
}

function trimStringArray(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const values = input
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length === input.length && values.length > 0 ? values : null;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const productId = isNonEmptyString(params?.id) ? params.id.trim() : '';
    if (!productId) {
      return jsonError(400, 'INVALID_INPUT', 'Invalid request input.');
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        teamId: true,
        name: true,
        description: true,
        type: true,
        receiveMethod: true,
        salesStartDate: true,
        salesEndDate: true,
        price: true,
        goalAmount: true,
        productionStartDate: true,
        productionEndDate: true,
        deliveryStartDate: true,
        deliveryEndDate: true,
        pickupStartDate: true,
        pickupEndDate: true,
        pickupLocation: true,
        updatedAt: true,
        team: {
          select: {
            teamName: true,
          },
        },
        images: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            thumbnailImgUrl: true,
            detailImgUrl: true,
            noticeImgUrl: true,
          },
        },
        options: {
          orderBy: { id: 'asc' },
          select: {
            optionName: true,
            values: {
              orderBy: { id: 'asc' },
              select: {
                value: true,
                additionalPrice: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      return jsonError(404, 'NOT_FOUND', 'Product not found.');
    }

    const image = product.images?.[0];

    const thumbnailUrl = normalizeImageUrl(image?.thumbnailImgUrl ?? '');
    const noticeImgUrl = normalizeImageUrl(image?.noticeImgUrl ?? '');
    const detailImageUrls = Array.isArray(image?.detailImgUrl)
      ? image.detailImgUrl
          .map((url) => normalizeImageUrl(url))
          .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
      : [];

    return NextResponse.json({
      status: 'success',
      data: {
        product: {
          id: product.id,
          teamId: product.teamId,
          teamName: product.team?.teamName ?? '',
          name: product.name,
          description: product.description,
          type: product.type,
          receiveMethod: product.receiveMethod,
          salesStartDate: product.salesStartDate,
          salesEndDate: product.salesEndDate,
          images: {
            thumbnailUrl: thumbnailUrl ?? '',
            detailImageUrls,
            noticeImgUrl: noticeImgUrl ?? '',
          },
          goalAmount: product.goalAmount,
          productionStartDate: product.productionStartDate,
          productionEndDate: product.productionEndDate,
          deliveryStartDate: product.deliveryStartDate,
          deliveryEndDate: product.deliveryEndDate,
          pickupStartDate: product.pickupStartDate,
          pickupEndDate: product.pickupEndDate,
          pickupLocation: product.pickupLocation,
          price: product.price,
          options: (product.options ?? []).map((option) => ({
            name: option.optionName,
            values: (option.values ?? []).map((value) => ({
              value: value.value,
              additionalPrice: value.additionalPrice,
            })),
          })),
          updatedAt: product.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error('Admin product update detail error:', error);
    return jsonError(500, 'SERVER_ERROR', 'Server error.');
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const productId = isNonEmptyString(params?.id) ? params.id.trim() : '';
    if (!productId) {
      return jsonError(400, 'INVALID_INPUT', 'Invalid request input.');
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
      thumbnailUrl,
      detailImageUrls,
      noticeImgUrl,
      price,
      goalAmount,
      productionStartDate,
      productionEndDate,
      deliveryStartDate,
      deliveryEndDate,
      pickupStartDate,
      pickupEndDate,
      pickupLocation,
      options,
      updatedAt,
    } = body as any;

    const parsedOptions = parseAdminOptionsInput(options);
    if (!parsedOptions.ok) {
      return jsonError(400, 'INVALID_OPTION_INPUT', 'Invalid option payload.');
    }

    const parsedDetailImageUrls = trimStringArray(detailImageUrls);
    const parsedUpdatedAt = parseDateTime(updatedAt);
    const parsedSalesStartDate = parseDateTime(salesStartDate);
    const parsedSalesEndDate = parseDateTime(salesEndDate);

    if (
      !isNonEmptyString(teamId) ||
      !isNonEmptyString(name) ||
      !isNonEmptyString(description) ||
      !isSelectableProductType(type) ||
      !isNonEmptyString(thumbnailUrl) ||
      !parsedDetailImageUrls ||
      !isNonEmptyString(noticeImgUrl) ||
      !isNonNegativeInt(price) ||
      !parsedUpdatedAt ||
      !validRange(parsedSalesStartDate, parsedSalesEndDate)
    ) {
      return jsonError(400, 'INVALID_INPUT', 'Invalid request input.');
    }

    const step2Keys = [
      'goalAmount',
      'productionStartDate',
      'productionEndDate',
      'deliveryStartDate',
      'deliveryEndDate',
      'pickupStartDate',
      'pickupEndDate',
      'pickupLocation',
    ];

    let resolvedGoalAmount: number | null = null;
    let resolvedProductionStartDate: Date | null = null;
    let resolvedProductionEndDate: Date | null = null;
    let resolvedDeliveryStartDate: Date | null = null;
    let resolvedDeliveryEndDate: Date | null = null;
    let resolvedPickupStartDate: Date | null = null;
    let resolvedPickupEndDate: Date | null = null;
    let resolvedPickupLocation: string | null = null;

    if (type === 0) {
      if (!isNonNegativeInt(receiveMethod) || ![0, 1].includes(receiveMethod)) {
        return jsonError(400, 'INVALID_INPUT', 'Invalid request input.');
      }
      if (!isNonNegativeInt(goalAmount)) {
        return jsonError(400, 'INVALID_INPUT', 'Invalid request input.');
      }

      resolvedGoalAmount = goalAmount;

      if (receiveMethod === 0) {
        resolvedProductionStartDate = parseDateTime(productionStartDate);
        resolvedProductionEndDate = parseDateTime(productionEndDate);
        resolvedDeliveryStartDate = parseDateTime(deliveryStartDate);
        resolvedDeliveryEndDate = parseDateTime(deliveryEndDate);

        if (!validRange(resolvedProductionStartDate, resolvedProductionEndDate) || !validRange(resolvedDeliveryStartDate, resolvedDeliveryEndDate)) {
          return jsonError(400, 'INVALID_DATE_RANGE', 'Invalid date range.');
        }
      }

      if (receiveMethod === 1) {
        resolvedPickupStartDate = parseDateTime(pickupStartDate);
        resolvedPickupEndDate = parseDateTime(pickupEndDate);
        resolvedPickupLocation = isNonEmptyString(pickupLocation) ? pickupLocation.trim() : null;

        if (!validRange(resolvedPickupStartDate, resolvedPickupEndDate) || !resolvedPickupLocation) {
          return jsonError(400, 'INVALID_DATE_RANGE', 'Invalid date range.');
        }
      }
    } else if (type === 1) {
      if (receiveMethod !== 1) {
        return jsonError(400, 'INVALID_INPUT', 'Invalid request input.');
      }
      if (step2Keys.some((key) => hasOwn(body, key))) {
        return jsonError(400, 'INVALID_INPUT', 'Invalid request input.');
      }
    } else {
      if (receiveMethod !== null) {
        return jsonError(400, 'INVALID_INPUT', 'Invalid request input.');
      }
      if (step2Keys.some((key) => hasOwn(body, key))) {
        return jsonError(400, 'INVALID_INPUT', 'Invalid request input.');
      }
    }

    const normalizedThumbnailUrl = normalizeImageUrl(thumbnailUrl.trim());
    const normalizedNoticeImgUrl = normalizeImageUrl(noticeImgUrl.trim());
    const normalizedDetailImageUrls = parsedDetailImageUrls
      .map((url) => normalizeImageUrl(url))
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);

    if (!normalizedThumbnailUrl || !normalizedNoticeImgUrl || normalizedDetailImageUrls.length === 0) {
      return jsonError(400, 'INVALID_INPUT', 'Invalid request input.');
    }

    const [team, product] = await Promise.all([
      prisma.team.findUnique({
        where: { id: teamId.trim() },
        select: { id: true },
      }),
      prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          updatedAt: true,
        },
      }),
    ]);

    if (!team || !product) {
      return jsonError(404, 'NOT_FOUND', 'Product or team not found.');
    }

    if (product.updatedAt.getTime() !== parsedUpdatedAt.getTime()) {
      return jsonError(409, 'CONFLICT', 'The product was already updated by another user.');
    }

    const safeName = name.trim();
    const safeDescription = description.trim();

    const updatedProduct = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: productId },
        data: {
          teamId: team.id,
          name: safeName,
          description: safeDescription,
          type,
          receiveMethod,
          salesStartDate: parsedSalesStartDate!,
          salesEndDate: parsedSalesEndDate!,
          price,
          goalAmount: type === 0 ? resolvedGoalAmount : null,
          productionStartDate: type === 0 && receiveMethod === 0 ? resolvedProductionStartDate : null,
          productionEndDate: type === 0 && receiveMethod === 0 ? resolvedProductionEndDate : null,
          deliveryStartDate: type === 0 && receiveMethod === 0 ? resolvedDeliveryStartDate : null,
          deliveryEndDate: type === 0 && receiveMethod === 0 ? resolvedDeliveryEndDate : null,
          pickupStartDate: type === 0 && receiveMethod === 1 ? resolvedPickupStartDate : null,
          pickupEndDate: type === 0 && receiveMethod === 1 ? resolvedPickupEndDate : null,
          pickupLocation: type === 0 && receiveMethod === 1 ? resolvedPickupLocation : null,
        },
      });

      await tx.productImage.deleteMany({ where: { productId: updated.id } });
      await tx.productImage.create({
        data: {
          productId: updated.id,
          thumbnailImgUrl: normalizedThumbnailUrl,
          detailImgUrl: normalizedDetailImageUrls,
          noticeImgUrl: normalizedNoticeImgUrl,
        },
      });

      await tx.productOption.deleteMany({ where: { productId: updated.id } });
      for (const option of parsedOptions.value) {
        const createdOption = await tx.productOption.create({
          data: {
            productId: updated.id,
            optionName: option.name,
          },
        });

        for (const value of option.values) {
          await tx.productOptionValue.create({
            data: {
              optionId: createdOption.id,
              productId: updated.id,
              optionName: option.name,
              value: value.value,
              additionalPrice: value.additionalPrice,
            },
          });
        }
      }

      await syncProductVariants(tx, updated.id, price, parsedOptions.value);

      return updated;
    });

    return NextResponse.json({
      status: 'success',
      data: {
        product: {
          id: updatedProduct.id,
          teamId: updatedProduct.teamId,
          name: updatedProduct.name,
          description: updatedProduct.description,
          type: updatedProduct.type,
          receiveMethod: updatedProduct.receiveMethod,
          salesStartDate: updatedProduct.salesStartDate,
          salesEndDate: updatedProduct.salesEndDate,
          images: {
            thumbnailUrl: normalizedThumbnailUrl,
            detailImageUrls: normalizedDetailImageUrls,
            noticeImgUrl: normalizedNoticeImgUrl,
          },
          goalAmount: updatedProduct.type === 0 ? updatedProduct.goalAmount : null,
          productionStartDate: updatedProduct.productionStartDate,
          productionEndDate: updatedProduct.productionEndDate,
          deliveryStartDate: updatedProduct.deliveryStartDate,
          deliveryEndDate: updatedProduct.deliveryEndDate,
          pickupStartDate: updatedProduct.pickupStartDate,
          pickupEndDate: updatedProduct.pickupEndDate,
          pickupLocation: updatedProduct.pickupLocation,
          price: updatedProduct.price,
          options: parsedOptions.value.map((option) => ({
            name: option.name,
            values: option.values.map((value) => ({
              value: value.value,
              additionalPrice: value.additionalPrice,
            })),
          })),
          updatedAt: updatedProduct.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error('Admin product update error:', error);
    return jsonError(500, 'SERVER_ERROR', 'Server error.');
  }
}
