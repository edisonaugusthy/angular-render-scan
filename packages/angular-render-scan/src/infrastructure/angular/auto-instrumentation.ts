import { beginCycle, currentCycleId, endCycle, ensureCycleForComponentCheck } from '../../application/runtime';
import { recordComponentCheck, registerComponent, unregisterComponent } from '../../application/stats';
import type { AngularRenderChangedInput, AngularRenderScanRenderDetails } from '../../domain/entities';

const ProfilerEventTemplateUpdateStart = 2;
const ProfilerEventTemplateUpdateEnd = 3;

let nextAutoComponentId = 0;
const instanceMap = new WeakMap<any, { id: string, name: string, element: Element, signature: string, inputSnapshot: Map<string, string> }>();

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function getRenderedSignature(element: Element): string {
  const rect = element.getBoundingClientRect();
  return [
    normalizeText(element.textContent ?? ''),
    Math.round(rect.left),
    Math.round(rect.top),
    Math.round(rect.width),
    Math.round(rect.height),
    element.childElementCount
  ].join('|');
}

function getInputNames(instance: any): Array<{ publicName: string; propertyName: string }> {
  const inputs = instance?.constructor?.ɵcmp?.inputs;
  if (!inputs || typeof inputs !== 'object') {
    return [];
  }

  return Object.entries(inputs).map(([publicName, metadata]) => {
    if (Array.isArray(metadata) && typeof metadata[0] === 'string') {
      return { publicName, propertyName: metadata[0] };
    }
    if (typeof metadata === 'string') {
      return { publicName, propertyName: metadata };
    }
    return { publicName, propertyName: publicName };
  });
}

function summarizeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value.length > 80 ? `${value.slice(0, 77)}...` : value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'function') return 'Function';
  if (typeof value === 'object') {
    const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
    return ctor && ctor !== 'Object' ? ctor : 'Object';
  }
  return typeof value;
}

function detectInputChanges(instance: any, snapshot: Map<string, string>): AngularRenderChangedInput[] {
  const changes: AngularRenderChangedInput[] = [];
  for (const { publicName, propertyName } of getInputNames(instance)) {
    const current = summarizeValue(instance[propertyName]);
    const previous = snapshot.get(publicName);
    if (previous !== undefined && previous !== current) {
      changes.push({ name: publicName, previous, current });
    }
    snapshot.set(publicName, current);
  }

  return changes.slice(0, 6);
}

export function setupAutoInstrumentation(): void {
  let attempts = 0;

  const trySetup = () => {
    const globalNg = (window as any).ng;
    if (!globalNg || !globalNg.ɵsetProfiler || !globalNg.getHostElement) {
      if (attempts++ < 50) { // Retry for up to 5 seconds
        setTimeout(trySetup, 100);
      }
      return;
    }

    const componentCheckStack: { id: string, startTime: number, childrenDuration: number, details: AngularRenderScanRenderDetails }[] = [];

    globalNg.ɵsetProfiler((event: number, instance: any) => {
      if (!instance) return;

      if (event === ProfilerEventTemplateUpdateStart) {
        ensureCycleForComponentCheck();
        
        let compData = instanceMap.get(instance);
        if (!compData) {
          try {
            const element = globalNg.getHostElement(instance);
            if (element && element instanceof Element && !element.hasAttribute('angularRenderScanMark')) {
              const name = instance.constructor?.name || 'AnonymousComponent';
              const id = `ng-scan-auto-${++nextAutoComponentId}`;
              compData = { id, name, element, signature: '', inputSnapshot: new Map() };
              instanceMap.set(instance, compData);
              registerComponent({ ...compData, selector: element.tagName.toLowerCase() });
            } else {
               // Null object to prevent retrying or processing tracked elements
               instanceMap.set(instance, { id: '', name: '', element: null as any, signature: '', inputSnapshot: new Map() });
            }
          } catch (e) {
            instanceMap.set(instance, { id: '', name: '', element: null as any, signature: '', inputSnapshot: new Map() });
          }
        }

        if (compData && compData.element) {
          const changedInputs = detectInputChanges(instance, compData.inputSnapshot);
          componentCheckStack.push({
            id: compData.id,
            startTime: performance.now(),
            childrenDuration: 0,
            details: {
              reason: changedInputs.length > 0 ? 'input' : 'unknown',
              changedInputs
            }
          });
        }
      } else if (event === ProfilerEventTemplateUpdateEnd) {
        let compData = instanceMap.get(instance);
        if (compData && compData.element && componentCheckStack.length > 0) {
          const depth = componentCheckStack.length;
          const frame = componentCheckStack.pop()!;
          if (frame.id === compData.id) {
            const cycleId = currentCycleId();
            if (cycleId) {
              const totalDuration = performance.now() - frame.startTime;
              const selfDuration = Math.max(0, totalDuration - frame.childrenDuration);

              // Add our total duration to the parent's childrenDuration
              if (componentCheckStack.length > 0) {
                componentCheckStack[componentCheckStack.length - 1].childrenDuration += totalDuration;
              }

              // Check if actual DOM mutation occurred to prevent full-screen flashing
              const nextSignature = getRenderedSignature(compData.element);
              const signatureChanged = compData.signature !== nextSignature;
              const isWasted = !signatureChanged && frame.details.reason !== 'input';

              if (signatureChanged) {
                compData.signature = nextSignature;
              }

              const entry = recordComponentCheck(
                frame.id,
                selfDuration,
                cycleId,
                {
                  reason: frame.details.reason === 'input' ? 'input' : signatureChanged ? 'dom' : 'unknown',
                  changedInputs: frame.details.changedInputs,
                  mutationType: isWasted ? 'none' : undefined
                },
                {
                  startTime: frame.startTime,
                  totalDuration,
                  depth
                }
              );
              if (entry) {
                window.dispatchEvent(new CustomEvent('angular-render-scan:render', { detail: entry }));
              }
            }
          } else {
            // Stack mismatch, try to recover by pushing it back or clearing
            componentCheckStack.length = 0;
          }
        }
      }
    });
  };

  trySetup();
}
