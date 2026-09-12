/** Extract only a room id; invitations never change the server or navigate away. */
export function invitationRoom(input: string, baseUrl: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const validId = /^[a-zA-Z0-9_-]{1,64}$/;
  if (validId.test(value)) return value;
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const id = url.searchParams.get('room');
    return id && validId.test(id) ? id : null;
  } catch {
    return null;
  }
}
