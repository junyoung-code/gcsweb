import path from 'path';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { apiError as errorResponse } from '@/lib/api-response';

export const runtime = 'nodejs';

type UsagePolicy = {
  maxBytes: number;
  allowedMimes: string[];
  requiresAdmin: boolean;
};

const MB = 1024 * 1024;
const MIME_TO_EXTS: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

const USAGE_POLICIES: Record<string, UsagePolicy> = {
  PROFILE: {
    maxBytes: 10 * MB,
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
    requiresAdmin: false,
  },
  PROJECT_THUMBNAIL: {
    maxBytes: 50 * MB,
    allowedMimes: ['image/jpeg', 'image/png'],
    requiresAdmin: true,
  },
  PROJECT_DETAIL: {
    maxBytes: 50 * MB,
    allowedMimes: ['image/jpeg', 'image/png'],
    requiresAdmin: true,
  },
  BANK_ACCOUNT: {
    maxBytes: 50 * MB,
    allowedMimes: ['image/jpeg', 'image/png'],
    requiresAdmin: true,
  },
  PRODUCT_THUMBNAIL: {
    maxBytes: 10 * MB,
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
    requiresAdmin: false,
  },
  PRODUCT_DETAIL: {
    maxBytes: 10 * MB,
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
    requiresAdmin: false,
  },
  PRODUCT_NOTICE: {
    maxBytes: 10 * MB,
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
    requiresAdmin: false,
  },
  /// 판매자가 올리는 QRshop 현장 상품 사진. OnsiteProduct.imageUrl 에 들어간다.
  ONSITE_PRODUCT: {
    maxBytes: 10 * MB,
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
    requiresAdmin: false,
  },
  /// 판매자 상점 프로필 이미지. Store.imageUrl 에 들어간다.
  STORE_PROFILE: {
    maxBytes: 10 * MB,
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
    requiresAdmin: false,
  },
};

function getUsageFromRequest(request: Request, formData: FormData) {
  const url = new URL(request.url);
  const queryUsage = url.searchParams.get('usage');
  const bodyUsage = formData.get('usage');
  return (queryUsage ?? (typeof bodyUsage === 'string' ? bodyUsage : '')).trim();
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return errorResponse(401, 'UNAUTHORIZED', '토큰이 만료되었거나 유효하지 않습니다.');
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return errorResponse(400, 'INVALID_INPUT', 'usage와 image는 필수입니다.');
    }

    const formData = await request.formData();
    const usage = getUsageFromRequest(request, formData);
    const imageEntry = formData.get('image');

    let file: File | null = null;
    if (imageEntry && typeof imageEntry === 'object' && 'arrayBuffer' in imageEntry) {
      file = imageEntry as unknown as File;
    }

    if (!usage || !file) {
      return errorResponse(400, 'INVALID_INPUT', 'usage와 image는 필수입니다.');
    }

    const policy = USAGE_POLICIES[usage];
    if (!policy) {
      return errorResponse(400, 'INVALID_USAGE', '지원하지 않는 usage 값입니다.');
    }

    if (policy.requiresAdmin) {
      const adminUser = await prisma.user.findFirst({ where: { email: session.user.email },
        select: { memberType: true },
      });

      if (!adminUser || Number(adminUser.memberType) !== 2) {
        return errorResponse(403, 'FORBIDDEN', '해당 이미지 업로드 권한이 없습니다.');
      }
    }

    const size = Number(file.size ?? 0);
    if (!size) {
      return errorResponse(400, 'INVALID_FILE', '파일이 비어있거나 지원하지 않는 이미지 형식입니다.');
    }

    const mimeType = String(file.type ?? '').toLowerCase();
    if (!mimeType || !policy.allowedMimes.includes(mimeType)) {
      return errorResponse(400, 'INVALID_FILE', '지원하지 않는 이미지 형식입니다.');
    }

    const ext = path.extname(file.name || '').toLowerCase();
    const allowedExts = new Set(policy.allowedMimes.flatMap((mime) => MIME_TO_EXTS[mime] ?? []));
    if (!ext || !allowedExts.has(ext)) {
      return errorResponse(400, 'INVALID_FILE', '지원하지 않는 이미지 형식입니다.');
    }

    if (size > policy.maxBytes) {
      return errorResponse(413, 'FILE_TOO_LARGE', '파일 크기가 허용 용량을 초과했습니다.');
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const image = await prisma.image.create({
      data: {
        usage,
        mimeType,
        fileSize: size,
        data: buffer,
      },
    });

    return NextResponse.json({
      status: 'success',
      data: { imageUrl: `/api/v1/images/${image.id}` },
    });
  } catch (error: any) {
    console.error('Image upload API error details:', error?.message || error);
    return errorResponse(500, 'SERVER_ERROR', '서버 내부 오류 발생.');
  }
}
