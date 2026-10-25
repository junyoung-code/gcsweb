// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { POST } from './route';

describe('POST /api/v1/qrshop/orders (v1 종료)', () => {
  it('요청 내용과 무관하게 410 QRSHOP_V1_DISABLED', async () => {
    const res = await POST();
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ status: 'error', code: 'QRSHOP_V1_DISABLED' });
  });
});
