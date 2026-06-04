/**
 * OnPush Candidate Analyzer
 *
 * Domain-layer module. Analyzes component stats to determine which components
 * that use ChangeDetectionStrategy.Default could safely migrate to OnPush.
 *
 * No Angular imports. No DOM access. Pure computation over component data.
 */

import type { OnPushCandidate } from '../domain/entities';

export interface ComponentStatsForOnPush {
  id: string;
  name: string;
  selector: string;
  totalChecks: number;
  wastedChecks: number;
  totalDuration: number;
  cdStrategy: 'OnPush' | 'Default' | 'unknown';
  inputChangeCount: number; // how many checks had input changes
}

/**
 * Analyze a set of component stats and return components that are good
 * candidates for ChangeDetectionStrategy.OnPush migration.
 *
 * A component is a candidate when:
 * 1. It uses Default CD (or unknown)
 * 2. Its wasted render % exceeds the threshold
 * 3. It has been checked enough times to be statistically meaningful
 */
export function analyzeOnPushCandidates(
  components: ComponentStatsForOnPush[],
  wastedThresholdPct: number = 40,
  minChecks: number = 5
): OnPushCandidate[] {
  const candidates: OnPushCandidate[] = [];

  for (const comp of components) {
    // Skip already-OnPush components
    if (comp.cdStrategy === 'OnPush') continue;
    // Need enough data to be meaningful
    if (comp.totalChecks < minChecks) continue;

    const wastedPct = comp.totalChecks > 0
      ? Math.round((comp.wastedChecks / comp.totalChecks) * 100)
      : 0;

    if (wastedPct < wastedThresholdPct) continue;

    // Estimate savings: if OnPush, only renders when inputs change
    // So saving is approximately (wasted checks / total checks)
    const estimatedSavingPct = wastedPct;

    let confidence: 'high' | 'medium' | 'low';
    let reason: string;

    if (wastedPct >= 80) {
      confidence = 'high';
      reason = `${wastedPct}% of renders produced no DOM changes — component only needs to update when its @Input() props change.`;
    } else if (wastedPct >= 60) {
      confidence = 'medium';
      reason = `${wastedPct}% of renders were wasted no-ops. OnPush would significantly reduce unnecessary checks.`;
    } else {
      confidence = 'low';
      reason = `${wastedPct}% wasted renders detected. Review whether this component has internal side effects before switching to OnPush.`;
    }

    candidates.push({
      name: comp.name,
      selector: comp.selector,
      totalChecks: comp.totalChecks,
      wastedChecks: comp.wastedChecks,
      wastedPercentage: wastedPct,
      estimatedSavingPct,
      confidence,
      reason
    });
  }

  // Sort by estimated saving desc, then confidence desc
  return candidates.sort((a, b) => {
    const confScore = { high: 3, medium: 2, low: 1 };
    const byConf = confScore[b.confidence] - confScore[a.confidence];
    if (byConf !== 0) return byConf;
    return b.estimatedSavingPct - a.estimatedSavingPct;
  });
}
