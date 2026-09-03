// src/dom.js

import { isString } from "./utils";

/**
 * Résout le scope DOM.
 * - undefined / null → document
 * - string → document.querySelector(selector)
 * - HTMLElement / Element → retourne l’élément tel quel
 */
export function resolveScope(scope) {
  if (scope == null) {
    return document;
  }

  if (isString(scope)) {
    const element = document.querySelector(scope);
    if (!element) {
      throw new Error(
        `[YTPlaylist] Element not found for selector: "${scope}"`
      );
    }
    return element;
  }

  // On considère que c’est déjà un élément DOM
  return scope;
}

/**
 * Récupère toutes les iframes YouTube dans un scope donné.
 * @param {ParentNode} root - Element ou Document
 * @returns {HTMLIFrameElement[]}
 */
export function queryYouTubeIframes(root = document) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return [];
  }

  // Plus robuste : youtube.com + youtube-nocookie.com + différents formats d'embed
  const selector =
    'iframe[src*="youtube.com/embed"], iframe[src*="youtube-nocookie.com/embed"]';

  // On convertit en vrai Array (plus pratique)
  return Array.from(root.querySelectorAll(selector));
}

export const Cache = {
  TTL: 24 * 60 * 60 * 1000, // 24h ms
  PREFIX: "ytp_",

  _key(id) {
    return `${this.PREFIX}${id}`;
  },

  get(id) {
    try {
      const raw = localStorage.getItem(this._key(id));
      if (!raw) return null;
      const { data, expiresAt } = JSON.parse(raw);
      if (Date.now() > expiresAt) {
        localStorage.removeItem(this._key(id));
        return null;
      }
      return data;
    } catch {
      return null;
    }
  },

  set(id, data) {
    try {
      localStorage.setItem(
        this._key(id),
        JSON.stringify({ data, expiresAt: Date.now() + this.TTL })
      );
    } catch (e) {
      // Quota
      Logger.warn("[YTPlaylist] Cache write failed:", e.message);
    }
  }
};
