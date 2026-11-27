const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function untilNextKoreanDay(now = Date.now()): number {
  return DAY_MS - (now + KST_OFFSET_MS) % DAY_MS;
}
