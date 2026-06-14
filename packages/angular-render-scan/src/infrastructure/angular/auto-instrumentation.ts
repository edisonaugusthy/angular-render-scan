import {
  beginCycle,
  currentCycleId,
  endCycle,
  ensureCycleForComponentCheck,
  setActiveCheckingComponent,
  setActiveComputedSignal,
  recordSignalRead,
  recordSignalWrite
} from '../../application/runtime';
import { recordComponentCheck, registerComponent, unregisterComponent } from '../../application/stats';
import { checkReferentialStability } from '../../application/referential-stability';
import { getResolvedOptions } from '../../domain/options';
import type { AngularRenderChangedInput, AngularRenderScanRenderDetails } from '../../domain/entities';

const ProfilerEventTemplateUpdateStart = 2;
const ProfilerEventTemplateUpdateEnd = 3;

// How deep into a component's object graph we walk looking for nested signals.
const MAX_SIGNAL_PATCH_DEPTH = 3;

// Constructor names we must never recurse into. Walking these mutates / wraps
// Angular framework internals and corrupts them — e.g. reactive-forms controls
// and router URL trees, whose children are plain-object containers that Angular
// iterates with Object.keys(). See exclusions in the recursion branch below.
const FRAMEWORK_CTOR_EXCLUSIONS = [
  'ElementRef',
  'ViewContainerRef',
  'ChangeDetectorRef',
  'NgZone',
  'ApplicationRef',
  'Router',
  'ActivatedRoute',
  'UrlTree',
  'UrlSegment',
  'UrlSegmentGroup',
  'AbstractControl',
  'FormControl',
  'FormGroup',
  'FormArray',
  'FormRecord',
  'NgControl',
  'EventEmitter'
];

// Per-prop scan for the signal symbol. Must NOT be cached across props: a cached
// symbol would make us treat any later function-valued property as a signal.
function getSignalSymbol(obj: any): symbol | undefined {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return undefined;
  const sym = Reflect.ownKeys(obj).find(k => typeof k === 'symbol' && String(k).includes('SIGNAL'));
  return sym as symbol | undefined;
}

export function patchSignalsOnInstance(
  instance: any,
  compName: string,
  visited: WeakSet<object> = new WeakSet(),
  depth = 0
): void {
  if (!instance || typeof instance !== 'object') return;
  // Track visited objects in a side WeakSet instead of writing a marker onto the
  // instance. Writing an enumerable property pollutes Object.keys() of any object
  // we touch, which breaks Angular containers (form controls, URL segments).
  if (visited.has(instance)) return;
  visited.add(instance);

  const keys = Object.getOwnPropertyNames(instance);
  for (const key of keys) {
    let prop: any;
    try {
      prop = instance[key];
    } catch {
      continue;
    }
    if (!prop) continue;

    const sym = getSignalSymbol(prop);
    if (sym && typeof prop === 'function') {
      const internalNode = prop[sym];
      const debugName = internalNode?.debugName || `${compName}.${key}`;

      if (!prop.__angularRenderScanPatched) {
        const originalSignal = prop;
        
        const wrapped = function(this: any) {
          const kind = typeof originalSignal.set === 'function' ? 'signal' : 'computed';
          const previousComputed = (window as any).__angularActiveComputedSignalName || null;
          if (kind === 'computed') {
            (window as any).__angularActiveComputedSignalName = debugName;
            setActiveComputedSignal(debugName);
          }

          recordSignalRead(debugName, kind);

          try {
            return originalSignal.apply(this, arguments);
          } finally {
            if (kind === 'computed') {
              (window as any).__angularActiveComputedSignalName = previousComputed;
              setActiveComputedSignal(previousComputed);
            }
          }
        } as any;

        Object.defineProperty(wrapped, '__angularRenderScanPatched', {
          value: true,
          enumerable: false,
          configurable: true,
          writable: true
        });
        wrapped[sym] = internalNode;
        wrapped.toString = originalSignal.toString.bind(originalSignal);

        if (typeof originalSignal.set === 'function') {
          wrapped.set = function(val: any) {
            const curVal = internalNode?.value;
            const equal = internalNode?.equal || ((a: any, b: any) => a === b);
            const isWasted = equal(curVal, val);

            const err = new Error();
            const stack = err.stack ? err.stack.split('\n').slice(2) : [];
            const cleanStack = stack
              .map((f: any) => f.trim().replace(/^at\s+/, ''))
              .filter((f: any) => 
                !f.includes('angular-render-scan') && 
                !f.includes('zone.js') &&
                !f.includes('node_modules')
              );

            recordSignalWrite(debugName, 'set', cleanStack, isWasted);
            return originalSignal.set.apply(originalSignal, arguments);
          };
        }

        if (typeof originalSignal.update === 'function') {
          wrapped.update = function(fn: any) {
            const curVal = internalNode?.value;
            const newVal = fn(curVal);
            const equal = internalNode?.equal || ((a: any, b: any) => a === b);
            const isWasted = equal(curVal, newVal);

            const err = new Error();
            const stack = err.stack ? err.stack.split('\n').slice(2) : [];
            const cleanStack = stack
              .map((f: any) => f.trim().replace(/^at\s+/, ''))
              .filter((f: any) => 
                !f.includes('angular-render-scan') && 
                !f.includes('zone.js') &&
                !f.includes('node_modules')
              );

            recordSignalWrite(debugName, 'update', cleanStack, isWasted);
            return originalSignal.update.apply(originalSignal, arguments);
          };
        }

        if (typeof originalSignal.asReadonly === 'function') {
          wrapped.asReadonly = originalSignal.asReadonly.bind(originalSignal);
        }

        instance[key] = wrapped;
      }
    } else if (depth < MAX_SIGNAL_PATCH_DEPTH && typeof prop === 'object' && prop !== null && !Array.isArray(prop)) {
      // Only recurse into class instances that look like view models. Skip
      // framework internals and plain-object containers (constructor `Object`),
      // since those are the dictionaries Angular iterates with Object.keys().
      const ctorName = prop.constructor?.name;
      if (
        ctorName &&
        ctorName !== 'Object' &&
        !ctorName.startsWith('ɵ') &&
        !FRAMEWORK_CTOR_EXCLUSIONS.some(name => ctorName.startsWith(name)) &&
        !(prop instanceof HTMLElement) &&
        !(prop instanceof Date) &&
        !(prop instanceof RegExp) &&
        !(prop instanceof Map) &&
        !(prop instanceof Set)
      ) {
        patchSignalsOnInstance(prop, ctorName, visited, depth + 1);
      }
    }
  }
}

