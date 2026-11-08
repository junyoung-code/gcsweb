import { describe, expect, it } from 'vitest';
import { createMockPosStaffService } from './pos-staff-service';

describe('POS 직원 Mock 서비스', () => {
  it('승인·거절·삭제 결과와 등록일을 동일 인스턴스에서 유지한다', async () => {
    const service = createMockPosStaffService();
    const initial = await service.getStaff();
    const approved = await service.approve(initial.pending[0].id);
    expect(approved.pending).toHaveLength(initial.pending.length - 1);
    expect(approved.registered.at(-1)).toMatchObject({ id: initial.pending[0].id, name: initial.pending[0].name });
    expect(Date.parse(approved.registered.at(-1)!.registeredAt!)).not.toBeNaN();
    await service.reject(initial.pending[1].id);
    await service.remove(initial.pending[0].id);
    expect(await service.getStaff()).toMatchObject({ pending: [], registered: initial.registered });
  });

  it('응답/입력 변경과 별도 POS 세션이 다른 인스턴스에 영향을 주지 않는다', async () => {
    const first = createMockPosStaffService();
    const initial = await first.getStaff();
    const second = createMockPosStaffService(initial);
    initial.pending[0].name = '외부 변경';
    initial.registered.splice(0);
    expect((await first.getStaff()).pending[0].name).toBe('정서윤');
    expect((await second.getStaff()).pending[0].name).toBe('정서윤');
    await first.reject('pending-1');
    expect((await second.getStaff()).pending).toHaveLength(2);
    expect((await createMockPosStaffService().getStaff()).pending).toHaveLength(2);
  });

  it('대상이 없으면 실패하고 기존 목록을 보존한다', async () => {
    const service = createMockPosStaffService();
    const before = await service.getStaff();
    await expect(service.approve('missing')).rejects.toThrow();
    await expect(service.reject('missing')).rejects.toThrow();
    await expect(service.remove('missing')).rejects.toThrow();
    expect(await service.getStaff()).toEqual(before);
  });
});
