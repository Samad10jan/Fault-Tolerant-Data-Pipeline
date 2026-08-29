import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/events/failed
 * 
 * Lists failed/rejected events for visibility and debugging.
 */
export async function GET() {
  const failedEvents = await db.failedEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ events: failedEvents });
}
