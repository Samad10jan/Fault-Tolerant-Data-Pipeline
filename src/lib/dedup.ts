/**
 * Deduplication via Content Hashing
 * 
 * Design decision: Since clients don't provide a reliable unique event ID,
 * we derive a deterministic hash from the normalized event's meaningful fields.
 * 
 * Why content hash over other approaches:
 * - No dependency on client-provided IDs (they're unreliable per spec)
 * - Timestamps alone aren't unique enough
 * - Combination of (clientId + metric + amount + timestamp) creates a
 *   practical uniqueness key that catches exact duplicates and near-duplicates
 *   from retries
 * 
 * Trade-off: If a client legitimately sends two identical events (same metric,
 * amount, and timestamp), we'd dedup them. This is acceptable because:
 * 1. The spec says clients may resend events, implying duplicates are expected
 * 2. Real-world event streams typically have at least millisecond timestamp differences
 * 3. We document this assumption clearly
 */

import { createHash } from 'crypto';
import type { NormalizedEvent } from './normalizer';

/**
 * Generate a deterministic SHA-256 content hash from a normalized event.
 * The hash covers the fields that define event identity.
 */
export function generateContentHash(event: NormalizedEvent): string {
  const payload = `${event.clientId}|${event.metric}|${event.amount}|${event.timestamp}`;
  return createHash('sha256').update(payload).digest('hex');
}
