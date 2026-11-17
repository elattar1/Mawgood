export const SEEN_BANNERS_STORAGE_KEY_PREFIX = "husayniya_seen_banners_";
export const MAX_PERSISTED_SEEN_IDS = 500;

export interface NotificationItemLike {
  id: string;
  title: string;
  body: string;
  link?: string | null;
  is_read?: boolean | null;
  created_at?: string | null;
}

/**
 * Loads the set of notification IDs that have already been presented on screen
 * for this user, persisted in localStorage across page reloads.
 */
export function getPersistedSeenNotificationIds(userId: string): Set<string> {
  if (typeof window === "undefined" || !userId) return new Set();
  try {
    const raw = localStorage.getItem(`${SEEN_BANNERS_STORAGE_KEY_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed);
    }
  } catch {}
  return new Set();
}

/**
 * Persists the set of seen notification IDs to localStorage,
 * maintaining a rolling limit to avoid unbounded localStorage growth.
 */
export function persistSeenNotificationIds(userId: string, ids: Set<string> | string[]): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    const list = Array.from(ids);
    const trimmed = list.slice(-MAX_PERSISTED_SEEN_IDS);
    localStorage.setItem(`${SEEN_BANNERS_STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(trimmed));
  } catch {}
}

/**
 * Helper to mark a notification ID as seen in the runtime set and persist immediately.
 */
export function markNotificationAsSeen(userId: string, seenSet: Set<string>, notificationId: string): void {
  if (!seenSet.has(notificationId)) {
    seenSet.add(notificationId);
    persistSeenNotificationIds(userId, seenSet);
  }
}

/**
 * Synchronizes runtime seenSet with the latest localStorage state (e.g. from other tabs).
 */
export function syncSeenNotificationIdsFromStorage(userId: string, seenSet: Set<string>): void {
  const latest = getPersistedSeenNotificationIds(userId);
  latest.forEach((id) => seenSet.add(id));
}
