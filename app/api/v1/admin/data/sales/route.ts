import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { apiError as jsonError, apiErrors } from '@/lib/api-response';
import { ORDER_PAYMENT_STATUS } from '@/lib/order-status';

export const dynamic = 'force-dynamic';

const DEFAULT_DAYS = 4;
const MAX_DAYS = 31;

function parseDateKey(input: string): { year: number; month: number; day: number } | null {
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(utc.getTime()) ||
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    throw new Error('invalid dateKey');
  }

  const base = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  base.setUTCDate(base.getUTCDate() + days);

  const year = String(base.getUTCFullYear());
  const month = String(base.getUTCMonth() + 1).padStart(2, '0');
  const day = String(base.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toSeoulDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('failed to format date in Asia/Seoul');
  }

  return `${year}-${month}-${day}`;
}

function normalizeDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'string') {
    const matched = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return matched ? matched[1] : null;
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate')?.trim() ?? '';
    const daysParam = searchParams.get('days')?.trim() ?? '';

    let startDate = startDateParam;
    if (!startDate) {
      const minDateRows = await prisma.$queryRaw<Array<{ minDate: Date | string | null }>>(
        Prisma.sql`SELECT MIN("createdAt"::date) AS "minDate" FROM "Order" WHERE "productType" = 1 AND "paymentStatus" = ${ORDER_PAYMENT_STATUS.PAID}::"PaymentStatus"`
      );
      const minDate = normalizeDateKey(minDateRows[0]?.minDate);
      startDate = minDate ?? toSeoulDateKey();
    }

    if (!parseDateKey(startDate)) {
      return jsonError(400, 'INVALID_INPUT', 'startDate는 YYYY-MM-DD 형식이어야 합니다.');
    }

    let days = DEFAULT_DAYS;
    if (daysParam) {
      const parsedDays = Number(daysParam);
      if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > MAX_DAYS) {
        return jsonError(400, 'INVALID_INPUT', `days는 1 이상 ${MAX_DAYS} 이하의 정수여야 합니다.`);
      }
      days = parsedDays;
    }

    const dateKeys = Array.from({ length: days }, (_, idx) => addDaysToDateKey(startDate, idx));

    const dailyAmounts = await Promise.all(
      dateKeys.map(async (dateKey) => {
        const sumRows = await prisma.$queryRaw<Array<{ total: bigint | number | null }>>(
          Prisma.sql`
            SELECT COALESCE(SUM("paymentAmount"), 0)::bigint AS total
            FROM "Order"
            WHERE "productType" = 1 AND "paymentStatus" = ${ORDER_PAYMENT_STATUS.PAID}::"PaymentStatus" AND "createdAt"::date = ${dateKey}::date
          `
        );

        return {
          date: dateKey,
          salesAmount: Number(sumRows[0]?.total ?? 0),
        };
      })
    );

    let cumulative = 0;
    const rows = dailyAmounts.map((row, idx) => {
      cumulative += row.salesAmount;
      return {
        day: idx + 1,
        periodLabel: `${idx + 1}일차`,
        date: row.date,
        salesAmount: row.salesAmount,
        cumulativeSalesAmount: cumulative,
      };
    });

    return NextResponse.json({
      status: 'success',
      data: {
        startDate,
        days,
        rows,
      },
    });
  } catch (error) {
    console.error('[Admin Data Sales GET Error]', error);
    return apiErrors.serverError();
  }
}
