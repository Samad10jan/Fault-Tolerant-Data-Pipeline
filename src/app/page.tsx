'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Send,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  RefreshCw,
  Database,
  Shield,
  Layers,
  BarChart3,
} from 'lucide-react';

// --- Types ---

interface ProcessedEvent {
  id: string;
  contentHash: string;
  clientId: string;
  metric: string;
  amount: number;
  timestamp: string;
  rawPayload: string;
  createdAt: string;
}

interface FailedEvent {
  id: string;
  clientId: string | null;
  rawPayload: string;
  error: string;
  createdAt: string;
}

interface Aggregation {
  overall: {
    totalEvents: number;
    totalAmount: number;
    averageAmount: number;
    earliestTimestamp: string | null;
    latestTimestamp: string | null;
  };
  byClient: Array<{
    clientId: string;
    count: number;
    totalAmount: number;
    averageAmount: number;
  }>;
  byMetric: Array<{
    metric: string;
    count: number;
    totalAmount: number;
    averageAmount: number;
  }>;
}

interface SubmitResponse {
  message?: string;
  error?: string;
  eventId?: string;
  contentHash?: string;
  warnings?: string[];
  normalized?: {
    clientId: string;
    metric: string;
    amount: number;
    timestamp: string;
  };
}

// --- Default Payloads ---

const DEFAULT_PAYLOAD = JSON.stringify(
  {
    source: 'client_A',
    payload: {
      metric: 'value',
      amount: '1200',
      timestamp: '2024/01/01',
    },
  },
  null,
  2
);

const CLIENT_B_PAYLOAD = JSON.stringify(
  {
    source: 'client_B',
    payload: {
      type: 'revenue',
      total: '3500.50',
      ts: '2024-03-15T10:30:00Z',
    },
  },
  null,
  2
);

const MALFORMED_PAYLOAD = JSON.stringify(
  {
    source: 'client_A',
    payload: {
      amount: 'not_a_number',
    },
  },
  null,
  2
);

// --- Component ---

