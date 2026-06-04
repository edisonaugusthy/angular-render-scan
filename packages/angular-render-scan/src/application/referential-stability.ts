/**
 * Referential Input Stability Tracker
 *
 * Detects when an @Input() receives a new object reference but the value
 * is deeply equal to the previous one. This is the #1 cause of unexpected
 * re-renders on OnPush components and a very common Angular performance bug.
 *
 * Domain layer — no Angular imports, no DOM access.
 */

import type { ReferentialInstabilityReport } from '../domain/entities';

interface InputStabilityEntry {
  componentName: string;
  selector: string;
  inputName: string;
  /** Last serialized value for deep equality */
  lastSerialized: string;
  /** Last raw reference (for reference comparison) */
  lastRef: unknown;
  /** Times reference changed but value was equal */
  unstableRefCount: number;
  /** Total times we saw a changed input reference */
  totalChangedRefCount: number;
}

// Map: `${componentId}:${inputName}` → entry
const stabilityMap = new Map<string, InputStabilityEntry>();

/**
 * Serialize a value for deep equality comparison.
 * Uses JSON.stringify with a depth guard — not perfect but fast and
 * safe for the vast majority of Angular @Input() values.
 */
function serializeDeep(value: unknown, maxDepth: number, currentDepth = 0): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value !== 'object' && typeof value !== 'function') return String(value);
  if (typeof value === 'function') return 'Function';
  if (currentDepth >= maxDepth) return Array.isArray(value) ? `Array(${(value as unknown[]).length})` : 'Object';

  try {
    if (Array.isArray(value)) {
      const items = (value as unknown[]).slice(0, 20).map(v => serializeDeep(v, maxDepth, currentDepth + 1));
      return `[${items.join(',')}]`;
    }

    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).slice(0, 20).sort();
    const pairs = keys.map(k => `${k}:${serializeDeep(obj[k], maxDepth, currentDepth + 1)}`);
    return `{${pairs.join(',')}}`;
  } catch {
    return 'Object';
  }
}

/**
 * Called during auto-instrumentation when an input changes reference.
 * Returns true if the new value is referentially unstable (same deep value, new ref).
 */
export function checkReferentialStability(
  componentId: string,
  componentName: string,
  selector: string,
  inputName: string,
  newRef: unknown,
  maxDepth: number = 4
): boolean {
  // Only objects/arrays can be referentially unstable
  if (newRef === null || typeof newRef !== 'object') return false;

  const key = `${componentId}:${inputName}`;
  const entry = stabilityMap.get(key);

  const newSerialized = serializeDeep(newRef, maxDepth);

  if (!entry) {
    stabilityMap.set(key, {
      componentName,
      selector,
      inputName,
      lastSerialized: newSerialized,
      lastRef: newRef,
      unstableRefCount: 0,
      totalChangedRefCount: 1
    });
    return false;
  }

  // Reference changed (we're only called when reference changed)
  entry.totalChangedRefCount++;

  const isUnstable = entry.lastRef !== newRef && entry.lastSerialized === newSerialized;

  if (isUnstable) {
    entry.unstableRefCount++;
  }

  entry.lastSerialized = newSerialized;
  entry.lastRef = newRef;

  return isUnstable;
}

export function getReferentialInstabilityReports(minUnstableRefs = 1): ReferentialInstabilityReport[] {
  const reports: ReferentialInstabilityReport[] = [];
  for (const entry of stabilityMap.values()) {
    if (entry.unstableRefCount < minUnstableRefs) continue;
    const unstableRefPct = entry.totalChangedRefCount > 0
      ? Math.round((entry.unstableRefCount / entry.totalChangedRefCount) * 100)
      : 0;
    reports.push({
      componentName: entry.componentName,
      selector: entry.selector,
      inputName: entry.inputName,
      unstableRefCount: entry.unstableRefCount,
      totalRenders: entry.totalChangedRefCount,
      unstableRefPct,
      lastValue: entry.lastSerialized.slice(0, 120)
    });
  }
  return reports.sort((a, b) => b.unstableRefCount - a.unstableRefCount);
}

export function resetReferentialStability(): void {
  stabilityMap.clear();
}

export function clearReferentialStabilityStats(): void {
  for (const entry of stabilityMap.values()) {
    entry.unstableRefCount = 0;
    entry.totalChangedRefCount = 0;
  }
}
