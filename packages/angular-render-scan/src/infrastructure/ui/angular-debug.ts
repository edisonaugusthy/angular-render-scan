export interface AngularDebugSummary {
  available: boolean;
  version?: string;
  componentName?: string;
  ownerName?: string;
  directiveNames: string[];
  listenerNames: string[];
  rootName?: string;
}

type AngularDebugGlobals = {
  getComponent?: (element: Element) => unknown;
  getOwningComponent?: (elementOrDir: Element | object) => unknown;
  getDirectives?: (node: Node) => unknown[];
  getListeners?: (element: Element) => Array<{ name?: string; type?: string }>;
  getRootComponents?: (elementOrDir: Element | object) => unknown[];
};

export function getAngularDebugSummary(element: Element): AngularDebugSummary {
  const version = versionFromDom(element);
  const ng = getAngularGlobals();
  if (!ng) {
    return {
      available: false,
      version,
      directiveNames: [],
      listenerNames: [],
    };
  }

  const component = safeCall(() => ng.getComponent?.(element));
  const owner = safeCall(() => ng.getOwningComponent?.(element));
  const directives = safeCall(() => ng.getDirectives?.(element)) ?? [];
  const listeners = safeCall(() => ng.getListeners?.(element)) ?? [];
  const roots = safeCall(() => ng.getRootComponents?.(element)) ?? [];

  return {
    available: true,
    version,
    componentName: nameOf(component),
    ownerName: nameOf(owner),
    directiveNames: directives.map(nameOf).filter(isPresent),
    listenerNames: listeners
      .map((listener) => listener.name || listener.type)
      .filter(isPresent),
    rootName: nameOf(roots[0]),
  };
}

function getAngularGlobals(): AngularDebugGlobals | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const ng = (window as Window & { ng?: AngularDebugGlobals }).ng;
  if (!ng || typeof ng !== "object") {
    return undefined;
  }

  return ng;
}

function versionFromDom(element: Element): string | undefined {
  return (
    element.closest("[ng-version]")?.getAttribute("ng-version") ||
    document.querySelector("[ng-version]")?.getAttribute("ng-version") ||
    undefined
  );
}

function safeCall<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

function nameOf(value: unknown): string | undefined {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return undefined;
  }

  const candidate = value as { constructor?: { name?: string }; name?: string };
  return candidate.constructor?.name || candidate.name;
}

function isPresent(value: string | undefined): value is string {
  return Boolean(value);
}
