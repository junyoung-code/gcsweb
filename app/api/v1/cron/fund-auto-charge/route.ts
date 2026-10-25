import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { chargeWithBillingKey } from '@/lib/payment/portone';
import { apiError as jsonError } from '@/lib/api-response';
import { ORDER_PAYMENT_METHOD, ORDER_PAYMENT_STATUS } from '@/lib/order-status';

export async function POST(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  const incomingSecret = request.headers.get('x-cron-secret')?.trim();
  if (configuredSecret && incomingSecret !== configuredSecret) {
    return jsonError(401, 'UNAUTHORIZED', 'invalid cron secret');
  }

  try {
    const now = new Date();
    const orders = await prisma.order.findMany({
      where: {
        productType: 0,
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
        paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
        billingKey: { not: null },
      },
      select: {
        id: true,
        billingKey: true,
        paymentAmount: true,
        ordererName: true,
        ordererPhone: true,
        items: {
          take: 1,
          select: {
            product: {
              select: {
                name: true,
                salesEndDate: true,
                currentAmount: true,
                goalAmount: true,
              },
            },
          },
        },
      },
      take: 300,
      orderBy: { createdAt: 'asc' },
    });

    let charged = 0;
    let skipped = 0;
    let failed = 0;

    for (const order of orders) {
      const billingKey = order.billingKey?.trim();
      const product = order.items[0]?.product;
      if (!billingKey || !product) {
        skipped += 1;
        continue;
      }

      const isDue = product.salesEndDate <= now;
      const goalAmount = product.goalAmount ?? 0;
      const currentAmount = product.currentAmount ?? 0;
      const isGoalReached = goalAmount > 0 && currentAmount >= goalAmount;
      if (!isDue || !isGoalReached) {
        skipped += 1;
        continue;
      }

      const result = await chargeWithBillingKey({
        paymentId: order.id,
        billingKey,
        orderName: product.name?.slice(0, 80) ?? 'Fund 주문',
        totalAmount: order.paymentAmount,
        customerName: order.ordererName ?? undefined,
        customerMobile: order.ordererPhone ?? undefined,
      });

      if (!result.success) {
        failed += 1;
        console.error('[FundAutoCharge] charge failed', {
          orderId: order.id,
          hasBillingKey: Boolean(billingKey),
          code: result.code ?? null,
          message: result.message ?? null,
        });
        continue;
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: ORDER_PAYMENT_STATUS.PAID },
      });
      charged += 1;
    }

    return NextResponse.json({
      status: 'success',
      data: {
        scanned: orders.length,
        charged,
        skipped,
        failed,
      },
    });
  } catch (error) {
    console.error('Fund auto charge cron error:', error);
    return jsonError(500, 'SERVER_ERROR', 'server internal error.');
  }
}

