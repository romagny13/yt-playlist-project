(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.YTPlaylist = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
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

  const Cache = {
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
        Logger.warn("[YTPlaylistWidget] Cache write failed:", e.message);
      }
    }
  };

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
  // YouTube Data API helpers
  // ---------------------------------------------------------------------------

  // function pour obtenir les infos des videos (par video ids)
  async function fetchVideosByIds(ids, apiKey) {
    const videos = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50).join(",");
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${chunk}&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok)
        throw new Error(`YouTube API ${res.status}: ${res.statusText}`);
      const data = await res.json();
      data.items?.forEach((v) => {
        // public | unlisted | private
        if (v.status?.privacyStatus === "private") return;
        videos.push({
          id: v.id,
          title: v.snippet.title,
          channel: v.snippet.channelTitle || "",
          thumb:
            v.snippet.thumbnails?.medium?.url ||
            v.snippet.thumbnails?.default?.url ||
            ""
        });
      });
    }
    return videos;
  }

  // function pour obtenir les video ids à partir d'un (play)list id
  async function fetchPlaylistVideoIds(playlistId, apiKey) {
    const ids = [];
    let pageToken = "";
    do {
      const url =
        `https://www.googleapis.com/youtube/v3/playlistItems?` +
        `part=snippet&maxResults=50&playlistId=${playlistId}&pageToken=${pageToken}&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok)
        throw new Error(`YouTube API ${res.status}: ${res.statusText}`);
      const data = await res.json();
      data.items?.forEach((item) => {
        const id = item.snippet.resourceId?.videoId;
        if (id) ids.push(id);
      });
      pageToken = data.nextPageToken || "";
    } while (pageToken);

    return ids;
  }

  // fallback
  function fetchVideosByIdsNoKey(ids) {
    return ids.map((id, i) => ({
      id,
      title: `Vidéo ${i + 1}`,
      channel: "",
      thumb: `https://img.youtube.com/vi/${id}/mqdefault.jpg`
    }));
  }

  function getVideoIdsFromParam(playlistParam) {
    return playlistParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }

  async function resolveVideosForIframe(iframe, apiKey) {
    const src = iframe.src || iframe.getAttribute("src") || "";
    if (!src.includes("youtube.com/embed")) return [];

    const url = new URL(src, location.href);

    // Cache key
    // playlist => video ids séparés par virgules src="https://www.youtube.com/embed?playlist=at9-Gm1-MWQ,hyB__9470KU,Enevxnnn114,8gjDQdy7ysE,GgNTzHi4xtQ"
    const playlistParam = url.searchParams.get("playlist");
    // list =>  seulement playlist id   src="https://www.youtube.com/embed/videoseries?si=L-oUYx0Lbeagd0HT&amp;list=PLRVWztDBSD_Jh0PwXtJ0wBP0TLtHga1_Y"
    const listParam = url.searchParams.get("list");
    const cacheKey = playlistParam ?? listParam;

    if (cacheKey) {
      const cached = Cache.get(cacheKey);
      if (cached) {
        // Logger.log(`[YTPlaylistWidget] Cache hit for "${cacheKey}"`);
        return cached;
      }
    }

    let videos = [];
    let ids = [];
    try {
      // video ids
      if (playlistParam) {
        ids = getVideoIdsFromParam(playlistParam);
      } else if (listParam) {
        ids = await fetchPlaylistVideoIds(listParam, apiKey);
      }
      // video infos
      if (ids.length) videos = await fetchVideosByIds(ids, apiKey);
      if (cacheKey && videos.length > 0) {
        Cache.set(cacheKey, videos);
      }
    } catch (error) {
      if (ids.length) videos = fetchVideosByIdsNoKey(ids);
    }
    return videos;
  }

  // ---------------------------------------------------------------------------
  // Start index resolution (pure, testable)
  // ---------------------------------------------------------------------------

  /**
   * Extrait la valeur brute du paramètre "index" depuis une URL d'iframe (string ou URL).
   * Retourne null si absent ou invalide.
   */
  function parseIndexParam(src) {
    try {
      const url = src instanceof URL ? src : new URL(src, location.href);
      const raw = url.searchParams.get("index");
      const idx = parseInt(raw, 10);
      // URL YouTube : index 1-based. On ne valide que le format ici.
      return Number.isInteger(idx) && idx >= 1 ? idx : null;
    } catch {
      return null;
    }
  }

  /** Convertit un index 1-based (URL YouTube) en index 0-based (tableau JS). */
  function toZeroBasedIndex(oneBasedIndex) {
    return oneBasedIndex - 1;
  }

  /** Borne un index dans [0, length-1] ; retourne 0 si hors bornes ou liste vide. */
  function clampIndex(index, length) {
    if (!Number.isInteger(index) || index < 0 || index >= length) return 0;
    return index;
  }

  /**
   * Détermine l'index de départ (0-based) à afficher/forcer pour une iframe donnée,
   * borné à la taille de la liste de vidéos.
   */
  function getStartIndexFromIframe(iframe, videosLength) {
    const src = iframe.src || iframe.getAttribute("src") || "";
    const oneBasedIndex = parseIndexParam(src);
    if (oneBasedIndex === null) return 0;
    return clampIndex(toZeroBasedIndex(oneBasedIndex), videosLength);
  }

  // ---------------------------------------------------------------------------
  // Player messaging helpers (pure-ish, testable — dépendance iframe injectée)
  // ---------------------------------------------------------------------------

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

  /** Valide qu'un message postMessage vient bien du player YouTube attendu. */
  function isMessageFromPlayer(e, iframe) {
    return Boolean(
      e &&
        iframe &&
        typeof e.origin === "string" &&
        e.origin.includes("youtube.com") &&
        e.source === iframe.contentWindow
    );
  }

  /** Parse le payload JSON d'un event postMessage YouTube. Retourne null si invalide. */
  function parsePlayerMessageData(e) {
    try {
      return JSON.parse(e.data);
    } catch {
      return null;
    }
  }

  /** Combine validation + parsing pour un event postMessage donné. */
  function readPlayerMessage(e, iframe) {
    if (!isMessageFromPlayer(e, iframe)) return null;
    return parsePlayerMessageData(e);
  }

  /** Extrait un playlistIndex valide (>= 0) d'un message "infoDelivery", sinon null. */
  function extractPlaylistIndex(data) {
    if (!data || data.event !== "infoDelivery") return null;
    const idx = data.info?.playlistIndex;
    return typeof idx === "number" && idx >= 0 ? idx : null;
  }

  // ---------------------------------------------------------------------------
  // Panel builder
  // ---------------------------------------------------------------------------

  function createPlaylistIndexState(iframe, videos) {
    let currentIndex = getStartIndexFromIframe(iframe, videos.length);
    // true dès que le player a été forcé (ou n'avait pas besoin de l'être)
    let hasSyncedStartIndex = currentIndex === 0;

    return {
      get: () => currentIndex,
      set: (value) => {
        currentIndex = value;
      },
      hasSyncedStart: () => hasSyncedStartIndex,
      markStartSynced: () => {
        hasSyncedStartIndex = true;
      }
    };
  }

  function buildPanelHeaderHTML(videoCount) {
    const label = `${videoCount} video${videoCount !== 1 ? "s" : ""}`;
    return `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--ytp-accent)">
                <path d="M21.543 6.498C22 8.28 22 12 22 12s0 3.72-.457 5.502c-.254.985-.997 1.76-1.938 2.022C17.896 20 12 20 12 20s-5.895 0-7.605-.476c-.940-.262-1.684-1.037-1.938-2.022C2 15.72 2 12 2 12s0-3.72.457-5.502c.254-.985.997-1.76 1.938-2.022C6.105 4 12 4 12 4s5.896 0 7.605.476c.941.262 1.684 1.037 1.938 2.022z"/>
                <path d="M10 15l5.19-3L10 9v6z" fill="#fff"/>
            </svg>
            Playlist <span class="ytp-count">${label}</span>`;
  }

  function buildPlaylistItemHTML(video, position) {
    return `
                    <div class="ytp-thumb">
                        <img src="${video.thumb}" alt="" loading="lazy" onerror="this.style.opacity=0">
                        <div class="ytp-thumb-num">${position}</div>
                    </div>
                    <div class="ytp-item-info">
                        <div class="ytp-item-title">${video.title}</div>
                        <div class="ytp-item-ch">${video.channel || ""}</div>
                        <div class="ytp-playing">
                            <div class="ytp-bars"><span></span><span></span><span></span></div>
                            Now playing
                        </div>
                    </div>`;
  }

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

  function createIframeWrapper(iframe) {
    const parent = iframe.parentNode;
    const iframeStyle = window.getComputedStyle(iframe);
    const isAbsolute = iframeStyle.position === "absolute";

    const wrapper = document.createElement("div");
    wrapper.className = "ytp-ext-wrapper";

    if (isAbsolute) {
      wrapper.style.cssText = `position:absolute;top:${iframeStyle.top};left:${iframeStyle.left};width:${iframeStyle.width};height:${iframeStyle.height};`;
      iframe.style.position = "relative";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
    } else {
      wrapper.style.cssText = `position:relative;display:inline-block;width:${iframeStyle.width};`;
    }

    const placeholder = document.createElement("div");
    placeholder.style.cssText = `width:${iframeStyle.width};height:${iframeStyle.height};background:#000;display:block;`;
    parent.insertBefore(wrapper, iframe);
    wrapper.appendChild(placeholder);
    requestAnimationFrame(() => wrapper.replaceChild(iframe, placeholder));

    return { wrapper, iframeStyle, parent };
  }

  function createToggleButton() {
    const btn = document.createElement("button");
    btn.className = "ytp-panel-toggle";
    btn.setAttribute("aria-label", "Toggle playlist panel");
    btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M3 5.5h18v2H3zm0 5.5h18v2H3zm0 5.5h18v2H3z" stroke="currentColor" stroke-width="0.8"/></svg>`;
    return btn;
  }

  function createPlaylistPanel(videos, themeVars, widthCss) {
    const panel = document.createElement("div");
    panel.className = "ytp-playlist-panel";

    const header = document.createElement("div");
    header.className = "ytp-panel-header";
    header.innerHTML = buildPanelHeaderHTML(videos.length);
    panel.appendChild(header);

    const scroll = document.createElement("div");
    scroll.className = "ytp-playlist-scroll";
    panel.appendChild(scroll);

    panel.setAttribute("style", `${themeVars} width:${widthCss}`);

    return { panel, scroll };
  }

  function attachPanel(iframe, videos, themeVars) {
    iframe.setAttribute("data-ytp-wrapped", "1");

    const { wrapper, iframeStyle, parent } = createIframeWrapper(iframe);
    wrapper.setAttribute("style", wrapper.getAttribute("style") + themeVars);

    ensureIframeHasJsApiEnabled(iframe);

    const btn = createToggleButton();
    wrapper.appendChild(btn);

    const { panel, scroll } = createPlaylistPanel(
      videos,
      themeVars,
      iframeStyle.width
    );
    parent.insertBefore(panel, wrapper.nextSibling);

    const indexState = createPlaylistIndexState(iframe, videos);
    let isPanelOpen = false;

    function scrollToActiveItem(behavior = "smooth") {
      scroll
        .querySelectorAll(".ytp-item")
        [indexState.get()]?.scrollIntoView({ block: "nearest", behavior });
    }

    function renderItems() {
      scroll.innerHTML = "";
      videos.forEach((video, i) => {
        const item = document.createElement("div");
        item.className =
          "ytp-item" + (i === indexState.get() ? " is-active" : "");
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        item.setAttribute("aria-label", video.title);
        item.innerHTML = buildPlaylistItemHTML(video, i + 1);

        const activate = () => {
          indexState.markStartSynced();
          sendPlayVideoAt(iframe, i);
          setActiveIndex(i);
        };

        item.addEventListener("click", activate);
        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") activate();
        });
        scroll.appendChild(item);
      });
    }

    function setActiveIndex(newIndex) {
      if (newIndex === indexState.get()) return;
      indexState.set(newIndex);
      renderItems();
      scrollToActiveItem();
    }

    /**
     * Réagit à un playlistIndex rapporté par le player.
     * Au tout premier rapport, si l'index réel du player diverge de l'index de
     * départ demandé (via l'URL), on force activement playVideoAt plutôt que
     * de se contenter d'attendre : YouTube n'honore pas toujours "index=" seul
     * (ex: playlist=id1,id2,... sans list=, ou léger délai côté player).
     */
    function handlePlaylistIndexReported(playlistIndex) {
      if (!indexState.hasSyncedStart()) {
        indexState.markStartSynced();
        if (playlistIndex !== indexState.get()) {
          sendPlayVideoAt(iframe, indexState.get());
          return; // on attend le prochain rapport pour confirmer le saut
        }
      }
      setActiveIndex(playlistIndex);
    }

    function handlePlayerMessage(e) {
      const data = readPlayerMessage(e, iframe);
      const playlistIndex = extractPlaylistIndex(data);
      if (playlistIndex === null) return;
      handlePlaylistIndexReported(playlistIndex);
    }

    function handleToggleClick() {
      isPanelOpen = !isPanelOpen;
      panel.classList.toggle("is-open", isPanelOpen);
      btn.classList.toggle("is-active", isPanelOpen);
      btn.setAttribute("aria-expanded", String(isPanelOpen));
      if (isPanelOpen) scrollToActiveItem("auto");
    }

    btn.addEventListener("click", handleToggleClick);
    window.addEventListener("message", handlePlayerMessage);
    iframe.addEventListener("load", () => subscribeToPlayer(iframe));

    renderItems();
  }

  // ---------------------------------------------------------------------------
  // Main class
  // ---------------------------------------------------------------------------

  class YTPlaylist {
    static VERSION = "1.0.4";

    constructor(options = {}) {
      if (!options.apiKey) {
        Logger.error("[YTPlaylistWidget] options.apiKey is required.");
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

      const root = this._resolveScope();
      const frames = this._queryIframes(root);

      for (const iframe of frames) {
        try {
          const videos = await resolveVideosForIframe(iframe, this._apiKey);
          if (videos.length > 0) {
            this._onVideosFound?.({
              videos,
              iframe,
              isFirstScan: this.isFirstScan
            });
            attachPanel(iframe, videos, this._themeVars);
          }
        } catch (err) {
          Logger.error("[YTPlaylistWidget] scan error:", err);
          this._onError?.(err, iframe);
        }
      }

      this.isFirstScan = false;
      this._scanning = false;
    }

    _resolveScope() {
      if (!this._scope) return document;
      const el = document.querySelector(this._scope);
      if (!el)
        Logger.warn(
          `[YTPlaylistWidget] scope "${this._scope}" not found, falling back to document.`
        );
      return el ?? document;
    }

    /** Returns all YouTube embed iframes that haven't been processed yet. */
    _queryIframes(root) {
      return root.querySelectorAll(
        'iframe[src*="youtube.com/embed"]:not([data-ytp-wrapped])'
      );
    }
  }

  YTPlaylist.__internals = {
    Cache,
    getVideoIdsFromParam,
    fetchVideosByIdsNoKey,
    resolveVideosForIframe,
    parseIndexParam,
    toZeroBasedIndex,
    clampIndex,
    getStartIndexFromIframe,
    isMessageFromPlayer,
    parsePlayerMessageData,
    readPlayerMessage,
    extractPlaylistIndex
  };

  return YTPlaylist;
});