/**
 * Normalization Layer
 * 
 * Design decisions:
 * - Config-driven: field mappings are declared in a client config map, not hardcoded
 *   per client in business logic. Adding a new client = adding a config entry.
 * - Lenient parsing: we try multiple date formats and coerce types rather than
 *   rejecting events outright. This is a deliberate trade-off — we prefer capturing
 *   data with degraded precision over dropping it entirely.
 * - Extra fields are silently ignored (forward-compatible).
 * - Missing optional fields get sensible defaults.
 */

// --- Types ---

export interface RawEvent {
  source: string;
  payload: Record<string, unknown>;
}

export interface NormalizedEvent {
  clientId: string;
  metric: string;
  amount: number;
  timestamp: string; // ISO 8601
}

// --- Client Configuration ---

interface FieldMapping {
  metric?: string[];    // aliases for "metric" field
  amount?: string[];    // aliases for "amount" field
  timestamp?: string[]; // aliases for "timestamp" field
}

// Configurable per-client field mappings.
// Each key is a field in our canonical format; values are aliases
// a client might use. First match wins.
const CLIENT_CONFIGS: Record<string, FieldMapping> = {
  // client_A uses the "standard" field names already
  client_A: {
    metric: ['metric'],
    amount: ['amount'],
    timestamp: ['timestamp'],
  },
  // client_B uses different names
  client_B: {
    metric: ['metric', 'type', 'event_type'],
    amount: ['amount', 'value', 'total'],
    timestamp: ['timestamp', 'ts', 'event_time', 'created_at'],
  },
  // Default fallback for unknown clients — tries common aliases
  _default: {
    metric: ['metric', 'type', 'event_type', 'name'],
    amount: ['amount', 'value', 'total', 'sum'],
    timestamp: ['timestamp', 'ts', 'event_time', 'created_at', 'date'],
  },
};

function getClientConfig(clientId: string): FieldMapping {
  return CLIENT_CONFIGS[clientId] ?? CLIENT_CONFIGS['_default'];
}

// --- Field Extraction ---

/**
 * Extract a field value from payload using a list of candidate keys.
 * Returns undefined if none match.
 */
function extractField(
  payload: Record<string, unknown>,
  candidateKeys: string[]
): unknown {
  for (const key of candidateKeys) {
    if (key in payload && payload[key] !== undefined && payload[key] !== null) {
      return payload[key];
    }
  }
  return undefined;
}

// --- Type Coercion ---

/**
 * Parse a timestamp from various formats into ISO 8601.
 * 
 * Supported formats:
 * - ISO 8601 (2024-01-01T00:00:00Z)
 * - Date only (2024-01-01)
 * - Slash-separated (2024/01/01, 2024/12/31)
 * - Unix epoch (seconds or milliseconds)
 * 
 * Returns ISO string or falls back to current UTC time.
 */
function parseTimestamp(value: unknown): string {
  if (typeof value === 'number') {
    // Unix timestamp — could be seconds or milliseconds
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }

  if (typeof value === 'string') {
    // Try direct ISO parse first
    const iso = Date.parse(value);
    if (!isNaN(iso)) {
      return new Date(iso).toISOString();
    }
  }

  // Fallback: current time
  return new Date().toISOString();
}

/**
 * Parse an amount from various representations.
 * Handles strings ("1200", "1,200.50", "$1200") and numbers.
 * Returns 0 if parsing fails.
 */
function parseAmount(value: unknown): number {
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }

  if (typeof value === 'string') {
    // Strip currency symbols and commas
    const cleaned = value.replace(/[^0-9.\-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

/**
 * Parse a metric name. Returns stringified value or a generic fallback.
 */
function parseMetric(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (value !== undefined && value !== null) {
    return String(value);
  }
  return 'unknown';
}

// --- Main Normalizer ---

export interface NormalizationResult {
  success: true;
  data: NormalizedEvent;
  warnings: string[];
}

export interface NormalizationError {
  success: false;
  error: string;
}

export function normalizeEvent(raw: RawEvent): NormalizationResult | NormalizationError {
  const warnings: string[] = [];
  const config = getClientConfig(raw.source);
  const payload = raw.payload;

  // Extract clientId
  const clientId = typeof raw.source === 'string' ? raw.source.trim() : 'unknown';
  if (clientId === 'unknown' || clientId.length === 0) {
    return { success: false, error: 'Missing or invalid source field' };
  }

  // Extract and normalize metric
  const rawMetric = extractField(payload, config.metric ?? ['metric']);
  if (rawMetric === undefined) {
    return { success: false, error: `Missing required field: metric (tried: ${config.metric?.join(', ') ?? 'metric'})` };
  }
  const metric = parseMetric(rawMetric);

  // Extract and normalize amount
  const rawAmount = extractField(payload, config.amount ?? ['amount']);
  if (rawAmount === undefined) {
    warnings.push('Missing amount field, defaulting to 0');
  }
  const amount = parseAmount(rawAmount);

  // Extract and normalize timestamp
  const rawTimestamp = extractField(payload, config.timestamp ?? ['timestamp']);
  if (rawTimestamp === undefined) {
    warnings.push('Missing timestamp, defaulting to current time');
  }
  const timestamp = parseTimestamp(rawTimestamp);

  return {
    success: true,
    data: { clientId, metric, amount, timestamp },
    warnings,
  };
}

// Re-export types for convenience
export type { FieldMapping };
