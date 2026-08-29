import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeEvent, type RawEvent } from '@/lib/normalizer';
import { generateContentHash } from '@/lib/dedup';

/**
 * POST /api/events
 * 
 * Ingests a raw event, normalizes it, deduplicates it, and stores it.
 * 
 * Partial failure handling strategy:
 * We use Prisma's interactive transactions. The entire normalize → check → insert
 * pipeline runs inside a transaction. If the DB write fails, the transaction
 * rolls back and the client can safely retry. On retry, the content hash check
 * prevents double-counting.
 * 
 * Why this works:
 * 1. Event received and validated (outside TX — cheap, no side effects)
 * 2. Transaction begins
 * 3. Check for existing content hash (inside TX — serializable read)
 * 4. Insert new event (inside TX)
 * 5. Commit
 * 
 * If step 4 fails, the TX rolls back. Client retries. Step 3 catches the retry
 * IF the insert actually succeeded before the connection dropped.
 * 
 * Edge case: insert succeeds on the server but the response doesn't reach the
 * client. Client retries. Content hash match → we return 200 with the existing
 * record. No double counting.
 * 
 * Failure simulation: pass ?simulateFailure=true to trigger an artificial error
 * after validation but before DB write. This demonstrates the retry safety.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const simulateFailure = request.nextUrl.searchParams.get('simulateFailure') === 'true';

    // --- Step 1: Basic structure validation ---
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be a JSON object' },
        { status: 400 }
      );
    }

    if (!body.source || typeof body.source !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "source" field' },
        { status: 400 }
      );
    }

    if (!body.payload || typeof body.payload !== 'object') {
      return NextResponse.json(
        { error: 'Missing or invalid "payload" field' },
        { status: 400 }
      );
    }

    const rawEvent: RawEvent = {
      source: body.source,
      payload: body.payload,
    };

    // --- Step 2: Normalize ---
    const normResult = normalizeEvent(rawEvent);

    if (!normResult.success) {
      // Store the failure for visibility, then return error
      await db.failedEvent.create({
        data: {
          clientId: rawEvent.source,
          rawPayload: JSON.stringify(body),
          error: normResult.error,
        },
      });
      return NextResponse.json(
        { error: `Normalization failed: ${normResult.error}` },
        { status: 422 }
      );
    }

    const { data: normalized, warnings } = normResult;
    const contentHash = generateContentHash(normalized);

    // --- Step 3: Simulate failure if requested ---
    // This simulates the scenario: validated → DB write fails → client retries
    if (simulateFailure) {
      await db.failedEvent.create({
        data: {
          clientId: rawEvent.source,
          rawPayload: JSON.stringify(body),
          error: 'Simulated failure: DB write intentionally skipped to demonstrate retry safety',
        },
      });
      return NextResponse.json(
        {
          error: 'Simulated database failure',
          message: 'The event was validated and normalized successfully, but the database write was intentionally failed. Retrying this exact same payload will be safe — the deduplication layer will handle it.',
          normalized,
          contentHash,
          warnings,
        },
        { status: 503 }
      );
    }

    // --- Step 4: Transactional insert with dedup check ---
    const result = await db.$transaction(async (tx) => {
      // Check for existing event with same content hash
      const existing = await tx.event.findUnique({
        where: { contentHash },
      });

      if (existing) {
        return { status: 'duplicate' as const, event: existing };
      }

      // Insert new event
      const event = await tx.event.create({
        data: {
          contentHash,
          clientId: normalized.clientId,
          metric: normalized.metric,
          amount: normalized.amount,
          timestamp: new Date(normalized.timestamp),
          rawPayload: JSON.stringify(body),
        },
      });

      return { status: 'created' as const, event };
    });

    if (result.status === 'duplicate') {
      return NextResponse.json({
        message: 'Duplicate event detected — already processed',
        eventId: result.event.id,
        contentHash,
        warnings,
      });
    }

    return NextResponse.json({
      message: 'Event processed successfully',
      eventId: result.event.id,
      contentHash,
      warnings,
    });
  } catch (error) {
    // Catch-all for unexpected errors (e.g., DB connection failures)
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Internal server error: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/events
 * 
 * Lists successfully processed events with optional filtering.
 * Query params: clientId, from, to
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const clientId = searchParams.get('clientId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const where: Record<string, unknown> = {};
  if (clientId) where.clientId = clientId;
  if (from || to) {
    where.timestamp = {};
    if (from) (where.timestamp as Record<string, unknown>).gte = new Date(from);
    if (to) (where.timestamp as Record<string, unknown>).lte = new Date(to);
  }

  const events = await db.event.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ events });
}
