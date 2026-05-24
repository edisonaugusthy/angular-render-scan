import { beginCycle, currentCycleId, endCycle, ensureCycleForComponentCheck } from '../../application/runtime';
import { recordComponentCheck, registerComponent, unregisterComponent } from '../../application/stats';

const ProfilerEventTemplateUpdateStart = 2;
const ProfilerEventTemplateUpdateEnd = 3;

let nextAutoComponentId = 0;
const instanceMap = new WeakMap<any, { id: string, name: string, element: Element, signature: string }>();

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

    const componentCheckStack: { id: string, startTime: number, childrenDuration: number }[] = [];

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
              compData = { id, name, element, signature: '' };
              instanceMap.set(instance, compData);
              registerComponent(compData);
            } else {
               // Null object to prevent retrying or processing tracked elements
               instanceMap.set(instance, { id: '', name: '', element: null as any, signature: '' });
            }
          } catch (e) {
            instanceMap.set(instance, { id: '', name: '', element: null as any, signature: '' });
          }
        }

        if (compData && compData.element) {
          componentCheckStack.push({
            id: compData.id,
            startTime: performance.now(),
            childrenDuration: 0
          });
        }
      } else if (event === ProfilerEventTemplateUpdateEnd) {
        let compData = instanceMap.get(instance);
        if (compData && compData.element && componentCheckStack.length > 0) {
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
              if (compData.signature !== nextSignature) {
                compData.signature = nextSignature;
                const entry = recordComponentCheck(frame.id, selfDuration, cycleId);
                if (entry) {
                  window.dispatchEvent(new CustomEvent('angular-render-scan:render', { detail: entry }));
                }
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
