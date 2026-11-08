export interface PosStaffMember {
  id: string;
  name: string;
  requestedAt: string;
  registeredAt?: string;
}

export interface PosStaffSnapshot {
  pending: PosStaffMember[];
  registered: PosStaffMember[];
  // This service currently supplies a non-operational example URL only.
  inviteUrl: string;
}

export interface PosStaffService {
  getStaff(): Promise<PosStaffSnapshot>;
  approve(id: string): Promise<PosStaffSnapshot>;
  reject(id: string): Promise<PosStaffSnapshot>;
  remove(id: string): Promise<PosStaffSnapshot>;
}
