/**
 * Lightweight perf timer used by the turn processor and admin UI to measure
 * where wall-clock time is spent. Admin-only: callers pass `enabled: false`
 * (or omit) to make every method a no-op with no allocations beyond the
 * shell object.
 */
export interface PerfEntry {
  name: string;
  ms: number;
}

export class PerfTimer {
  readonly enabled: boolean;
  readonly entries: PerfEntry[] = [];
  private t0: number;

  constructor(enabled: boolean) {
    this.enabled = enabled;
    this.t0 = enabled ? performance.now() : 0;
  }

  /** Time an async block and record it under `name`. */
  async time<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    if (!this.enabled) return await fn();
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.entries.push({ name, ms: performance.now() - start });
    }
  }

  /** Manual mark: record a duration you measured yourself. */
  add(name: string, ms: number) {
    if (!this.enabled) return;
    this.entries.push({ name, ms });
  }

  totalMs(): number {
    return this.enabled ? performance.now() - this.t0 : 0;
  }

  /** Aggregate rows by name and produce a sorted report with percentages. */
  report(): Array<PerfEntry & { pct: number }> {
    const totals = new Map<string, number>();
    for (const e of this.entries) totals.set(e.name, (totals.get(e.name) || 0) + e.ms);
    const total = this.totalMs() || Array.from(totals.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(totals.entries())
      .map(([name, ms]) => ({ name, ms: Math.round(ms), pct: Math.round((ms / total) * 100) }))
      .sort((a, b) => b.ms - a.ms);
  }

  /** console.table-friendly dump. */
  logTable(header: string) {
    if (!this.enabled) return;
    const rows = this.report();
    const total = Math.round(this.totalMs());
    // eslint-disable-next-line no-console
    console.groupCollapsed(`%c[perf] ${header} — ${total}ms`, "color:#b8860b;font-weight:600");
    // eslint-disable-next-line no-console
    console.table(rows);
    // eslint-disable-next-line no-console
    console.groupEnd();
  }
}
