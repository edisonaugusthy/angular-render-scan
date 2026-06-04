/**
 * Zone.js Task Tracker
 *
 * Hooks into Zone.js task scheduling to attribute what triggered each
 * Angular change-detection cycle. Works by wrapping zone task lifecycle
 * callbacks (onScheduleTask / onInvokeTask) to record the "last active task"
 * right before ApplicationRef.tick() fires.
 *
 * IMPORTANT: This file contains NO Angular imports. It only touches Zone.js
 * globals and the browser runtime, so it can be used from the infrastructure
 * layer without creating circular dependencies.
 */

import type { CdTriggerAttribution, CdTriggerSource } from '../../domain/entities';

interface ZoneTaskSnapshot {
  source: CdTriggerSource;
  detail?: string;
  callSite?: string;
  isUserInteraction: boolean;
}

// The most recently executed Zone task before tick() fired
let lastTaskSnapshot: ZoneTaskSnapshot | null = null;
// True while a user event is actively being processed
let activeUserEventSource: CdTriggerSource | null = null;
// Whether a signal write occurred in the current microtask queue
let signalWriteDetected = false;
// Whether a router navigation is in progress
let routerNavigationInProgress = false;
// Whether markForCheck / detectChanges was called explicitly
let manualCdCallSite: string | null = null;

// ─── Public write-side API (called from auto-instrumentation / angular.ts) ───

export function notifySignalWrite(): void {
  signalWriteDetected = true;
}

export function notifyRouterNavigation(): void {
  routerNavigationInProgress = true;
}

export function notifyManualCd(type: 'markForCheck' | 'detectChanges', callSite?: string): void {
  manualCdCallSite = callSite ?? type;
}

// ─── Attribution resolution (called at the start of each cycle) ──────────────

export function resolveTriggerAttribution(): CdTriggerAttribution {
  let source: CdTriggerSource = 'unknown';
  let detail: string | undefined;
  let callSite: string | undefined;
  let isUserInteraction = false;

  if (manualCdCallSite !== null) {
    source = manualCdCallSite.startsWith('detectChanges') ? 'manual:detectChanges' : 'manual:markForCheck';
    callSite = manualCdCallSite;
  } else if (signalWriteDetected) {
    source = 'signal:write';
    isUserInteraction = activeUserEventSource !== null;
  } else if (routerNavigationInProgress) {
    source = 'router:navigation';
  } else if (activeUserEventSource !== null) {
    source = activeUserEventSource;
    isUserInteraction = true;
  } else if (lastTaskSnapshot !== null) {
    source = lastTaskSnapshot.source;
    detail = lastTaskSnapshot.detail;
    callSite = lastTaskSnapshot.callSite;
    isUserInteraction = lastTaskSnapshot.isUserInteraction;
  } else {
    source = 'unknown';
  }

  const isZonePollution =
    !isUserInteraction &&
    source !== 'signal:write' &&
    source !== 'router:navigation' &&
    source !== 'manual:markForCheck' &&
    source !== 'manual:detectChanges' &&
    source !== 'unknown';

  return { source, detail, callSite, isUserInteraction, isZonePollution };
}

/** Reset per-cycle state after attribution is collected */
export function resetCycleTriggerState(): void {
  lastTaskSnapshot = null;
  signalWriteDetected = false;
  routerNavigationInProgress = false;
  manualCdCallSite = null;
  // Note: activeUserEventSource is reset by the DOM event listener
}

// ─── Zone.js hook installation ────────────────────────────────────────────────

const USER_EVENTS = new Set(['click', 'mousedown', 'mouseup', 'keydown', 'keyup', 'keypress', 'input', 'change', 'submit', 'focus', 'blur', 'scroll', 'touchstart', 'touchend', 'pointerdown', 'pointerup']);

function mapEventToSource(eventType: string): CdTriggerSource {
  switch (eventType) {
    case 'click': return 'zone:click';
    case 'input': return 'zone:input';
    case 'keydown': return 'zone:keydown';
    case 'keyup': return 'zone:keyup';
    case 'submit': return 'zone:submit';
    case 'change': return 'zone:change';
    case 'focus': return 'zone:focus';
    case 'blur': return 'zone:blur';
    case 'scroll': return 'zone:scroll';
    default: return 'zone:eventTask';
  }
}

