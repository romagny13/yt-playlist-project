// cache.js
import { Logger } from "./Logger";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Crée un cache clé/valeur avec expiration, basé sur un storage type
 * localStorage (get/set/removeItem). Une entrée expirée est supprimée
 * automatiquement au prochain get().
 */
export function createCache({
  prefix,
  ttlMs = DEFAULT_TTL_MS,
  storage = localStorage
} = {}) {
  if (!prefix) throw new Error("createCache: 'prefix' est requis");

  const buildKey = (key) => `${prefix}${key}`;

  return {
    get(key) {
      if (!key) return null;
      try {
        const raw = storage.getItem(buildKey(key));
        if (!raw) return null;

        const { data, expiresAt } = JSON.parse(raw);
        if (Date.now() > expiresAt) {
          storage.removeItem(buildKey(key));
          return null;
        }
        return data;
      } catch {
        return null;
      }
    },

    set(key, data) {
      if (!key || data == null) return;
      try {
        storage.setItem(
          buildKey(key),
          JSON.stringify({ data, expiresAt: Date.now() + ttlMs })
        );
      } catch (error) {
        Logger.warn(`[Cache] Échec d'écriture pour "${key}":`, error.message);
      }
    },

    remove(key) {
      if (!key) return;
      storage.removeItem(buildKey(key));
    }
  };
}
