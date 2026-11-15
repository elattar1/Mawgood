import { describe, expect, it, beforeEach } from "vitest";
import {
  getPersistedAddressDraft,
  saveAddressDraft,
  getPersistedNotes,
  savePersistedNotes,
  clearPersistedNotes,
  ADDRESS_STORAGE_KEYS,
} from "@/lib/address-storage";

describe("Address & Cart Persistence System", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default empty draft when localStorage is empty", () => {
    const draft = getPersistedAddressDraft();
    expect(draft.address).toBe("");
    expect(draft.phone).toBe("");
    expect(draft.areaId).toBeNull();
    expect(draft.label).toBe("");
    expect(draft.selectedId).toBe("new");
    expect(draft.coords).toBeNull();
  });

  it("persists and restores address, phone, area, and coordinates correctly", () => {
    saveAddressDraft({
      address: "شارع الجمهورية - أمام بنك مصر",
      phone: "01099887766",
      areaId: 3,
      label: "المنزل",
      selectedId: "new",
      coords: { lat: 30.85, lng: 31.92 },
    });

    const draft = getPersistedAddressDraft();
    expect(draft.address).toBe("شارع الجمهورية - أمام بنك مصر");
    expect(draft.phone).toBe("01099887766");
    expect(draft.areaId).toBe(3);
    expect(draft.label).toBe("المنزل");
    expect(draft.selectedId).toBe("new");
    expect(draft.coords).toEqual({ lat: 30.85, lng: 31.92 });
  });

  it("cleans GPS tags from address when saving draft", () => {
    saveAddressDraft({
      address: "شارع بورسعيد\n<!-- GPS: {\"lat\":30.1,\"lng\":31.2} -->",
    });

    const draft = getPersistedAddressDraft();
    expect(draft.address).toBe("شارع بورسعيد");
  });

  it("persists, reads, and clears order notes safely", () => {
    expect(getPersistedNotes()).toBe("");

    savePersistedNotes("بدون طماطم، صوص زيادة");
    expect(getPersistedNotes()).toBe("بدون طماطم، صوص زيادة");

    clearPersistedNotes();
    expect(getPersistedNotes()).toBe("");
  });

  it("safely handles corrupted JSON in coords without throwing", () => {
    localStorage.setItem(ADDRESS_STORAGE_KEYS.COORDS, "invalid-json{{");
    const draft = getPersistedAddressDraft();
    expect(draft.coords).toBeNull();
  });
});
