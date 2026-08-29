import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/aggregation
 * 
 * Returns aggregated data: totals, counts, per-client breakdowns.
 * Query params: clientId, from, to
 * 
 * Design: Aggregation is read-only and runs against the normalized Event table.
 * It's completely separated from ingestion — it reads the committed, deduplicated
 * data and computes aggregates at query time.
 * 
 * Future extensibility:
 * - Additional aggregation functions (avg, min, max, percentiles) can be added
 *   as new fields in the response without changing the API contract.
 * - Grouping by time buckets (hourly, daily) would be a new endpoint or param.
 * - Precomputed materialized views would be the scale-out path.
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

  // Overall aggregation
  const overall = await db.event.aggregate({
    where,
    _count: true,
    _sum: { amount: true },
    _avg: { amount: true },
    _min: { timestamp: true },
    _max: { timestamp: true },
  });

  // Per-client breakdown
  const clientGroups = await db.event.groupBy({
    by: ['clientId'],
    where,
    _count: true,
    _sum: { amount: true },
    _avg: { amount: true },
    orderBy: { clientId: 'asc' },
  });

  // Per-metric breakdown
  const metricGroups = await db.event.groupBy({
    by: ['metric'],
    where,
    _count: true,
    _sum: { amount: true },
    _avg: { amount: true },
    orderBy: { metric: 'asc' },
  });

  return NextResponse.json({
    overall: {
      totalEvents: overall._count,
      totalAmount: overall._sum.amount ?? 0,
      averageAmount: overall._avg.amount ?? 0,
      earliestTimestamp: overall._min.timestamp,
      latestTimestamp: overall._max.timestamp,
    },
    byClient: clientGroups.map((g) => ({
      clientId: g.clientId,
      count: g._count,
      totalAmount: g._sum.amount ?? 0,
      averageAmount: g._avg.amount ?? 0,
    })),
    byMetric: metricGroups.map((g) => ({
      metric: g.metric,
      count: g._count,
      totalAmount: g._sum.amount ?? 0,
      averageAmount: g._avg.amount ?? 0,
    })),
  });
}
