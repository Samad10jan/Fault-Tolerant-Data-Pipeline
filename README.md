
# Fault-Tolerant Data Processing System

## Quick Start

```bash
npm run setup      # installs dependencies, generates Prisma client, creates database
npm run dev        # starts the dev server on http://localhost:3000
```

## What assumptions did you make?

1. **Content identity is sufficient for deduplication.** Since clients don't provide reliable unique event IDs, I assume that the combination of `(clientId, metric, amount, timestamp)` uniquely identifies a real-world event. This means two legitimately identical events (same client, same metric, same amount, same second) would be treated as duplicates. I accept this trade-off because the problem statement says clients "may resend events" — implying duplicates are expected and identical events are likely retries, not distinct data points.

2. **Normalization can be done statelessly.** I assume field mapping and type coercion don't require external lookups or state. Each event is self-contained, so the normalizer is a pure function. This keeps the system simple and testable.

3. **"Consistent aggregated outputs" means read-after-write consistency.** I assume callers expect that once they receive a 200 response, subsequent aggregation queries will reflect that event. This is naturally provided by SQLite's serializable isolation.

4. **Client configs are known at deploy time.** The normalization config (field aliases per client) lives in code. For a production system this would move to a database or config service, but for this assignment the code-based config is appropriate — it's centralized, type-checked, and easy to extend.

5. **The database is the source of truth.** I don't implement an outbox pattern, event log, or message queue. The SQLite database serves as both the persistence layer and the deduplication enforcer. This is appropriate for the single-node scope described.

6. **Lenient parsing over strict rejection.** I prefer to capture data with degraded precision (e.g., defaulting a missing timestamp to now, coercing "$1,200" to 1200) rather than rejecting it outright. Failed normalizations are still recorded in the `FailedEvent` table for debugging.

## How does your system prevent double counting?

The deduplication strategy is **content hashing with database-level uniqueness enforcement**:

1. After normalization, I compute `SHA-256(clientId | metric | amount | timestamp)` — this is the content hash.
2. The entire check-then-insert runs inside a **Prisma interactive transaction**.
3. The `contentHash` column has a `@unique` constraint in the Prisma schema, which maps to a `UNIQUE INDEX` in SQLite.
4. Inside the transaction, I first query for an existing event with the same hash. If found, I return the existing record (idempotent response).
5. If not found, I insert. The UNIQUE constraint provides a second safety net — even if two concurrent requests pass the check simultaneously, only one insert succeeds; the other gets a constraint violation which I catch at the transaction level.

This two-layer approach (application-level check + database constraint) means:
- Normal retries from the same client are caught by the hash check.
- Concurrent duplicate requests are caught by the UNIQUE constraint.
- No event is ever counted twice in the aggregation queries.

## What happens if the database fails mid-request?

The ingestion pipeline is designed as a two-phase process:

**Phase 1 (outside transaction — no side effects):**
- Parse and validate the request body structure.
- Run the normalizer to produce a canonical event.
- Compute the content hash.

If anything in Phase 1 fails, the client gets an error and no data was written. Safe to retry.

**Phase 2 (inside transaction):**
- Begin a Prisma interactive transaction.
- Check for existing content hash.
- Insert the new event.
- Commit.

If the database fails during Phase 2:
- **The transaction rolls back.** No partial data is persisted. The `Event` table remains consistent.
- The client receives a 500 error.
- **On retry:** The client resends the same payload. The normalizer produces the same output. The content hash is identical. The transaction checks for the hash — it won't find it (because the original insert rolled back) — and inserts cleanly.

**The critical edge case:** What if the insert succeeds and commits, but the response doesn't reach the client (network failure on the return path)?
- The client retries, thinking it failed.
- The content hash check finds the existing event.
- We return 200 with the existing event's ID and a "Duplicate event detected" message.
- **No double counting occurs.** The aggregation reads from the committed `Event` table, which has exactly one row.

## What would break first at scale?

1. **Content hash collisions under high cardinality.** SHA-256 makes this astronomically unlikely, but the hash is computed over four fields. If a single client sends millions of events per second with the same metric and the same timestamp granularity (seconds), we'd dedup legitimate distinct events. **Fix:** Add a sequence number or use millisecond/nanosecond timestamp precision in the hash input.

2. **Transaction throughput on SQLite.** SQLite uses file-level locking for writes. Under high concurrency, write transactions serialize and become a bottleneck. **Fix:** Move to PostgreSQL with row-level locking, or use a write-ahead log (WAL) mode in SQLite for better read concurrency while accepting single-writer throughput.

3. **Aggregation query performance.** The aggregation API runs `GROUP BY` queries at request time over the full `Event` table. As the table grows to millions of rows, these queries slow down. **Fix:** Precompute aggregations in a materialized view or summary table, updated incrementally on each write.

4. **The normalization config is in-memory.** Adding a new client requires a code deploy. **Fix:** Move client configs to a database table or a config service with hot-reload.

5. **No pagination on event listing.** The API caps at 100 events but doesn't support cursor-based pagination. For large datasets, clients can't efficiently browse all events. **Fix:** Add cursor-based pagination using the `createdAt` + `id` columns.

## Architecture Overview

```
Client Request
      |
      v
[POST /api/events]
      |
      v
Phase 1: Validate + Normalize (no side effects)
  |-- Structure validation (source, payload present)
  |-- Config-driven field mapping (per-client aliases)
  |-- Type coercion (string->number, date format normalization)
  |-- Content hash computation (SHA-256)
      |
      v
Phase 2: Transactional Write
  |-- db.$transaction()
      |-- Check existing content hash
      |-- Insert Event or return existing
      |-- Commit
      |
      v
Response (success / duplicate / error)
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/normalizer.ts` | Config-driven normalization: field mapping, type coercion, missing field handling |
| `src/lib/dedup.ts` | Content hash generation for idempotency |
| `src/lib/db.ts` | Prisma client singleton |
| `src/app/api/events/route.ts` | Ingestion endpoint (POST) and listing endpoint (GET) with transactional writes |
| `src/app/api/events/failed/route.ts` | Failed events listing |
| `src/app/api/aggregation/route.ts` | Read-only aggregation (totals, counts, per-client and per-metric breakdowns) |
| `src/app/page.tsx` | Frontend UI with submission form, failure simulation toggle, and three data views |
| `prisma/schema.prisma` | Database schema with UNIQUE content hash constraint |#
