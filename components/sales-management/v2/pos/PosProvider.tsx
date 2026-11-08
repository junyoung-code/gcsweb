'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { createMockPosService } from '@/lib/mocks/pos-service';
import { createMockPosStaffService } from '@/lib/mocks/pos-staff-service';
import type { PosExposure, PosService } from '@/lib/services/pos-service';
import type { PosStaffService } from '@/lib/services/pos-staff-service';
import { useSalesManagementV2Service } from '../SalesManagementV2Provider';

interface PosSession {
  service: PosService;
  staffService: PosStaffService;
  draft: PosExposure | null;
  setDraft: (draft: PosExposure | null) => void;
}
const Context = createContext<PosSession | null>(null);

export default function PosProvider({ children, service: providedService, staffService: providedStaffService }: { children: ReactNode; service?: PosService; staffService?: PosStaffService }) {
  const source = useSalesManagementV2Service();
  const [service] = useState(() => {
    if (providedService) return providedService;
    if (!source) throw new Error('POS v2 Provider가 필요합니다.');
    return createMockPosService(source);
  });
  const [draft, setDraft] = useState<PosExposure | null>(null);
  const [staffService] = useState(() => providedStaffService ?? createMockPosStaffService());
  return <Context.Provider value={{ service, staffService, draft, setDraft }}>{children}</Context.Provider>;
}

export const usePosSession = () => useContext(Context);

export function usePosService(providedService?: PosService): PosService {
  const session = usePosSession();
  const service = providedService ?? session?.service;
  if (!service) throw new Error('POS Provider가 필요합니다.');
  return service;
}
