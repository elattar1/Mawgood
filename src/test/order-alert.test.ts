import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  playNewOrderAlert,
  playNewOrderChime,
  triggerSoftVibration,
  playCustomerOrderAlert,
  playCustomerOrderStatusChime,
  getCustomerSoundEnabled,
  setCustomerSoundEnabled,
} from "@/lib/order-alert";

describe("Order Alert System (sound and vibration)", () => {
  let vibrateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vibrateMock = vi.fn();
    Object.defineProperty(globalThis.navigator, "vibrate", {
      value: vibrateMock,
      writable: true,
      configurable: true,
    });
    localStorage.clear();
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
    playNewOrderAlert(true);
    expect(vibrateMock).toHaveBeenCalledWith([180, 80, 220]);
  });

  it("triggers vibration but skips chime when sound is disabled", () => {
    vibrateMock.mockClear();
    playNewOrderAlert(false);
    expect(vibrateMock).toHaveBeenCalledWith([180, 80, 220]);
  });

  it("plays customer order alert with tailored vibration and does not throw", () => {
    vibrateMock.mockClear();
    expect(() => playCustomerOrderAlert("preparing", true)).not.toThrow();
    expect(vibrateMock).toHaveBeenCalledWith([140, 70, 180]);

    vibrateMock.mockClear();
    expect(() => playCustomerOrderAlert("on_the_way", true)).not.toThrow();
    expect(vibrateMock).toHaveBeenCalledWith([180, 80, 240, 80, 240]);

    vibrateMock.mockClear();
    expect(() => playCustomerOrderAlert("delivered", false)).not.toThrow();
    expect(vibrateMock).toHaveBeenCalledWith([140, 70, 180]);

    expect(() => playCustomerOrderStatusChime("cancelled")).not.toThrow();
    expect(() => playCustomerOrderStatusChime("unknown")).not.toThrow();
  });

  it("manages customer sound preferences via localStorage correctly", () => {
    expect(getCustomerSoundEnabled()).toBe(true);

    setCustomerSoundEnabled(false);
    expect(getCustomerSoundEnabled()).toBe(false);

    setCustomerSoundEnabled(true);
    expect(getCustomerSoundEnabled()).toBe(true);
  });

  it("handles kitchen order alarm lifecycle and muting", async () => {
    const {
      startKitchenAlarm,
      stopKitchenAlarm,
      stopAllKitchenAlarms,
      isKitchenAlarmRinging,
      getKitchenAlarmEnabled,
      setKitchenAlarmEnabled,
      muteKitchenAlarm,
    } = await import("@/lib/order-alert");

    expect(getKitchenAlarmEnabled()).toBe(true);

    // Starting kitchen alarm with an order
    startKitchenAlarm("order-123");
    expect(isKitchenAlarmRinging()).toBe(true);

    // Starting with another order
    startKitchenAlarm("order-456");
    expect(isKitchenAlarmRinging()).toBe(true);

    // Stopping first order - still ringing for second
    stopKitchenAlarm("order-123");
    expect(isKitchenAlarmRinging()).toBe(true);

    // Stopping second order - stops ringing
    stopKitchenAlarm("order-456");
    expect(isKitchenAlarmRinging()).toBe(false);

    // Muting
    startKitchenAlarm("order-789");
    expect(isKitchenAlarmRinging()).toBe(true);
    muteKitchenAlarm(60);
    expect(isKitchenAlarmRinging()).toBe(false);

    stopAllKitchenAlarms();
    setKitchenAlarmEnabled(false);
    expect(getKitchenAlarmEnabled()).toBe(false);
  });

  it("handles incoming order phone call cadence and lifecycle", async () => {
    const {
      startIncomingOrderCallRingtone,
      stopIncomingOrderCallRingtone,
      isIncomingCallRinging,
      playPhoneCallCadence,
    } = await import("@/lib/order-alert");

    expect(isIncomingCallRinging()).toBe(false);

    // Call cadence should execute without error
    expect(() => playPhoneCallCadence()).not.toThrow();

    // Start ringtone
    startIncomingOrderCallRingtone();
    expect(isIncomingCallRinging()).toBe(true);

    // Second call to start while running is a no-op
    startIncomingOrderCallRingtone();
    expect(isIncomingCallRinging()).toBe(true);

    // Stop ringtone
    stopIncomingOrderCallRingtone();
    expect(isIncomingCallRinging()).toBe(false);
  });
});
