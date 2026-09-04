import { createCache } from "./cache";
import { resolveScope, queryYouTubeIframes } from "./dom";
import { Logger } from "./Logger";
import { getStartIndexFromIframe, getVideosFromEmbedSrc } from "./youtube";
import {
  ensureIframeHasJsApiEnabled,
  subscribeToPlayer,
  sendPlayVideoAt,
  normalizeStartIndex
} from "./player-messaging.js";

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
        `top:0;` +
        `left:0;` +
        `width:100%;` +
        `height:100%;`;

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

    if (this.isAbsolute) {
      placeholder.style.cssText =
        `width:100%;` + `height:100%;` + `background:#000;` + `display:block;`;
    } else {
      placeholder.style.cssText =
        `width:${this.iframeStyle.width};` +
        `height:${this.iframeStyle.height};` +
        `background:#000;` +
        `display:block;`;
    }

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

    // au lieu de : this.parent.insertBefore(this.panel, this.wrapper.nextSibling);
    this.parent.parentNode.insertBefore(this.panel, this.parent.nextSibling);
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
    const ALLOWED_ORIGINS = [
      "https://www.youtube.com",
      "https://www.youtube-nocookie.com"
    ];
    if (!ALLOWED_ORIGINS.includes(e.origin)) return;
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
          ${video.channelTitle || ""}
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
  static VERSION = "1.0.9";

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

    this._cache = options.cache ?? createCache({ prefix: "ytp_" });

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

    this._cleanupOrphans();

    const root = resolveScope(this._scope);
    const frames = queryYouTubeIframes(root);

    for (const iframe of frames) {
      try {
        if (iframe.hasAttribute("data-ytp-wrapped")) {
          continue;
        }

        const videos = await getVideosFromEmbedSrc(
          iframe.src,
          this._apiKey,
          this._cache
        );
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

  _cleanupOrphans() {
    this._frames = this._frames.filter((frame) => {
      const stillInDom = document.body.contains(frame.iframe);
      if (!stillInDom) {
        frame.destroy(); // supprime panel + wrapper + listeners orphelins
      }
      return stillInDom;
    });
  }
}

export default YTPlaylist;
