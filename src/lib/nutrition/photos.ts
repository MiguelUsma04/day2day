import { supabase } from '../supabase';
import { fileToStoredPhoto } from '../../utils/image';

/**
 * Meal photos live in the private `meal-photos` bucket under
 * `{userId}/{mealId}.{ext}`. Every call here is best effort: a photo that
 * fails to upload or load never blocks the meal itself.
 */

export const MEAL_PHOTO_BUCKET = 'meal-photos';
/** Signed URLs last an hour; the cache hands them out for 50 minutes. */
const SIGNED_TTL_S = 3600;
const CACHE_TTL_MS = 50 * 60 * 1000;
/** Photos older than this are removed on the next cleanup. */
export const PHOTO_RETENTION_DAYS = 180;
const CLEANUP_KEY = 'day2day:mealPhotoCleanup:v1';

export function mealPhotoPath(userId: string, mealId: string, ext: 'webp' | 'jpg'): string {
  return `${userId}/${mealId}.${ext}`;
}

/** The user a photo path belongs to (its first folder), or null when malformed. */
export function photoOwner(path: string): string | null {
  const slash = path.indexOf('/');
  return slash > 0 ? path.slice(0, slash) : null;
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Reduces and uploads the photo; returns its storage path, or null when it could not be stored. */
export async function uploadMealPhoto(file: Blob, mealId: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const uid = await currentUserId();
    if (!uid) return null;
    const photo = await fileToStoredPhoto(file);
    const path = mealPhotoPath(uid, mealId, photo.ext);
    const { error } = await supabase.storage.from(MEAL_PHOTO_BUCKET).upload(path, photo.blob, {
      contentType: photo.contentType,
      upsert: true,
      cacheControl: '31536000',
    });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}

export async function removeMealPhoto(path: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.storage.from(MEAL_PHOTO_BUCKET).remove([path]);
    urlCache.delete(path);
  } catch {
    // Orphaned files get swept by the retention cleanup.
  }
}

const urlCache = new Map<string, { url: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string | null>>();

/** A signed URL for the photo, cached per path. Null when offline, missing or not allowed. */
export function signedMealPhotoUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.url);
  const pending = inFlight.get(path);
  if (pending) return pending;
  const task = (async () => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.storage
        .from(MEAL_PHOTO_BUCKET)
        .createSignedUrl(path, SIGNED_TTL_S);
      if (error || !data?.signedUrl) return null;
      urlCache.set(path, {
        url: data.signedUrl,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return data.signedUrl;
    } catch {
      return null;
    } finally {
      inFlight.delete(path);
    }
  })();
  inFlight.set(path, task);
  return task;
}

/** Photos whose `created_at` is older than the retention window. */
export function expiredPhotoNames(
  objects: readonly { name: string; created_at?: string | null }[],
  now: number,
  retentionDays = PHOTO_RETENTION_DAYS,
): string[] {
  const cutoff = now - retentionDays * 86_400_000;
  return objects
    .filter((o) => {
      if (!o.created_at) return false;
      const t = Date.parse(o.created_at);
      return Number.isFinite(t) && t < cutoff;
    })
    .map((o) => o.name);
}

function lastCleanupDay(): string | null {
  try {
    return localStorage.getItem(CLEANUP_KEY);
  } catch {
    return null;
  }
}

function markCleanupDay(day: string): void {
  try {
    localStorage.setItem(CLEANUP_KEY, day);
  } catch {
    // ignore
  }
}

/**
 * Deletes the user's photos older than the retention window. Runs at most
 * once per calendar day per device; the meal row keeps its `photoPath`, and
 * the thumbnail simply falls back to the slot icon.
 */
export async function cleanupOldMealPhotos(today: string): Promise<void> {
  if (!supabase || lastCleanupDay() === today) return;
  try {
    const uid = await currentUserId();
    if (!uid) return;
    const { data, error } = await supabase.storage.from(MEAL_PHOTO_BUCKET).list(uid, {
      limit: 1000,
      sortBy: { column: 'created_at', order: 'asc' },
    });
    if (error || !data) return;
    const expired = expiredPhotoNames(data, Date.now());
    if (expired.length > 0) {
      await supabase.storage.from(MEAL_PHOTO_BUCKET).remove(expired.map((name) => `${uid}/${name}`));
    }
    markCleanupDay(today);
  } catch {
    // Try again another day.
  }
}
