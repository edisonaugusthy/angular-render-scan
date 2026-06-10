import { afterEach, describe, expect, it } from "vitest";
import { getAngularDebugSummary } from "./angular-debug";

class DemoComponent {}
class OwnerComponent {}
class DemoDirective {}
class RootComponent {}

describe("getAngularDebugSummary", () => {
  afterEach(() => {
    delete (window as Window & { ng?: unknown }).ng;
    document.body.replaceChildren();
  });

  it("falls back when Angular debug globals are unavailable", () => {
    const element = document.createElement("app-demo");

    expect(getAngularDebugSummary(element)).toEqual({
      available: false,
      directiveNames: [],
      listenerNames: [],
    });
  });

  it("reads Angular version from ng-version in the DOM", () => {
    const host = document.createElement("app-root");
    host.setAttribute("ng-version", "19.2.4");
    const element = document.createElement("app-demo");
    host.append(element);
    document.body.append(host);

    expect(getAngularDebugSummary(element)).toEqual({
      available: false,
      version: "19.2.4",
      directiveNames: [],
      listenerNames: [],
    });
  });

  it("returns sanitized Angular debug data", () => {
    const host = document.createElement("app-root");
    host.setAttribute("ng-version", "20.1.2");
    const element = document.createElement("app-demo");
    host.append(element);
    document.body.append(host);
    (window as Window & { ng?: unknown }).ng = {
      getComponent: () => new DemoComponent(),
      getOwningComponent: () => new OwnerComponent(),
      getDirectives: () => [new DemoDirective()],
      getListeners: () => [
        { name: "click", callback: () => undefined },
        { name: "valueChange", type: "output" },
      ],
      getRootComponents: () => [new RootComponent()],
    };

    expect(getAngularDebugSummary(element)).toEqual({
      available: true,
      version: "20.1.2",
      componentName: "DemoComponent",
      ownerName: "OwnerComponent",
      directiveNames: ["DemoDirective"],
      listenerNames: ["click", "valueChange"],
      rootName: "RootComponent",
    });
  });
});