function extractCallSite(error?: Error): string | undefined {
  if (!error?.stack) return undefined;
  // Grab first non-internal frame
  const frames = error.stack.split('\n').slice(2);
  const frame = frames.find(f =>
    !f.includes('zone-tracker') &&
    !f.includes('zone.js') &&
    !f.includes('zone-evergreen') &&
    f.trim().length > 0
  );
  return frame?.trim().replace(/^at\s+/, '').slice(0, 120);
}

// Use `any` for Zone.js globals since we don't want to add zone.js as a type dep
declare const Zone: any;

let zoneHookInstalled = false;

export function installZoneHook(): void {
  if (zoneHookInstalled) return;
  if (typeof Zone === 'undefined') return;

  // Track user DOM events to know the "active event context"
  const trackEvent = (e: Event) => {
    activeUserEventSource = mapEventToSource(e.type);
    // Reset after the event has fully propagated + microtasks settled
    Promise.resolve().then(() => {
      setTimeout(() => { activeUserEventSource = null; }, 0);
    });
  };

  for (const evType of USER_EVENTS) {
    document.addEventListener(evType, trackEvent, { capture: true, passive: true });
  }

  // Hook into Zone.js task scheduling via Zone.current.fork
  const spec = {
    name: 'angular-render-scan',
    onScheduleTask(delegate: any, current: any, target: any, task: any) {
      return delegate.scheduleTask(target, task);
    },
    onInvokeTask(delegate: any, current: any, target: any, task: any, applyThis: any, applyArgs: any) {
      // Record what task is being invoked just before it runs
      const taskType: string = task.type;
      const taskSource: string | undefined = task.source;

      if (taskType === 'eventTask') {
        const eventSource = taskSource ?? '';
        // e.g. "HTMLButtonElement.click" → extract event name
        const match = eventSource.match(/\.(\w+)$/);
        const eventType = match ? match[1] : eventSource;
        lastTaskSnapshot = {
          source: mapEventToSource(eventType),
          detail: eventSource,
          isUserInteraction: USER_EVENTS.has(eventType)
        };
      } else if (taskType === 'macroTask') {
        if (taskSource?.includes('setTimeout')) {
          lastTaskSnapshot = { source: 'zone:setTimeout', isUserInteraction: false };
        } else if (taskSource?.includes('setInterval')) {
          lastTaskSnapshot = { source: 'zone:setInterval', isUserInteraction: false };
        } else if (taskSource?.includes('XMLHttpRequest')) {
          const xhrUrl = task.data?.url as string | undefined;
          lastTaskSnapshot = { source: 'zone:xhr', detail: xhrUrl ? xhrUrl.slice(0, 80) : undefined, isUserInteraction: false };
        } else if (taskSource?.includes('fetch')) {
          const fetchUrl = task.data?.args?.[0];
          const urlStr = typeof fetchUrl === 'string' ? fetchUrl.slice(0, 80) : undefined;
          lastTaskSnapshot = { source: 'zone:fetch', detail: urlStr, isUserInteraction: false };
        } else {
          lastTaskSnapshot = { source: 'zone:macrotask', detail: taskSource?.slice(0, 80), isUserInteraction: false };
        }
      } else if (taskType === 'microTask') {
        lastTaskSnapshot = { source: 'zone:microtask', detail: taskSource?.slice(0, 80), isUserInteraction: false };
      }

      return delegate.invokeTask(target, task, applyThis, applyArgs);
    }
  };

  try {
    Zone.current.fork(spec);
    zoneHookInstalled = true;
  } catch {
    // Zone.js not available or already fully patched — silently skip
  }
}

export function resetZoneTracker(): void {
  zoneHookInstalled = false;
  lastTaskSnapshot = null;
  activeUserEventSource = null;
  signalWriteDetected = false;
  routerNavigationInProgress = false;
  manualCdCallSite = null;
}
