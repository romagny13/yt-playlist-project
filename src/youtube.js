// youtube.js

import { isString } from "./utils";
import { createCache } from "./cache";
import { Logger } from "./Logger";

const videoCache = createCache({ prefix: "ytp_" });

const YOUTUBE_EMBED_PATH = "youtube.com/embed";

/**
 * Playlist partagée depuis la page détails de la playlist sur youtube.com.
 * https://www.youtube.com/embed/videoseries?si={SHARE_ID}&list={PLAYLIST_ID}
 */
export function isSharedPlaylistEmbedUrl(src) {
  return isString(getEmbedSearchParam(src, "list"));
}

/**
 * Liste de video ids.
 * https://www.youtube.com/embed?playlist={video_ID1},{video_ID2},...
 */
export function isVideoIdListEmbedUrl(src) {
  return isString(getEmbedSearchParam(src, "playlist"));
}

export function getVideoIdsFromEmbedUrl(src) {
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
export function getEmbedSearchParam(src, paramName) {
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
export function getStartIndexFromIframe(src) {
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
export async function fetchVideoIdsFromPlaylist(playlistId, apiKey) {
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

export async function fetchVideosByIds(videoIds, apiKey) {
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
export function buildFallbackVideos(videoIds) {
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

export async function getVideosFromEmbedSrc(src, apiKey) {
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
