import { describe, expect, it, beforeEach } from "vitest";
import {
  SEEN_BANNERS_STORAGE_KEY_PREFIX,
  MAX_PERSISTED_SEEN_IDS,
  getPersistedSeenNotificationIds,
  persistSeenNotificationIds,
  markNotificationAsSeen,
  syncSeenNotificationIdsFromStorage,
} from "@/lib/notification-seen";

describe("Notification Seen Persistence & Gate", () => {
  const userId = "user-test-123";

  beforeEach(() => {
    localStorage.clear();
  });

  it("returns an empty set when no seen IDs are stored", () => {
    const seen = getPersistedSeenNotificationIds(userId);
    expect(seen.size).toBe(0);
  });

  it("persists seen notification IDs and retrieves them correctly", () => {
    const ids = new Set(["notif-1", "notif-2", "notif-3"]);
    persistSeenNotificationIds(userId, ids);

    const retrieved = getPersistedSeenNotificationIds(userId);
    expect(retrieved.size).toBe(3);
    expect(retrieved.has("notif-1")).toBe(true);
    expect(retrieved.has("notif-2")).toBe(true);
    expect(retrieved.has("notif-3")).toBe(true);
  });

  it("limits stored notification IDs to MAX_PERSISTED_SEEN_IDS to prevent storage bloat", () => {
    const largeList: string[] = [];
    for (let i = 0; i < 600; i++) {
      largeList.push(`notif-${i}`);
    }

    persistSeenNotificationIds(userId, largeList);
    const retrieved = getPersistedSeenNotificationIds(userId);
    expect(retrieved.size).toBe(MAX_PERSISTED_SEEN_IDS);
    // Should keep the latest ones
    expect(retrieved.has("notif-0")).toBe(false);
    expect(retrieved.has("notif-599")).toBe(true);
  });

  it("markNotificationAsSeen adds ID and writes to localStorage immediately", () => {
    const seenSet = new Set<string>(["existing-1"]);
    markNotificationAsSeen(userId, seenSet, "new-notif-99");

    expect(seenSet.has("new-notif-99")).toBe(true);

    const stored = getPersistedSeenNotificationIds(userId);
    expect(stored.has("new-notif-99")).toBe(true);
    expect(stored.has("existing-1")).toBe(true);
  });

  it("syncSeenNotificationIdsFromStorage merges external IDs (e.g. from another tab)", () => {
    const seenSet = new Set<string>(["tab1-notif"]);

    // Another tab wrote to localStorage
    const otherTabIds = ["other-tab-notif-1", "other-tab-notif-2"];
    localStorage.setItem(
      `${SEEN_BANNERS_STORAGE_KEY_PREFIX}${userId}`,
      JSON.stringify(otherTabIds)
    );

    syncSeenNotificationIdsFromStorage(userId, seenSet);

    expect(seenSet.has("tab1-notif")).toBe(true);
    expect(seenSet.has("other-tab-notif-1")).toBe(true);
    expect(seenSet.has("other-tab-notif-2")).toBe(true);
  });

  it("simulates cold start / page reload: pre-existing unread notifications are gated on first load and never shown again", () => {
    // 1. First session: User has 3 unread notifications in database
    const initialFetchedNotifs = [
      { id: "old-1", is_read: false },
      { id: "old-2", is_read: false },
      { id: "old-3", is_read: false },
    ];

    let isInitialLoad = true;
    const runtimeSeenSet = new Set<string>(getPersistedSeenNotificationIds(userId));
    const bannersShown: string[] = [];

    // Simulate initial mount logic
    if (isInitialLoad) {
      isInitialLoad = false;
      for (const n of initialFetchedNotifs) {
        runtimeSeenSet.add(n.id);
      }
      persistSeenNotificationIds(userId, runtimeSeenSet);
      // No banners shown on initial load
    }

    expect(bannersShown).toHaveLength(0);
    expect(runtimeSeenSet.size).toBe(3);

    // 2. Real-time arrival while on site:
    const liveNotifs = [
      ...initialFetchedNotifs,
      { id: "live-new-4", is_read: false },
    ];

    const unreadList = liveNotifs.filter(
      (n) => !n.is_read && !runtimeSeenSet.has(n.id)
    );

    for (const unread of unreadList) {
      runtimeSeenSet.add(unread.id);
      bannersShown.push(unread.id);
    }
    persistSeenNotificationIds(userId, runtimeSeenSet);

    // Only the live new notification was shown
    expect(bannersShown).toEqual(["live-new-4"]);

    // 3. User refreshes or restarts the page (Page Reload simulation):
    const reloadedSeenSet = new Set<string>(getPersistedSeenNotificationIds(userId));
    expect(reloadedSeenSet.has("live-new-4")).toBe(true);
    expect(reloadedSeenSet.has("old-1")).toBe(true);

    let isReloadInitialLoad = true;
    const reloadedBanners: string[] = [];

    // Even if database still has them as unread (!n.is_read)
    const reloadedFetchedNotifs = [
      { id: "old-1", is_read: false },
      { id: "old-2", is_read: false },
      { id: "old-3", is_read: false },
      { id: "live-new-4", is_read: false },
    ];

    if (isReloadInitialLoad) {
      isReloadInitialLoad = false;
      for (const n of reloadedFetchedNotifs) {
        reloadedSeenSet.add(n.id);
      }
      persistSeenNotificationIds(userId, reloadedSeenSet);
    }

    // After initial load, if next query runs with same list:
    const subsequentUnread = reloadedFetchedNotifs.filter(
      (n) => !n.is_read && !reloadedSeenSet.has(n.id)
    );
    for (const unread of subsequentUnread) {
      reloadedBanners.push(unread.id);
    }

    // Zero banners shown on reload!
    expect(reloadedBanners).toHaveLength(0);
  });
});
