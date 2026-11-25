import { toByteArray } from 'base64-js';

// The timestamp only schedules the UI notice. The server authenticates requests.
export function sessionExpiresAt(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const bytes = toByteArray(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='));
    const { exp } = JSON.parse(new TextDecoder().decode(bytes));
    return typeof exp === 'number' && Number.isSafeInteger(exp * 1000) ? exp * 1000 : null;
  } catch {
    return null;
  }
}
