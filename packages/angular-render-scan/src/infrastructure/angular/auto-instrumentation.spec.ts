import { describe, expect, it } from 'vitest';
import { patchSignalsOnInstance } from './auto-instrumentation';

// A minimal stand-in for an Angular signal: a callable with a [SIGNAL] symbol
// node plus set/update/asReadonly, matching what the instrumentation detects.
const SIGNAL = Symbol('SIGNAL');
function makeSignal<T>(initial: T) {
  const node = { value: initial, equal: (a: T, b: T) => a === b, debugName: undefined };
  const fn: any = function () {
    return node.value;
  };
  fn[SIGNAL] = node;
  fn.set = (v: T) => {
    node.value = v;
  };
  fn.update = (f: (v: T) => T) => {
    node.value = f(node.value);
  };
  fn.asReadonly = () => fn;
  return fn;
}

// Stand-ins that mirror the real framework shapes from the bug reports: a
// reactive-forms control tree and a router URL segment tree, both of which keep
// their children in plain-object dictionaries that the framework walks with
// Object.keys(). The original instrumentation injected an enumerable marker into
// those dictionaries, so iteration picked up a `true` and called methods on it.
class AbstractControl {
  _updateTreeValidity(): void {
    /* no-op */
  }
}
class FormControl extends AbstractControl {}
class FormGroup extends AbstractControl {
  controls: Record<string, AbstractControl>;
  constructor() {
    super();
    this.controls = { name: new FormControl(), email: new FormControl() };
  }
  _forEachChild(cb: (c: AbstractControl) => void): void {
    Object.keys(this.controls).forEach(k => cb(this.controls[k]));
  }
  override _updateTreeValidity(): void {
    this._forEachChild(ctrl => ctrl._updateTreeValidity());
  }
}

class UrlSegmentGroup {
  children: Record<string, UrlSegmentGroup> = {};
  hasChildren(): boolean {
    return Object.keys(this.children).length > 0;
  }
}

describe('patchSignalsOnInstance', () => {
  it('does not corrupt reactive-forms control trees', () => {
    const form = new FormGroup();
    const component = { name: 'FormComponent', form };

    patchSignalsOnInstance(component, 'FormComponent');

    // The controls dictionary must not gain an injected enumerable key...
    expect(Object.keys(form.controls)).toEqual(['name', 'email']);
    // ...so framework iteration over it stays valid (this threw the original
    // "ctrl._updateTreeValidity is not a function").
    expect(() => form._updateTreeValidity()).not.toThrow();
  });

  it('does not corrupt router URL segment trees', () => {
    const root = new UrlSegmentGroup();
    root.children = { primary: new UrlSegmentGroup() };
    const component = { name: 'NavComponent', tree: root };

    patchSignalsOnInstance(component, 'NavComponent');

    expect(Object.keys(root.children)).toEqual(['primary']);
    // The original bug surfaced as "segment.hasChildren is not a function" when
    // serializing children — emulate that walk.
    expect(() =>
      Object.keys(root.children).forEach(k => root.children[k].hasChildren())
    ).not.toThrow();
  });

  it('never writes enumerable markers onto any walked object', () => {
    class ViewModel {
      nested = { deep: { leaf: 1 } };
    }
    const component = { name: 'C', vm: new ViewModel() };

    patchSignalsOnInstance(component, 'C');

    const polluted = (obj: object): boolean =>
      Object.keys(obj).some(k => k.includes('angularRenderScan'));
    expect(polluted(component)).toBe(false);
    expect(polluted(component.vm)).toBe(false);
    expect(polluted(component.vm.nested)).toBe(false);
  });

  it('wraps real signals but leaves plain methods untouched', () => {
    const realSignal = makeSignal(1);
    const plainMethod = function () {
      return 'hello';
    };
    const component: any = {
      name: 'C',
      count: realSignal,
      doThing: plainMethod
    };

    patchSignalsOnInstance(component, 'C');

    // Real signal is wrapped (new function) but still reads through and is settable.
    expect(component.count).not.toBe(realSignal);
    expect(component.count()).toBe(1);
    component.count.set(5);
    expect(component.count()).toBe(5);

    // The cache-bug regression: a plain function property next to a signal must
    // NOT be wrapped as a fake signal — identity is preserved.
    expect(component.doThing).toBe(plainMethod);
  });

  it('is safe against cyclic object graphs', () => {
    const a: any = { name: 'A' };
    const b: any = { name: 'B', a };
    a.b = b;
    const component = { name: 'C', a };

    expect(() => patchSignalsOnInstance(component, 'C')).not.toThrow();
  });
});