let nextAutoComponentId = 0;

interface AutoCompData {
  id: string;
  name: string;
  element: Element;
  signature: string;
  inputSnapshot: Map<string, string>;
  inputRefSnapshot: Map<string, unknown>;
  cdStrategy: 'OnPush' | 'Default' | 'unknown';
  parentId: string | null;
}

const instanceMap = new WeakMap<object, AutoCompData>();

// Stack frame during template update traversal
interface StackFrame {
  id: string;
  parentId: string | null;
  startTime: number;
  childrenDuration: number;
  details: AngularRenderScanRenderDetails;
}

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

function getInputNames(instance: object): Array<{ publicName: string; propertyName: string }> {
  const inputs = (instance as any)?.constructor?.ɵcmp?.inputs;
  if (!inputs || typeof inputs !== 'object') {
    return [];
  }

  return Object.entries(inputs).map(([publicName, metadata]) => {
    if (Array.isArray(metadata) && typeof metadata[0] === 'string') {
      return { publicName, propertyName: metadata[0] as string };
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
  if (Array.isArray(value)) return `Array(${(value as unknown[]).length})`;
  if (typeof value === 'function') return 'Function';
  if (typeof value === 'object') {
    const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
    return ctor && ctor !== 'Object' ? ctor : 'Object';
  }
  return typeof value;
}

/**
 * Read the ChangeDetectionStrategy from Angular component metadata.
 * 0 = OnPush, 2 = Default (Angular internal enum values)
 */
function readCdStrategy(instance: object): 'OnPush' | 'Default' | 'unknown' {
  const cmp = (instance as any)?.constructor?.ɵcmp;
  if (!cmp) return 'unknown';
  // changeDetection: 0 = OnPush, 2 = Default
  const cd = cmp.changeDetection;
  if (cd === 0) return 'OnPush';
  if (cd === 2) return 'Default';
  return 'unknown';
}

function detectInputChanges(
  instance: object,
  compData: AutoCompData,
  enableReferentialStability: boolean,
  referentialStabilityDepth: number
): AngularRenderChangedInput[] {
  const changes: AngularRenderChangedInput[] = [];
  for (const { publicName, propertyName } of getInputNames(instance)) {
    const rawValue = (instance as any)[propertyName];
    const current = summarizeValue(rawValue);
    const previous = compData.inputSnapshot.get(publicName);

    if (previous !== undefined && previous !== current) {
      let isReferentiallyUnstable = false;

      if (enableReferentialStability && rawValue !== null && typeof rawValue === 'object') {
        // Check referential stability: new reference, but same deep value?
        isReferentiallyUnstable = checkReferentialStability(
          compData.id,
          compData.name,
          compData.element.tagName.toLowerCase(),
          publicName,
          rawValue,
          referentialStabilityDepth
        );
      }

      changes.push({ name: publicName, previous, current, isReferentiallyUnstable });
    }

    compData.inputSnapshot.set(publicName, current);
    if (rawValue !== null && typeof rawValue === 'object') {
      compData.inputRefSnapshot.set(publicName, rawValue);
    }
  }

  return changes.slice(0, 6);
}

export function setupAutoInstrumentation(): void {
  let attempts = 0;

  const trySetup = () => {
    const globalNg = (window as any).ng;
    if (!globalNg || !globalNg.ɵsetProfiler || !globalNg.getHostElement) {
      if (attempts++ < 50) {
        setTimeout(trySetup, 100);
      }
      return;
    }

    const componentCheckStack: StackFrame[] = [];

    globalNg.ɵsetProfiler((event: number, instance: object) => {
      if (!instance) return;

      const options = getResolvedOptions();

      if (event === ProfilerEventTemplateUpdateStart) {
        ensureCycleForComponentCheck();

        let compData = instanceMap.get(instance);
        if (!compData) {
          try {
            const element = globalNg.getHostElement(instance);
            if (element && element instanceof Element && !element.hasAttribute('angularRenderScanMark')) {
              const name = (instance as any).constructor?.name || 'AnonymousComponent';
              const id = `ng-scan-auto-${++nextAutoComponentId}`;
              const cdStrategy = readCdStrategy(instance);

              // Determine parent from stack
              const parentId = componentCheckStack.length > 0
                ? componentCheckStack[componentCheckStack.length - 1].id
                : null;

              compData = {
                id,
                name,
                element,
                signature: '',
                inputSnapshot: new Map(),
                inputRefSnapshot: new Map(),
                cdStrategy,
                parentId
              };
              instanceMap.set(instance, compData);
              registerComponent({
                ...compData,
                selector: element.tagName.toLowerCase(),
                cdStrategy,
                parentId
              });
            } else {
              instanceMap.set(instance, {
                id: '',
                name: '',
                element: null as any,
                signature: '',
                inputSnapshot: new Map(),
                inputRefSnapshot: new Map(),
                cdStrategy: 'unknown',
                parentId: null
              });
            }
          } catch {
            instanceMap.set(instance, {
              id: '',
              name: '',
              element: null as any,
              signature: '',
              inputSnapshot: new Map(),
              inputRefSnapshot: new Map(),
              cdStrategy: 'unknown',
              parentId: null
            });
          }
        }

        if (compData && compData.element) {
          patchSignalsOnInstance(instance, compData.name);
          setActiveCheckingComponent(compData.id, compData.name);

          const changedInputs = detectInputChanges(
            instance,
            compData,
            options.trackReferentialStability,
            options.referentialStabilityDepth
          );

          const parentId = componentCheckStack.length > 0
            ? componentCheckStack[componentCheckStack.length - 1].id
            : compData.parentId;

          componentCheckStack.push({
            id: compData.id,
            parentId,
            startTime: performance.now(),
            childrenDuration: 0,
            details: {
              reason: changedInputs.length > 0 ? 'input' : 'unknown',
              changedInputs,
              parentId
            }
          });
        }
      } else if (event === ProfilerEventTemplateUpdateEnd) {
        const compData = instanceMap.get(instance);
        if (compData && compData.element && componentCheckStack.length > 0) {
          const depth = componentCheckStack.length;
          const frame = componentCheckStack.pop()!;
          if (frame.id === compData.id) {
            const cycleId = currentCycleId();
            if (cycleId) {
              const totalDuration = performance.now() - frame.startTime;
              const selfDuration = Math.max(0, totalDuration - frame.childrenDuration);

              // Propagate duration to parent
              if (componentCheckStack.length > 0) {
                componentCheckStack[componentCheckStack.length - 1].childrenDuration += totalDuration;
              }

              // Check if actual DOM mutation occurred
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
                  mutationType: isWasted ? 'none' : undefined,
                  parentId: frame.parentId
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
            // Stack mismatch — recover
            componentCheckStack.length = 0;
          }
          setActiveCheckingComponent(null, null);
        }
      }
    });
  };

  trySetup();
}
