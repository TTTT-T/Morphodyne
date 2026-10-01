import type { ContactPatch } from '../core/contact';

/** External evidence: opposing loaded contacts must overlap in physical time. */
export function hasSimultaneousContact(
  first: readonly ContactPatch[], second: readonly ContactPatch[],
): boolean {
  return first.some(a => second.some(b => {
    const aStart = a.sampleOffsetSeconds ?? 0;
    const bStart = b.sampleOffsetSeconds ?? 0;
    return Math.min(aStart + a.seconds, bStart + b.seconds)
      - Math.max(aStart, bStart) > 1e-12;
  }));
}