export default function Home() {
  const { toast } = useToast();
  const [jsonInput, setJsonInput] = useState(DEFAULT_PAYLOAD);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastResponse, setLastResponse] = useState<SubmitResponse | null>(null);
  const [processedEvents, setProcessedEvents] = useState<ProcessedEvent[]>([]);
  const [failedEvents, setFailedEvents] = useState<FailedEvent[]>([]);
  const [aggregation, setAggregation] = useState<Aggregation | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const submitEvent = useCallback(async () => {
    setSubmitting(true);
    setLastResponse(null);

    try {
      const body = JSON.parse(jsonInput);
      const url = simulateFailure ? '/api/events?simulateFailure=true' : '/api/events';

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      setLastResponse(data);

      if (res.ok) {
        toast({
          title: data.message || 'Success',
          description: data.warnings?.length
            ? `Warnings: ${data.warnings.join(', ')}`
            : undefined,
        });
        // Refresh all views
        fetchProcessedEvents();
        fetchFailedEvents();
        fetchAggregation();
      } else {
        toast({
          title: 'Error',
          description: data.error || `Request failed with status ${res.status}`,
          variant: 'destructive',
        });
        // Refresh failed events view
        fetchFailedEvents();
      }
    } catch (e) {
      setLastResponse({ error: 'Invalid JSON input' });
      toast({
        title: 'Invalid JSON',
        description: 'Please check your JSON syntax.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }, [jsonInput, simulateFailure, toast]);

  const fetchProcessedEvents = useCallback(async () => {
    setLoading((p) => ({ ...p, processed: true }));
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      setProcessedEvents(data.events || []);
    } finally {
      setLoading((p) => ({ ...p, processed: false }));
    }
  }, []);

  const fetchFailedEvents = useCallback(async () => {
    setLoading((p) => ({ ...p, failed: true }));
    try {
      const res = await fetch('/api/events/failed');
      const data = await res.json();
      setFailedEvents(data.events || []);
    } finally {
      setLoading((p) => ({ ...p, failed: false }));
    }
  }, []);

  const fetchAggregation = useCallback(async () => {
    setLoading((p) => ({ ...p, aggregation: true }));
    try {
      const res = await fetch('/api/aggregation');
      const data = await res.json();
      setAggregation(data);
    } finally {
      setLoading((p) => ({ ...p, aggregation: false }));
    }
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  const loadExample = (payload: string) => {
    setJsonInput(payload);
    setLastResponse(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Database className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Fault-Tolerant Data Pipeline</h1>
              <p className="text-sm text-muted-foreground">Ingest, normalize, deduplicate, aggregate</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:flex gap-1">
              <Shield className="w-3 h-3" />
              Idempotent
            </Badge>
            <Badge variant="outline" className="hidden sm:flex gap-1">
              <Layers className="w-3 h-3" />
              Normalized
            </Badge>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-6 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Submission Panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  Submit Raw Event
                </CardTitle>
                <CardDescription>
                  Paste a raw JSON event from any client. The normalization layer handles field mapping.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Example buttons */}
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground self-center">Examples:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadExample(DEFAULT_PAYLOAD)}
                  >
                    client_A (standard)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadExample(CLIENT_B_PAYLOAD)}
                  >
                    client_B (aliases)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadExample(MALFORMED_PAYLOAD)}
                  >
                    Malformed
                  </Button>
                </div>

                {/* JSON editor */}
                <textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  className="w-full h-44 rounded-md border border-input bg-muted/50 p-3 font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  spellCheck={false}
                />

                {/* Controls row */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="simulate-failure"
                      checked={simulateFailure}
                      onCheckedChange={setSimulateFailure}
                    />
                    <Label
                      htmlFor="simulate-failure"
                      className="text-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      Simulate failure
                    </Label>
                  </div>
                  <Button onClick={submitEvent} disabled={submitting}>
                    {submitting ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Submit
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Response Panel */}
            {lastResponse && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    {lastResponse.error ? (
                      <XCircle className="w-4 h-4 text-destructive" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    )}
                    Response
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto max-h-60">
                      <code>{JSON.stringify(lastResponse, null, 2)}</code>
                    </pre>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7"
                      onClick={() => copyToClipboard(JSON.stringify(lastResponse, null, 2))}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Data Views */}
          <div>
            <Tabs defaultValue="processed" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="processed" className="text-xs sm:text-sm">
                  Processed
                </TabsTrigger>
                <TabsTrigger value="failed" className="text-xs sm:text-sm">
                  Failed
                </TabsTrigger>
                <TabsTrigger value="aggregation" className="text-xs sm:text-sm">
                  <BarChart3 className="w-3.5 h-3.5 sm:mr-1" />
                  Aggregation
                </TabsTrigger>
              </TabsList>

              {/* Processed Events Tab */}
              <TabsContent value="processed">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Processed Events</CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchProcessedEvents}
                        disabled={loading.processed}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading.processed ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                    <CardDescription>
                      Successfully normalized and deduplicated events
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {processedEvents.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>No processed events yet</p>
                        <p className="text-xs mt-1">Submit an event to see it here</p>
                      </div>
                    ) : (
                      <ScrollArea className="max-h-96">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Client</TableHead>
                              <TableHead className="text-xs">Metric</TableHead>
                              <TableHead className="text-xs text-right">Amount</TableHead>
                              <TableHead className="text-xs hidden sm:table-cell">Timestamp</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {processedEvents.map((event) => (
                              <TableRow key={event.id}>
                                <TableCell className="text-xs font-medium">
                                  <Badge variant="secondary" className="text-xs">
                                    {event.clientId}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs">{event.metric}</TableCell>
                                <TableCell className="text-xs text-right font-mono">
                                  {event.amount.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                                  {new Date(event.timestamp).toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Failed Events Tab */}
              <TabsContent value="failed">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-destructive" />
                        Failed Events
                      </CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchFailedEvents}
                        disabled={loading.failed}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading.failed ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                    <CardDescription>
                      Rejected or failed events with error details
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {failedEvents.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>No failed events</p>
                        <p className="text-xs mt-1">All events processed successfully</p>
                      </div>
                    ) : (
                      <ScrollArea className="max-h-96">
                        <div className="space-y-3">
                          {failedEvents.map((event) => (
                            <div
                              key={event.id}
                              className="rounded-md border border-destructive/20 bg-destructive/5 p-3"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <Badge variant="destructive" className="text-xs">
                                  {event.clientId ?? 'unknown'}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(event.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-sm text-destructive font-medium">{event.error}</p>
                              <details className="mt-2">
                                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                  Raw payload
                                </summary>
                                <pre className="text-xs bg-muted/50 rounded p-2 mt-1 overflow-x-auto">
                                  {event.rawPayload}
                                </pre>
                              </details>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Aggregation Tab */}
              <TabsContent value="aggregation">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" />
                        Aggregated Results
                      </CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchAggregation}
                        disabled={loading.aggregation}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading.aggregation ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                    <CardDescription>
                      Read-only aggregation over deduplicated, normalized data
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!aggregation ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>No aggregation data</p>
                        <p className="text-xs mt-1">Submit events to see aggregated results</p>
                      </div>
                    ) : (
                      <ScrollArea className="max-h-96">
                        <div className="space-y-6">
                          {/* Overall stats */}
                          <div>
                            <h4 className="text-sm font-medium mb-3">Overall</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <StatCard label="Total Events" value={aggregation.overall.totalEvents} />
                              <StatCard label="Total Amount" value={aggregation.overall.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
                              <StatCard label="Avg Amount" value={aggregation.overall.averageAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
                              <StatCard
                                label="Time Range"
                                value={aggregation.overall.earliestTimestamp
                                  ? `${new Date(aggregation.overall.earliestTimestamp).toLocaleDateString()} – ${new Date(aggregation.overall.latestTimestamp!).toLocaleDateString()}`
                                  : 'N/A'
                                }
                              />
                            </div>
                          </div>

                          <Separator />

                          {/* Per-client breakdown */}
                          <div>
                            <h4 className="text-sm font-medium mb-3">By Client</h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Client</TableHead>
                                  <TableHead className="text-xs text-right">Count</TableHead>
                                  <TableHead className="text-xs text-right">Total</TableHead>
                                  <TableHead className="text-xs text-right">Avg</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {aggregation.byClient.map((row) => (
                                  <TableRow key={row.clientId}>
                                    <TableCell className="text-xs font-medium">
                                      <Badge variant="secondary" className="text-xs">{row.clientId}</Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-right">{row.count}</TableCell>
                                    <TableCell className="text-xs text-right font-mono">{row.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-xs text-right font-mono">{row.averageAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                  </TableRow>
                                ))}
                                {aggregation.byClient.length === 0 && (
                                  <TableRow>
                                    <TableCell colSpan={4} className="text-xs text-center text-muted-foreground py-4">
                                      No data
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>

                          <Separator />

                          {/* Per-metric breakdown */}
                          <div>
                            <h4 className="text-sm font-medium mb-3">By Metric</h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Metric</TableHead>
                                  <TableHead className="text-xs text-right">Count</TableHead>
                                  <TableHead className="text-xs text-right">Total</TableHead>
                                  <TableHead className="text-xs text-right">Avg</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {aggregation.byMetric.map((row) => (
                                  <TableRow key={row.metric}>
                                    <TableCell className="text-xs font-medium">{row.metric}</TableCell>
                                    <TableCell className="text-xs text-right">{row.count}</TableCell>
                                    <TableCell className="text-xs text-right font-mono">{row.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-xs text-right font-mono">{row.averageAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                  </TableRow>
                                ))}
                                {aggregation.byMetric.length === 0 && (
                                  <TableRow>
                                    <TableCell colSpan={4} className="text-xs text-center text-muted-foreground py-4">
                                      No data
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Architecture Notes */}
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">System Architecture</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="space-y-1">
                <h4 className="font-medium flex items-center gap-1.5">
                  <Layers className="w-4 h-4" /> Normalization Layer
                </h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Config-driven field mapping per client. Lenient type coercion (strings to numbers, various date formats).
                  Extra fields silently ignored. Missing fields get defaults.
                </p>
              </div>
              <div className="space-y-1">
                <h4 className="font-medium flex items-center gap-1.5">
                  <Shield className="w-4 h-4" /> Deduplication
                </h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Content-hash based (SHA-256 of clientId + metric + amount + timestamp).
                  Enforced via UNIQUE DB constraint inside a transaction. No dependency on client-provided IDs.
                </p>
              </div>
              <div className="space-y-1">
                <h4 className="font-medium flex items-center gap-1.5">
                  <Database className="w-4 h-4" /> Failure Safety
                </h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Normalization happens outside the transaction (cheap). DB write is transactional.
                  On retry, content hash check prevents double-counting even if the original write succeeded.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 text-center text-xs text-muted-foreground">
          Fault-Tolerant Data Processing System &mdash; Built with Next.js, Prisma, SQLite
        </div>
      </footer>
    </div>
  );
}

// --- Small helper component ---

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold font-mono mt-0.5">{value}</p>
    </div>
  );
}