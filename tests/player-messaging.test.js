// player-messaging.test.js
import { jest } from "@jest/globals";
import {
    computeJsApiSrc,
    ensureIframeHasJsApiEnabled,
    subscribeToPlayer,
    sendPlayVideoAt,
    normalizeStartIndex
  } from "../src/player-messaging.js";
  
  // ---------------------------------------------------------------------------
  // computeJsApiSrc — fonction pure, pas de mock nécessaire
  // ---------------------------------------------------------------------------
  describe("computeJsApiSrc", () => {
    const ORIGIN = "https://example.com";
  
    test("ajoute enablejsapi et origin si absents", () => {
      const result = computeJsApiSrc(
        "https://www.youtube.com/embed/abc123",
        ORIGIN
      );
      const url = new URL(result);
  
      expect(url.searchParams.get("enablejsapi")).toBe("1");
      expect(url.searchParams.get("origin")).toBe(ORIGIN);
    });
  
    test("ne modifie pas l'URL si déjà correcte", () => {
      const src = `https://www.youtube.com/embed/abc123?enablejsapi=1&origin=${encodeURIComponent(
        ORIGIN
      )}`;
      expect(computeJsApiSrc(src, ORIGIN)).toBe(src);
    });
  
    test("corrige origin si différent de l'origin actuel", () => {
      const src =
        "https://www.youtube.com/embed/abc123?enablejsapi=1&origin=https://old-site.com";
      const result = computeJsApiSrc(src, ORIGIN);
  
      expect(new URL(result).searchParams.get("origin")).toBe(ORIGIN);
    });
  
    test("conserve les autres paramètres existants (list, index)", () => {
      const src = "https://www.youtube.com/embed/videoseries?list=PL123&index=3";
      const result = computeJsApiSrc(src, ORIGIN);
      const url = new URL(result);
  
      expect(url.searchParams.get("list")).toBe("PL123");
      expect(url.searchParams.get("index")).toBe("3");
    });
  
    test("lève une erreur si l'URL est invalide", () => {
      expect(() => computeJsApiSrc("not-a-valid-url", ORIGIN)).toThrow();
    });
  });
  
  // ---------------------------------------------------------------------------
  // ensureIframeHasJsApiEnabled — nécessite un mock d'iframe (jsdom)
  // ---------------------------------------------------------------------------
  describe("ensureIframeHasJsApiEnabled", () => {
    const ORIGIN = window.location.origin; // fourni par testEnvironmentOptions.url
  
    function createIframe(src) {
      const iframe = document.createElement("iframe");
      iframe.src = src;
      return iframe;
    }
  
    test("met à jour iframe.src quand enablejsapi/origin manquent", () => {
      const iframe = createIframe("https://www.youtube.com/embed/abc123");
  
      ensureIframeHasJsApiEnabled(iframe);
  
      const url = new URL(iframe.src);
      expect(url.searchParams.get("enablejsapi")).toBe("1");
      expect(url.searchParams.get("origin")).toBe(ORIGIN);
    });
  
    test("enregistre data-original-src avant toute modification", () => {
      const originalSrc = "https://www.youtube.com/embed/abc123";
      const iframe = createIframe(originalSrc);
  
      ensureIframeHasJsApiEnabled(iframe);
  
      expect(iframe.getAttribute("data-original-src")).toBe(originalSrc);
    });
  
    test("ne réassigne pas iframe.src si déjà correct (évite un reload inutile)", () => {
      const src = `https://www.youtube.com/embed/abc123?enablejsapi=1&origin=${encodeURIComponent(
        ORIGIN
      )}`;
      const iframe = createIframe(src);
  
      let setCount = 0;
      const nativeDescriptor = Object.getOwnPropertyDescriptor(
        HTMLIFrameElement.prototype,
        "src"
      );
      Object.defineProperty(iframe, "src", {
        get: nativeDescriptor.get.bind(iframe),
        set(value) {
          setCount++;
          nativeDescriptor.set.call(iframe, value);
        }
      });
  
      ensureIframeHasJsApiEnabled(iframe);
  
      expect(setCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // subscribeToPlayer / sendPlayVideoAt — nécessitent un mock de contentWindow
  // ---------------------------------------------------------------------------
  describe("subscribeToPlayer", () => {
    test("envoie l'événement listening via postMessage", () => {
      const postMessage = jest.fn();
      const iframe = { contentWindow: { postMessage } };
  
      subscribeToPlayer(iframe);
  
      expect(postMessage).toHaveBeenCalledTimes(1);
      const [payload, targetOrigin] = postMessage.mock.calls[0];
      expect(JSON.parse(payload)).toEqual({ event: "listening" });
      expect(targetOrigin).toBe("*");
    });
  
    test("ne lève pas d'erreur si contentWindow est absent", () => {
      const iframe = { contentWindow: null };
      expect(() => subscribeToPlayer(iframe)).not.toThrow();
    });
  });
  
  describe("sendPlayVideoAt", () => {
    test("envoie la commande playVideoAt avec le bon index", () => {
      const postMessage = jest.fn();
      const iframe = { contentWindow: { postMessage } };
  
      sendPlayVideoAt(iframe, 3);
  
      const [payload] = postMessage.mock.calls[0];
      expect(JSON.parse(payload)).toEqual({
        event: "command",
        func: "playVideoAt",
        args: [3]
      });
    });
  
    test("gère l'index 0 correctement", () => {
      const postMessage = jest.fn();
      const iframe = { contentWindow: { postMessage } };
  
      sendPlayVideoAt(iframe, 0);
  
      const [payload] = postMessage.mock.calls[0];
      expect(JSON.parse(payload).args).toEqual([0]);
    });
  
    test("ne lève pas d'erreur si contentWindow est absent", () => {
      const iframe = { contentWindow: undefined };
      expect(() => sendPlayVideoAt(iframe, 2)).not.toThrow();
    });
  });
  
  // ---------------------------------------------------------------------------
  // normalizeStartIndex — fonction pure
  // ---------------------------------------------------------------------------
  describe("normalizeStartIndex", () => {
    test("convertit un index 1-based positif en 0-based", () => {
      expect(normalizeStartIndex(3)).toBe(2);
    });
  
    test("retourne 0 si startIndex vaut 0", () => {
      expect(normalizeStartIndex(0)).toBe(0);
    });
  
    test("retourne 0 si startIndex est négatif", () => {
      expect(normalizeStartIndex(-5)).toBe(0);
    });
  
    test("index 1 devient 0", () => {
      expect(normalizeStartIndex(1)).toBe(0);
    });
  });