import type { PosStaffService, PosStaffSnapshot } from '@/lib/services/pos-staff-service';

function copy(snapshot: PosStaffSnapshot): PosStaffSnapshot {
  return { ...snapshot, pending: snapshot.pending.map(member => ({ ...member })), registered: snapshot.registered.map(member => ({ ...member })) };
}

// One in-memory instance per POS Provider. No server, auth, or browser storage writes.
export function createMockPosStaffService(initial?: PosStaffSnapshot): PosStaffService {
  const snapshot = copy(initial ?? {
    inviteUrl: 'https://example.invalid/mock/pos/staff-invite',
    pending: [
      { id: 'pending-1', name: '정서윤', requestedAt: '2026-11-07T10:21:00+09:00' },
      { id: 'pending-2', name: '이서준', requestedAt: '2026-11-04T14:30:00+09:00' },
    ],
    registered: [
      { id: 'staff-1', name: '김민수', requestedAt: '2026-09-01T10:00:00+09:00', registeredAt: '2026-09-02T10:00:00+09:00' },
      { id: 'staff-2', name: '박지민', requestedAt: '2026-09-02T10:00:00+09:00', registeredAt: '2026-09-03T10:00:00+09:00' },
    ],
  });

  function takePending(id: string) {
    const index = snapshot.pending.findIndex(member => member.id === id);
    if (index < 0) throw new Error('승인 대기 직원을 찾을 수 없어요.');
    return snapshot.pending.splice(index, 1)[0];
  }

  return {
    async getStaff() { return copy(snapshot); },
    async approve(id) {
      const member = takePending(id);
      snapshot.registered.push({ ...member, registeredAt: new Date().toISOString() });
      return copy(snapshot);
    },
    async reject(id) { takePending(id); return copy(snapshot); },
    async remove(id) {
      const index = snapshot.registered.findIndex(member => member.id === id);
      if (index < 0) throw new Error('등록된 직원을 찾을 수 없어요.');
      snapshot.registered.splice(index, 1);
      return copy(snapshot);
    },
  };
}
