(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.YTPlaylist = factory());
})(this, (function () { 'use strict';

  function isString(value) {
    return typeof value === "string";
  }

  // src/dom.js


  /**
   * Résout le scope DOM.
   * - undefined / null → document
   * - string → document.querySelector(selector)
   * - HTMLElement / Element → retourne l’élément tel quel
   */
  function resolveScope(scope) {
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
  function queryYouTubeIframes(root = document) {
    if (!root || typeof root.querySelectorAll !== "function") {
      return [];
    }

    // Plus robuste : youtube.com + youtube-nocookie.com + différents formats d'embed
    const selector =
      'iframe[src*="youtube.com/embed"], iframe[src*="youtube-nocookie.com/embed"]';

    // On convertit en vrai Array (plus pratique)
    return Array.from(root.querySelectorAll(selector));
  }

  class Logger {
    static _enabled = true;

    static enable() {
      Logger._enabled = true;
    }

    static disable() {
      Logger._enabled = false;
    }

    static log(msg) {
      if (Logger._enabled) console.log(msg);
    }

    static warn(msg) {
      if (Logger._enabled) console.warn(msg);
    }

    static error(msg, err) {
      if (Logger._enabled) console.error(msg, err);
    }
  }

  // cache.js

  const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

  /**
   * Crée un cache clé/valeur avec expiration, basé sur un storage type
   * localStorage (get/set/removeItem). Une entrée expirée est supprimée
   * automatiquement au prochain get().
   */
  function createCache({
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

  // youtube.js


  const videoCache = createCache({ prefix: "ytp_" });

  const YOUTUBE_EMBED_PATH = "youtube.com/embed";

  /**
   * Playlist partagée depuis la page détails de la playlist sur youtube.com.
   * https://www.youtube.com/embed/videoseries?si={SHARE_ID}&list={PLAYLIST_ID}
   */
  function isSharedPlaylistEmbedUrl(src) {
    return isString(getEmbedSearchParam(src, "list"));
  }

  /**
   * Liste de video ids.
   * https://www.youtube.com/embed?playlist={video_ID1},{video_ID2},...
   */
  function isVideoIdListEmbedUrl(src) {
    return isString(getEmbedSearchParam(src, "playlist"));
  }

  function getVideoIdsFromEmbedUrl(src) {
    const playlistParam = getEmbedSearchParam(src, "playlist");
    if (!isString(playlistParam)) return [];

    return playlistParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }

  /**
   * Extrait un paramètre de recherche d'une URL d'embed YouTube.
   * Retourne null si ce n'est pas un embed YouTube ou si l'URL est invalide.
   */
  function getEmbedSearchParam(src, paramName) {
    if (!isString(src) || !src.includes(YOUTUBE_EMBED_PATH)) return null;

    try {
      const url = new URL(src, location.href);
      return url.searchParams.get(paramName);
    } catch {
      return null;
    }
  }

  /**
   * Détermine l'index de départ
   */
  function getStartIndexFromIframe(src) {
    const param = getEmbedSearchParam(src, "index");
    if (param) {
      const index = parseInt(param, 10);
      return index;
    }
    return 0;
  }

  // *****************  YOUTUBE DATA API  **************************

  const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
  const MAX_IDS_PER_REQUEST = 50;

  /** Récupère les video ids à partir d'un playlist id avec YouTube Data Api */
  async function fetchVideoIdsFromPlaylist(playlistId, apiKey) {
    const videoIds = [];
    let pageToken = "";

    do {
      const params = new URLSearchParams({
        part: "contentDetails",
        maxResults: "50",
        playlistId,
        key: apiKey
      });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(`${YOUTUBE_API_BASE}/playlistItems?${params}`);
      if (!res.ok) {
        throw new Error(`YouTube API ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      for (const item of data.items ?? []) {
        const videoId = item.contentDetails?.videoId;
        if (videoId) videoIds.push(videoId);
      }

      pageToken = data.nextPageToken ?? "";
    } while (pageToken);

    return videoIds;
  }

  async function fetchVideosByIds(videoIds, apiKey) {
    const videos = [];

    for (const chunk of chunkArray(videoIds, MAX_IDS_PER_REQUEST)) {
      const params = new URLSearchParams({
        part: "snippet,status",
        id: chunk.join(","),
        key: apiKey
      });

      const res = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`);
      if (!res.ok) {
        throw new Error(`YouTube API ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      for (const video of data.items ?? []) {
        // On exclut les vidéos privées (public / unlisted sont conservées)
        if (video.status?.privacyStatus === "private") continue;

        videos.push({
          id: video.id,
          title: video.snippet.title,
          channelTitle: video.snippet.channelTitle || "",
          thumbnailUrl:
            video.snippet.thumbnails?.medium?.url ||
            video.snippet.thumbnails?.default?.url ||
            ""
        });
      }
    }

    return videos;
  }

  function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Construit des infos vidéo minimales sans appel à l'API, à utiliser en
   * fallback si fetchVideosByIds échoue. Le thumbnail utilise l'endpoint
   * public img.youtube.com (pas besoin de clé API).
   */
  function buildFallbackVideos(videoIds) {
    return videoIds.map((videoId, index) => ({
      id: videoId,
      title: `Vidéo ${index + 1}`,
      channelTitle: "",
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    }));
  }

  /**
   * Résout la source d'une URL embed YouTube : où récupérer les video ids
   * et quelle clé utiliser pour le cache. Retourne null si src ne correspond
   * à aucun format embed connu.
   */
  function resolveEmbedSource(src) {
    if (isSharedPlaylistEmbedUrl(src)) {
      const playlistId = getEmbedSearchParam(src, "list");
      return {
        cacheKey: playlistId,
        getVideoIds: (apiKey) => fetchVideoIdsFromPlaylist(playlistId, apiKey)
      };
    }

    if (isVideoIdListEmbedUrl(src)) {
      const videoIds = getVideoIdsFromEmbedUrl(src);
      return {
        cacheKey: getEmbedSearchParam(src, "playlist"),
        getVideoIds: () => videoIds
      };
    }

    return null;
  }

  async function getVideosFromEmbedSrc(src, apiKey) {
    const source = resolveEmbedSource(src);
    if (!source) return [];

    const cached = videoCache.get(source.cacheKey);
    if (cached) return cached;

    let videoIds = [];
    try {
      videoIds = await source.getVideoIds(apiKey);
      const videos = await fetchVideosByIds(videoIds, apiKey);
      if (videos.length > 0) videoCache.set(source.cacheKey, videos);
      return videos;
    } catch (error) {
      Logger.warn(
        `[YTPlaylist] Fail to fetch "${source.cacheKey}":`,
        error.message
      );
      return videoIds.length > 0 ? buildFallbackVideos(videoIds) : [];
    }
  }

  // ---------------------------------------------------------------------------
  // Default theme
  // Only the values that actually vary across themes are extracted as variables.
  // Structural / layout values (flex, display, overflow…) stay hard-coded in CSS.
  // ---------------------------------------------------------------------------

  const DEFAULT_THEME = {
    // --- Colors ---
    "font-family": "Roboto, Arial, sans-serif",
    accent: "#ff0000", // red bar on active item + header icon
    "accent-playing": "#ff4444", // "now playing" label & bars
    bg: "#0f0f0f", // panel background
    "bg-item-hover": "#1a1a1a", // item hover
    "bg-item-active": "#272727", // active item
    "bg-thumb": "#1a1a1a", // thumbnail placeholder
    "bg-toggle": "rgba(0,0,0,0.5)", // toggle button default
    "bg-toggle-hover": "rgba(255,255,255,0.15)", // toggle button hover / active
    border: "#272727", // panel top border + header bottom border
    "border-item": "#1a1a1a", // item separator
    "text-primary": "#ffffff",
    "text-secondary": "#888888",
    "scrollbar-thumb": "#444444"
  };

  const DEFAULT_CSS = `
    .ytp-ext-wrapper { font-family: var(--ytp-font-family); }
    .ytp-ext-wrapper iframe { display: block; }

    .ytp-panel-toggle {
        position: absolute;
        left: 140px;
        bottom: 20px;
        z-index: 9999;
        background: var(--ytp-bg-toggle);
        color: #fff;
        border: none;
        border-radius: 50%;
        height: 36px;
        width: 36px;
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-family: var(--ytp-font-family);
        transition: background 0.2s;
        opacity: 0;
    }
    .ytp-ext-wrapper:hover .ytp-panel-toggle { opacity: 1; }
    .ytp-panel-toggle:hover,
    .ytp-panel-toggle.is-active { background: var(--ytp-bg-toggle-hover); }

    .ytp-playlist-panel {
        opacity: 0;
        background: var(--ytp-bg);
        border-top: 1px solid var(--ytp-border);
        max-height: 0;
        overflow: hidden;
        visibility: hidden;
        transition:
            max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1),
            opacity    0.35s ease,
            visibility 0s   linear 0.35s;
        border-radius: 12px;
    }
    .ytp-playlist-panel.is-open {
        max-height: 280px;
        opacity: 1;
        visibility: visible;
        transition:
            max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1),
            opacity    0.35s ease,
            visibility 0s   linear 0s;
    }

    .ytp-panel-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 14px 7px;
        border-bottom: 1px solid var(--ytp-border);
        color: var(--ytp-text-primary);
        font-size: 13px;
        font-weight: 500;
    }
    .ytp-panel-header .ytp-count {
        font-size: 11px;
        color: var(--ytp-text-secondary);
        font-weight: 400;
    }

    .ytp-playlist-scroll {
        overflow-y: auto;
        max-height: 235px;
        scrollbar-width: thin;
        scrollbar-color: var(--ytp-scrollbar-thumb) transparent;
    }

    .ytp-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 14px;
        cursor: pointer;
        border-bottom: 1px solid var(--ytp-border-item);
        transition: background 0.15s;
        position: relative;
    }
    .ytp-item:hover     { background: var(--ytp-bg-item-hover); }
    .ytp-item.is-active { background: var(--ytp-bg-item-active); }
    .ytp-item.is-active::before {
        content: "";
        position: absolute;
        left: 0; top: 0; bottom: 0;
        width: 3px;
        background: var(--ytp-accent);
        border-radius: 0 2px 2px 0;
    }

    .ytp-thumb {
        width: 80px;
        height: 45px;
        flex-shrink: 0;
        border-radius: 3px;
        overflow: hidden;
        background: var(--ytp-bg-thumb);
        position: relative;
    }
    .ytp-thumb img {
        width: 100%; height: 100%;
        object-fit: cover;
        display: block;
        border: none !important;
        padding: 0 !important;
    }
    .ytp-thumb-num {
        position: absolute;
        bottom: 2px; right: 3px;
        font-size: 9px;
        color: #fff;
        background: rgba(0,0,0,0.7);
        padding: 1px 4px;
        border-radius: 2px;
        font-weight: 500;
    }

    .ytp-item-info { flex: 1; min-width: 0; }
    .ytp-item-title {
        font-size: 12px;
        color: var(--ytp-text-primary);
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .ytp-item.is-active .ytp-item-title { font-weight: 500; }
    .ytp-item-ch {
        font-size: 10px;
        color: var(--ytp-text-secondary);
        margin-top: 2px;
    }

    .ytp-playing {
        display: none;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        color: var(--ytp-accent-playing);
        font-weight: 500;
        margin-top: 2px;
    }
    .ytp-item.is-active .ytp-playing { display: flex; }

    .ytp-bars {
        display: flex;
        gap: 2px;
        align-items: flex-end;
        height: 10px;
    }
    .ytp-bars span {
        display: block;
        width: 2px;
        background: var(--ytp-accent-playing);
        border-radius: 1px;
        animation: ytpBounce 0.8s ease-in-out infinite alternate;
    }
    .ytp-bars span:nth-child(2) { animation-delay: 0.2s; }
    .ytp-bars span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes ytpBounce {
        from { height: 3px; }
        to   { height: 10px; }
    }
    `;

  // ---------------------------------------------------------------------------
  // Theming / CSS helpers
  // ---------------------------------------------------------------------------

  function buildThemeVars(userTheme) {
    const merged = Object.assign({}, DEFAULT_THEME, userTheme);
    return Object.entries(merged)
      .map(([k, v]) => `--ytp-${k}: ${v};`)
      .join(" ");
  }

  function injectGlobalCSS(css, styleId) {
    if (document.getElementById(styleId)) return;
    const el = document.createElement("style");
    el.id = styleId;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ---------------------------------------------------------------------------
  // Player Messaging
  // ---------------------------------------------------------------------------

  function ensureIframeHasJsApiEnabled(iframe) {
    const srcUrl = new URL(iframe.src);
    const needsUpdate =
      !srcUrl.searchParams.get("enablejsapi") ||
      srcUrl.searchParams.get("origin") !== location.origin;
    iframe.setAttribute("data-original-src", iframe.src);
    if (needsUpdate) {
      srcUrl.searchParams.set("enablejsapi", "1");
      srcUrl.searchParams.set("origin", location.origin);
      iframe.src = srcUrl.toString();
    }
  }

  function subscribeToPlayer(iframe) {
    iframe.contentWindow?.postMessage(
      JSON.stringify({ event: "listening" }),
      "*"
    );
  }

  function sendPlayVideoAt(iframe, index) {
    iframe.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: "playVideoAt", args: [index] }),
      "*"
    );
  }

  function normalizeStartIndex(startIndex) {
    return startIndex > 0 ? startIndex - 1 : 0;
  }

  class FrameWithPlaylist {
    constructor(iframe, videos, startIndex, themeVars) {
      this.iframe = iframe;
      this.videos = videos;
      this.startIndex = startIndex;
      this.currentIndex = startIndex;
      this.themeVars = themeVars;

      this.isPanelOpen = false;
      this.initialSyncDone = false;

      this.parent = iframe.parentNode;
      this.iframeStyle = window.getComputedStyle(iframe);
      this.isAbsolute = this.iframeStyle.position === "absolute";

      this.wrapper = null;
      this.toggleButton = null;
      this.panel = null;
      this.scroll = null;

      this._onMessage = this._onMessage.bind(this);
      this._onIframeLoad = this._onIframeLoad.bind(this);

      this._create();
    }

    // -------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------

    _create() {
      this._createWrapper();
      this._createToggleButton();
      this._createPanel();
      this._bindEvents();

      this.renderItems();
    }

    _createWrapper() {
      this.iframe.setAttribute("data-ytp-wrapped", "1");

      this.wrapper = document.createElement("div");
      this.wrapper.className = "ytp-ext-wrapper";

      this.wrapper.setAttribute("style", this.themeVars);

      if (this.isAbsolute) {
        this.wrapper.style.cssText +=
          `position:absolute;` +
          `top:${this.iframeStyle.top};` +
          `left:${this.iframeStyle.left};` +
          `width:${this.iframeStyle.width};` +
          `height:${this.iframeStyle.height};`;

        this.iframe.style.position = "relative";
        this.iframe.style.width = "100%";
        this.iframe.style.height = "100%";
      } else {
        this.wrapper.style.cssText +=
          `position:relative;` +
          `display:inline-block;` +
          `width:${this.iframeStyle.width};`;
      }

      const placeholder = document.createElement("div");

      placeholder.style.cssText =
        `width:${this.iframeStyle.width};` +
        `height:${this.iframeStyle.height};` +
        `background:#000;` +
        `display:block;`;

      this.parent.insertBefore(this.wrapper, this.iframe);
      this.wrapper.appendChild(placeholder);

      requestAnimationFrame(() => {
        this.wrapper.replaceChild(this.iframe, placeholder);
      });
    }

    _createToggleButton() {
      this.toggleButton = document.createElement("button");

      this.toggleButton.className = "ytp-panel-toggle";
      this.toggleButton.setAttribute("aria-label", "Toggle playlist panel");

      this.toggleButton.innerHTML = `
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M3 5.5h18v2H3zm0 5.5h18v2H3zm0 5.5h18v2H3z"
          stroke="currentColor"
          stroke-width="0.8"
        />
      </svg>
    `;

      this.wrapper.appendChild(this.toggleButton);
    }

    _createPanel() {
      this.panel = document.createElement("div");
      this.panel.className = "ytp-playlist-panel";

      this.panel.style.width = this.iframeStyle.width;

      const header = document.createElement("div");
      header.className = "ytp-panel-header";

      header.innerHTML = `
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="var(--ytp-accent)"
      >
        <path
          d="M21.543 6.498C22 8.28 22 12 22 12s0 3.72-.457 5.502
             c-.254.985-.997 1.76-1.938 2.022C17.896 20 12 20 12 20
             s-5.895 0-7.605-.476c-.940-.262-1.684-1.037-1.938-2.022
             C2 15.72 2 12 2 12s0-3.72.457-5.502
             c.254-.985.997-1.76 1.938-2.022C6.105 4 12 4 12 4
             s5.896 0 7.605.476c.941.262 1.684 1.037 1.938 2.022z"
        />
        <path
          d="M10 15l5.19-3L10 9v6z"
          fill="#fff"
        />
      </svg>

      Playlist

      <span class="ytp-count">
        ${this.videos.length}
        video${this.videos.length !== 1 ? "s" : ""}
      </span>
    `;

      this.panel.appendChild(header);

      this.scroll = document.createElement("div");
      this.scroll.className = "ytp-playlist-scroll";

      this.panel.appendChild(this.scroll);

      this.panel.setAttribute(
        "style",
        `${this.themeVars}width:${this.iframeStyle.width}`
      );

      this.parent.insertBefore(this.panel, this.wrapper.nextSibling);
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    _bindEvents() {
      this.toggleButton.addEventListener("click", () => this.togglePanel());

      window.addEventListener("message", this._onMessage);

      this.iframe.addEventListener("load", this._onIframeLoad);
    }

    _onIframeLoad() {
      subscribeToPlayer(this.iframe);
    }

    _onMessage(e) {
      if (!e.origin.includes("youtube.com")) return;
      if (e.source !== this.iframe.contentWindow) return;

      try {
        const data = JSON.parse(e.data);

        if (data.event === "infoDelivery" && data.info?.playerState === 1) {
          this._handlePlaying(data.info);
        }
      } catch {}
    }

    _handlePlaying(info) {
      const playlistIndex = info?.playlistIndex;

      // Premier lancement uniquement.
      //
      // YouTube peut avoir démarré sur la première vidéo alors que
      // currentIndex correspond à la vidéo indiquée par l'URL.
      if (!this.initialSyncDone) {
        this.initialSyncDone = true;

        if (playlistIndex !== this.currentIndex) {
          this.playVideoAt(this.currentIndex);
          return;
        }
      }

      // Synchronisation de l'élément sélectionné avec le player YouTube.
      if (playlistIndex !== this.currentIndex) {
        this.currentIndex = playlistIndex;
        this.renderItems();
      }
    }

    // -------------------------------------------------------------------------
    // Panel
    // -------------------------------------------------------------------------

    togglePanel() {
      this.isPanelOpen = !this.isPanelOpen;

      this.panel.classList.toggle("is-open", this.isPanelOpen);

      this.toggleButton.classList.toggle("is-active", this.isPanelOpen);

      this.toggleButton.setAttribute("aria-expanded", String(this.isPanelOpen));
    }

    // -------------------------------------------------------------------------
    // Playlist
    // -------------------------------------------------------------------------

    renderItems() {
      this.scroll.innerHTML = "";

      this.videos.forEach((video, index) => {
        const item = this.createItem(video, index);

        this.scroll.appendChild(item);
      });
    }

    createItem(video, index) {
      const item = document.createElement("div");

      item.className =
        "ytp-item" + (index === this.currentIndex ? " is-active" : "");

      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      item.setAttribute("aria-label", video.title);

      item.innerHTML = `
      <div class="ytp-thumb">
        <img
          src="${video.thumbnailUrl}"
          alt=""
          loading="lazy"
          onerror="this.style.opacity=0"
        >

        <div class="ytp-thumb-num">
          ${index + 1}
        </div>
      </div>

      <div class="ytp-item-info">
        <div class="ytp-item-title">
          ${video.title}
        </div>

        <div class="ytp-item-ch">
          ${video.channel || ""}
        </div>

        <div class="ytp-playing">
          <div class="ytp-bars">
            <span></span>
            <span></span>
            <span></span>
          </div>

          Now playing
        </div>
      </div>
    `;

      item.addEventListener("click", () => this.activate(index));

      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          this.activate(index);
        }
      });

      return item;
    }

    activate(index) {
      this.currentIndex = index;

      this.playVideoAt(index);

      this.renderItems();

      this.scrollToActiveItem();
    }

    playVideoAt(index) {
      sendPlayVideoAt(this.iframe, index);
    }

    scrollToActiveItem() {
      this.scroll
        .querySelectorAll(".ytp-item")
        [this.currentIndex]?.scrollIntoView({
          block: "nearest",
          behavior: "smooth"
        });
    }

    // -------------------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------------------

    destroy() {
      window.removeEventListener("message", this._onMessage);

      this.iframe.removeEventListener("load", this._onIframeLoad);

      this.panel?.remove();
      this.wrapper?.remove();

      this.iframe.removeAttribute("data-ytp-wrapped");
    }
  }

  class YTPlaylist {
    static VERSION = "1.0.6";

    constructor(options = {}) {
      if (!options.apiKey) {
        Logger.error("[YTPlaylist] options.apiKey is required.");
        return;
      }
      this._apiKey = options.apiKey;
      this._scope = options.scope ?? null;
      this._customCSS = options.css ?? null;
      this._themeVars = buildThemeVars(options.theme ?? {});
      this._onVideosFound = options.onVideosFound ?? null;
      this._onError = options.onError ?? null;

      // Unique style tag ID — allows multiple widget instances on the same page
      this._styleId = `ytp-style-${Math.random().toString(36).slice(2, 9)}`;
      this._initialized = false;

      this._frames = [];
      this._init();
    }

    async _init() {
      if (this._initialized) return;
      this._initialized = true;

      const styleContent = this._customCSS ?? DEFAULT_CSS;
      injectGlobalCSS(styleContent, this._styleId);

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this.scan());
      } else {
        await this.scan();
      }
    }
    async scan() {
      if (this._scanning) return;
      this._scanning = true;

      const root = resolveScope(this._scope);
      const frames = queryYouTubeIframes(root);

      for (const iframe of frames) {
        try {
          if (iframe.hasAttribute("data-ytp-wrapped")) {
            continue;
          }

          const videos = await getVideosFromEmbedSrc(iframe.src, this._apiKey);
          if (videos.length > 0) {
            let startIndex = getStartIndexFromIframe(iframe.src);
            startIndex = normalizeStartIndex(startIndex);

            this._onVideosFound?.({
              videos,
              iframe,
              startIndex
            });

            // post message api
            ensureIframeHasJsApiEnabled(iframe);

            const instance = new FrameWithPlaylist(
              iframe,
              videos,
              startIndex,
              this._themeVars
            );
            this._frames.push(instance);
          }
        } catch (err) {
          Logger.error("[YTPlaylist] scan error:", err);
          this._onError?.(err, iframe);
        }
      }

      this._scanning = false;
    }
  }

  return YTPlaylist;

}));
