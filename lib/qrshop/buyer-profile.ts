export type QrshopBuyer = { email: string; phone: string; name: string };
export const emptyQrshopBuyer: QrshopBuyer = { email: '', phone: '', name: '' };

// Read the existing member endpoint; buyer details remain in component memory.
export async function getQrshopBuyer(signal?: AbortSignal): Promise<QrshopBuyer> {
  const response = await fetch('/api/user/profile', { cache: 'no-store', signal });
  if (response.status === 401) return { ...emptyQrshopBuyer };
  if (!response.ok) throw new Error('회원정보를 불러오지 못했습니다. 다시 확인해주세요.');
  const profile = await response.json();
  const email = typeof profile.email === 'string' ? profile.email.trim() : '';
  const phone = typeof profile.phone === 'string' ? profile.phone.replace(/[\s-]/g, '') : '';
  const name = typeof profile.name === 'string' ? profile.name.trim() : '';
  return {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    phone: /^01[016789][0-9]{7,8}$/.test(phone) ? phone : '',
    name,
  };
}
