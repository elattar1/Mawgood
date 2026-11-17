import { describe, expect, it } from "vitest";
import {
  extractCoordinates,
  extractDriverCoordinates,
  cleanDisplayAddress,
  formatAddressWithCoordinates,
  calculateDistanceKm,
  formatDistanceArabic,
  estimateDeliveryMinutes,
  DEFAULT_HUSAYNIYA_CENTER,
} from "@/lib/map-utils";

describe("Map and Live Driver Tracking Utilities", () => {
  it("extracts customer coordinates from comments or text", () => {
    const textWithComment = "شارع السادات بجوار الصيدلية <!-- GPS:30.865600,31.919200 -->";
    const coords = extractCoordinates(textWithComment);
    expect(coords).not.toBeNull();
    expect(coords?.lat).toBeCloseTo(30.8656);
    expect(coords?.lng).toBeCloseTo(31.9192);

    const clean = cleanDisplayAddress(textWithComment);
    expect(clean).toBe("شارع السادات بجوار الصيدلية");
  });

  it("extracts live driver coordinates and timestamp from notes", () => {
    const timestamp = Date.now();
    const notesWithGps = `ملاحظات العميل: بدون فلفل\n<!-- DRIVER_GPS:30.867200,31.918400,${timestamp} -->`;
    const driverLoc = extractDriverCoordinates(notesWithGps);

    expect(driverLoc).not.toBeNull();
    expect(driverLoc?.lat).toBeCloseTo(30.8672);
    expect(driverLoc?.lng).toBeCloseTo(31.9184);
    expect(driverLoc?.updatedAt).toBe(timestamp);

    expect(extractDriverCoordinates("بدون إحداثيات")).toBeNull();
  });

  it("calculates distance accurately using Haversine formula", () => {
    const p1 = { lat: 30.8656, lng: 31.9192 };
    const p2 = { lat: 30.8656, lng: 31.9192 };
    expect(calculateDistanceKm(p1, p2)).toBe(0);

    // Points in Husayniya (~800m apart)
    const p3 = { lat: 30.8656, lng: 31.9192 };
    const p4 = { lat: 30.8710, lng: 31.9160 };
    const dist = calculateDistanceKm(p3, p4);
    expect(dist).toBeGreaterThan(0.5);
    expect(dist).toBeLessThan(1.2);
  });

  it("formats distance into clear Arabic strings", () => {
    expect(formatDistanceArabic(0.45)).toBe("450 متر");
    expect(formatDistanceArabic(0.02)).toBe("50 متر");
    expect(formatDistanceArabic(1.75)).toBe("1.8 كم");
    expect(formatDistanceArabic(3.21)).toBe("3.2 كم");
  });

  it("estimates arrival time reasonably for town delivery", () => {
    expect(estimateDeliveryMinutes(0.05)).toBe(1); // At destination
    expect(estimateDeliveryMinutes(0.8)).toBeGreaterThanOrEqual(2);
    expect(estimateDeliveryMinutes(2.5)).toBeGreaterThanOrEqual(5);
  });
});
