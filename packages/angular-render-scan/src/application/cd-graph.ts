/**
 * Change Detection Graph Builder
 *
 * Builds a snapshot graph of the component tree showing how CD flows through
 * the application. Each node is a component, each edge is a parent→child
 * render relationship.
 *
 * Domain layer — no Angular imports, no DOM access.
 */

import type { CdGraph, CdGraphEdge, CdGraphNode, CdTriggerSource } from '../domain/entities';

export interface ComponentGraphData {
  id: string;
  name: string;
  selector: string;
  parentId: string | null;
  depth: number;
  renderCount: number;
  totalDuration: number;
  wastedChecks: number;
  totalChecks: number;
  cdStrategy: 'OnPush' | 'Default' | 'unknown';
  isOnPushCandidate: boolean;
  lastTrigger?: CdTriggerSource;
}

// Parent→child trigger counts across the session
const edgeTriggerCounts = new Map<string, number>();

export function recordParentChildRender(parentId: string, childId: string): void {
  const key = `${parentId}→${childId}`;
  edgeTriggerCounts.set(key, (edgeTriggerCounts.get(key) ?? 0) + 1);
}

export function buildCdGraph(components: ComponentGraphData[]): CdGraph {
  const nodes: CdGraphNode[] = components.map(c => ({
    id: c.id,
    name: c.name,
    selector: c.selector,
    parentId: c.parentId,
    depth: c.depth,
    renderCount: c.renderCount,
    totalDuration: c.totalDuration,
    wastedChecks: c.wastedChecks,
    cdStrategy: c.cdStrategy,
    isOnPushCandidate: c.isOnPushCandidate,
    lastTrigger: c.lastTrigger
  }));

  const edges: CdGraphEdge[] = [];
  for (const [key, count] of edgeTriggerCounts.entries()) {
    const [fromId, toId] = key.split('→');
    if (fromId && toId) {
      edges.push({ fromId, toId, triggerCount: count });
    }
  }

  return {
    nodes,
    edges,
    capturedAt: performance.now()
  };
}

export function resetCdGraph(): void {
  edgeTriggerCounts.clear();
}
