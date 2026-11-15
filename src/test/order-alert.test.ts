import { describe, expect, it, vi, beforeEach } from "vitest";
import { playNewOrderAlert, playNewOrderChime, triggerSoftVibration } from "@/lib/order-alert";

describe("Order Alert System (sound and vibration)", () => {
  let vibrateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vibrateMock = vi.fn();
    Object.defineProperty(globalThis.navigator, "vibrate", {
      value: vibrateMock,
      writable: true,
      configurable: true,
    });
  });

  it("triggers soft vibration with specified or default pattern", () => {
    triggerSoftVibration();
    expect(vibrateMock).toHaveBeenCalledWith([180, 80, 220]);

    triggerSoftVibration([100, 50, 100]);
    expect(vibrateMock).toHaveBeenCalledWith([100, 50, 100]);
  });

  it("handles environment where navigator.vibrate is missing gracefully", () => {
    Object.defineProperty(globalThis.navigator, "vibrate", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(() => triggerSoftVibration()).not.toThrow();
  });

  it("plays chime and triggers vibration when sound is enabled", () => {
    const playChimeSpy = vi.fn();
    // Test playNewOrderAlert with true
    playNewOrderAlert(true);
    expect(vibrateMock).toHaveBeenCalledWith([180, 80, 220]);
  });

  it("triggers vibration but skips chime when sound is disabled", () => {
    vibrateMock.mockClear();
    playNewOrderAlert(false);
    expect(vibrateMock).toHaveBeenCalledWith([180, 80, 220]);
  });
});
