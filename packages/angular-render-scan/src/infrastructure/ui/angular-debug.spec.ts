import { afterEach, describe, expect, it } from "vitest";
import { getAngularDebugSummary } from "./angular-debug";

class DemoComponent {}
class OwnerComponent {}
class DemoDirective {}
class RootComponent {}

describe("getAngularDebugSummary", () => {
  afterEach(() => {
    delete (window as Window & { ng?: unknown }).ng;
  });

  it("falls back when Angular debug globals are unavailable", () => {
    const element = document.createElement("app-demo");

    expect(getAngularDebugSummary(element)).toEqual({
      available: false,
      directiveNames: [],
      listenerNames: [],
    });
  });

  it("returns sanitized Angular debug data", () => {
    const element = document.createElement("app-demo");
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
      componentName: "DemoComponent",
      ownerName: "OwnerComponent",
      directiveNames: ["DemoDirective"],
      listenerNames: ["click", "valueChange"],
      rootName: "RootComponent",
    });
  });
});
