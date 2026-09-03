// youtube.test.js

import { jest } from "@jest/globals";
import {
    buildFallbackVideos,
  fetchVideoIdsFromPlaylist,
  fetchVideosByIds,
  getStartIndexFromIframe,
  getVideoIdsFromEmbedUrl,
  getVideosFromEmbedSrc,
  isSharedPlaylistEmbedUrl,
  isVideoIdListEmbedUrl
} from "../src/youtube.js";

describe("isSharedPlaylistEmbedUrl", () => {
  it("retourne true pour un embed avec param list", () => {
    const src =
      "https://www.youtube.com/embed/videoseries?si=abc123&list=PLxyz";
    expect(isSharedPlaylistEmbedUrl(src)).toBe(true);
  });

  it("retourne false si le param list est absent", () => {
    const src = "https://www.youtube.com/embed/videoseries?si=abc123";
    expect(isSharedPlaylistEmbedUrl(src)).toBe(false);
  });

  it("retourne false si ce n'est pas une URL embed youtube", () => {
    const src = "https://www.youtube.com/watch?v=abc123&list=PLxyz";
    expect(isSharedPlaylistEmbedUrl(src)).toBe(false);
  });

  it("fonctionne avec une URL relative (résolue via location.href)", () => {
    const src = "/embed/videoseries?list=PLxyz";
    // youtube.com/embed n'étant pas présent dans le chemin relatif,
    // isSharedPlaylistEmbedUrl doit retourner false ici
    expect(isSharedPlaylistEmbedUrl(src)).toBe(false);
  });

  it("retourne false pour une URL invalide", () => {
    const src = "youtube.com/embed?list=";
    // string, contient "youtube.com/embed", mais list="" est bien une string -> true
    expect(isSharedPlaylistEmbedUrl(src)).toBe(true);
  });

  it("retourne false si src n'est pas une string", () => {
    expect(isSharedPlaylistEmbedUrl(null)).toBe(false);
    expect(isSharedPlaylistEmbedUrl(undefined)).toBe(false);
    expect(isSharedPlaylistEmbedUrl(123)).toBe(false);
  });
});

describe("isVideoIdListEmbedUrl", () => {
  it("retourne true pour un embed avec param playlist", () => {
    const src = "https://www.youtube.com/embed?playlist=id1,id2,id3";
    expect(isVideoIdListEmbedUrl(src)).toBe(true);
  });

  it("retourne false si le param playlist est absent", () => {
    const src = "https://www.youtube.com/embed?list=PLxyz";
    expect(isVideoIdListEmbedUrl(src)).toBe(false);
  });

  it("retourne false si ce n'est pas une URL embed youtube", () => {
    const src = "https://example.com/embed?playlist=id1,id2";
    expect(isVideoIdListEmbedUrl(src)).toBe(false);
  });

  it("retourne false si src n'est pas une string", () => {
    expect(isVideoIdListEmbedUrl(null)).toBe(false);
    expect(isVideoIdListEmbedUrl(undefined)).toBe(false);
  });
});

describe("getVideoIdsFromEmbedUrl", () => {
  it("retourne la liste des ids pour un embed valide", () => {
    const src = "https://www.youtube.com/embed?playlist=id1,id2,id3";
    expect(getVideoIdsFromEmbedUrl(src)).toEqual(["id1", "id2", "id3"]);
  });

  it("trim les espaces autour des ids", () => {
    const src = "https://www.youtube.com/embed?playlist=id1, id2 , id3";
    expect(getVideoIdsFromEmbedUrl(src)).toEqual(["id1", "id2", "id3"]);
  });

  it("filtre les ids vides (virgules successives)", () => {
    const src = "https://www.youtube.com/embed?playlist=id1,,id2,";
    expect(getVideoIdsFromEmbedUrl(src)).toEqual(["id1", "id2"]);
  });

  it("retourne un tableau vide si le param playlist est absent", () => {
    const src = "https://www.youtube.com/embed?list=PLxyz";
    expect(getVideoIdsFromEmbedUrl(src)).toEqual([]);
  });

  it("retourne un tableau vide si ce n'est pas une URL embed youtube", () => {
    const src = "https://example.com/embed?playlist=id1,id2";
    expect(getVideoIdsFromEmbedUrl(src)).toEqual([]);
  });

  it("retourne un tableau vide si src n'est pas une string", () => {
    expect(getVideoIdsFromEmbedUrl(null)).toEqual([]);
    expect(getVideoIdsFromEmbedUrl(undefined)).toEqual([]);
  });

  it("retourne un tableau vide si le param playlist est une chaîne vide", () => {
    const src = "https://www.youtube.com/embed?playlist=";
    expect(getVideoIdsFromEmbedUrl(src)).toEqual([]);
  });
});

describe("fetchVideoIdsFromPlaylist", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("récupère les ids sur une seule page", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { contentDetails: { videoId: "id1" } },
          { contentDetails: { videoId: "id2" } }
        ]
      })
    });

    const result = await fetchVideoIdsFromPlaylist("PLxyz", "API_KEY");

    expect(result).toEqual(["id1", "id2"]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("gère la pagination sur plusieurs pages", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ contentDetails: { videoId: "id1" } }],
          nextPageToken: "TOKEN2"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ contentDetails: { videoId: "id2" } }]
        })
      });

    const result = await fetchVideoIdsFromPlaylist("PLxyz", "API_KEY");

    expect(result).toEqual(["id1", "id2"]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toContain("pageToken=TOKEN2");
  });

  it("ignore les items sans videoId", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ contentDetails: {} }, { contentDetails: { videoId: "id1" } }]
      })
    });

    const result = await fetchVideoIdsFromPlaylist("PLxyz", "API_KEY");

    expect(result).toEqual(["id1"]);
  });

  it("retourne un tableau vide si items est absent", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    });

    const result = await fetchVideoIdsFromPlaylist("PLxyz", "API_KEY");

    expect(result).toEqual([]);
  });

  it("lève une erreur si la réponse n'est pas ok", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden"
    });

    await expect(fetchVideoIdsFromPlaylist("PLxyz", "BAD_KEY")).rejects.toThrow(
      "YouTube API 403: Forbidden"
    );
  });

  it("n'envoie pas de pageToken sur la première requête", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] })
    });

    await fetchVideoIdsFromPlaylist("PLxyz", "API_KEY");

    expect(global.fetch.mock.calls[0][0]).not.toContain("pageToken=");
  });
});

describe("fetchVideosByIds", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("retourne un tableau vide sans appeler fetch si videoIds est vide", async () => {
    const result = await fetchVideosByIds([], "API_KEY");

    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("récupère et mappe les vidéos pour un seul chunk", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "id1",
            snippet: {
              title: "Titre 1",
              channelTitle: "Chaîne 1",
              thumbnails: { medium: { url: "https://thumb/medium.jpg" } }
            },
            status: { privacyStatus: "public" }
          }
        ]
      })
    });

    const result = await fetchVideosByIds(["id1"], "API_KEY");

    expect(result).toEqual([
      {
        id: "id1",
        title: "Titre 1",
        channelTitle: "Chaîne 1",
        thumbnailUrl: "https://thumb/medium.jpg"
      }
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("découpe en plusieurs requêtes au-delà de 50 ids", async () => {
    const videoIds = Array.from({ length: 75 }, (_, i) => `id${i}`);
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });

    await fetchVideosByIds(videoIds, "API_KEY");

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toContain(
      encodeURIComponent(videoIds.slice(0, 50).join(","))
    );
    expect(global.fetch.mock.calls[1][0]).toContain(
      encodeURIComponent(videoIds.slice(50).join(","))
    );
  });

  it("exclut les vidéos privées", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "id1",
            snippet: { title: "Publique", channelTitle: "C1", thumbnails: {} },
            status: { privacyStatus: "public" }
          },
          {
            id: "id2",
            snippet: { title: "Privée", channelTitle: "C2", thumbnails: {} },
            status: { privacyStatus: "private" }
          },
          {
            id: "id3",
            snippet: {
              title: "Non répertoriée",
              channelTitle: "C3",
              thumbnails: {}
            },
            status: { privacyStatus: "unlisted" }
          }
        ]
      })
    });

    const result = await fetchVideosByIds(["id1", "id2", "id3"], "API_KEY");

    expect(result.map((v) => v.id)).toEqual(["id1", "id3"]);
  });

  it("utilise des chaînes vides si channelTitle ou thumbnails sont absents", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "id1",
            snippet: { title: "Titre 1" },
            status: { privacyStatus: "public" }
          }
        ]
      })
    });

    const result = await fetchVideosByIds(["id1"], "API_KEY");

    expect(result).toEqual([
      { id: "id1", title: "Titre 1", channelTitle: "", thumbnailUrl: "" }
    ]);
  });

  it("retombe sur le thumbnail default si medium est absent", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "id1",
            snippet: {
              title: "Titre 1",
              thumbnails: { default: { url: "https://thumb/default.jpg" } }
            },
            status: { privacyStatus: "public" }
          }
        ]
      })
    });

    const result = await fetchVideosByIds(["id1"], "API_KEY");

    expect(result[0].thumbnailUrl).toBe("https://thumb/default.jpg");
  });

  it("lève une erreur si la réponse n'est pas ok", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request"
    });

    await expect(fetchVideosByIds(["id1"], "API_KEY")).rejects.toThrow(
      "YouTube API 400: Bad Request"
    );
  });
});

describe("buildFallbackVideos", () => {
  it("retourne un tableau vide pour une liste vide", () => {
    expect(buildFallbackVideos([])).toEqual([]);
  });

  it("construit les infos avec un titre numéroté et un thumbnail public", () => {
    const result = buildFallbackVideos(["id1", "id2"]);

    expect(result).toEqual([
      {
        id: "id1",
        title: "Vidéo 1",
        channelTitle: "",
        thumbnailUrl: "https://img.youtube.com/vi/id1/mqdefault.jpg"
      },
      {
        id: "id2",
        title: "Vidéo 2",
        channelTitle: "",
        thumbnailUrl: "https://img.youtube.com/vi/id2/mqdefault.jpg"
      }
    ]);
  });

  it("préserve l'ordre et l'index même avec des doublons", () => {
    const result = buildFallbackVideos(["id1", "id1"]);

    expect(result[0].title).toBe("Vidéo 1");
    expect(result[1].title).toBe("Vidéo 2");
  });
});

describe("getVideosFromEmbedSrc", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    localStorage.clear();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("retourne un tableau vide si src n'est pas un embed reconnu", async () => {
    const result = await getVideosFromEmbedSrc("https://example.com", "API_KEY");
    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("récupère les vidéos via playlist ID (list=)", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ contentDetails: { videoId: "id1" } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "id1",
              snippet: { title: "Titre 1", thumbnails: {} },
              status: { privacyStatus: "public" },
            },
          ],
        }),
      });

    const src = "https://www.youtube.com/embed/videoseries?list=PLxyz";
    const result = await getVideosFromEmbedSrc(src, "API_KEY");

    expect(result).toEqual([
      { id: "id1", title: "Titre 1", channelTitle: "", thumbnailUrl: "" },
    ]);
  });

  it("récupère les vidéos via liste d'ids (playlist=)", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "idA",
            snippet: { title: "Titre A", thumbnails: {} },
            status: { privacyStatus: "public" },
          },
        ],
      }),
    });

    const src = "https://www.youtube.com/embed?playlist=idA";
    const result = await getVideosFromEmbedSrc(src, "API_KEY");

    expect(result[0].id).toBe("idA");
    expect(global.fetch).toHaveBeenCalledTimes(1); // pas d'appel playlistItems
  });

  it("retourne les résultats du cache sans appeler fetch", async () => {
    const src = "https://www.youtube.com/embed?playlist=idA";
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ id: "idA", snippet: { title: "Titre A", thumbnails: {} }, status: { privacyStatus: "public" } }],
      }),
    });

    await getVideosFromEmbedSrc(src, "API_KEY"); // remplit le cache
    global.fetch.mockClear();

    const result = await getVideosFromEmbedSrc(src, "API_KEY");

    expect(result[0].id).toBe("idA");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("retombe sur le fallback si l'API échoue mais que des videoIds sont connus", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: "Forbidden" });

    const src = "https://www.youtube.com/embed?playlist=idA,idB";
    const result = await getVideosFromEmbedSrc(src, "API_KEY");

    expect(result).toEqual([
      { id: "idA", title: "Vidéo 1", channelTitle: "", thumbnailUrl: "https://img.youtube.com/vi/idA/mqdefault.jpg" },
      { id: "idB", title: "Vidéo 2", channelTitle: "", thumbnailUrl: "https://img.youtube.com/vi/idB/mqdefault.jpg" },
    ]);
  });

  it("retourne un tableau vide si l'API échoue avant même d'avoir des videoIds (playlist)", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Server Error" });

    const src = "https://www.youtube.com/embed/videoseries?list=PLxyz";
    const result = await getVideosFromEmbedSrc(src, "API_KEY");

    expect(result).toEqual([]);
  });

  it("ne met pas en cache un résultat vide", async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });

    const src = "https://www.youtube.com/embed?playlist=idA";
    await getVideosFromEmbedSrc(src, "API_KEY");
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ id: "idA", snippet: { title: "Titre A", thumbnails: {} }, status: { privacyStatus: "public" } }],
      }),
    });

    const result = await getVideosFromEmbedSrc(src, "API_KEY");

    expect(global.fetch).toHaveBeenCalledTimes(2); // pas de hit cache la 2e fois
    expect(result[0].id).toBe("idA");
  });
});

describe('getStartIndexFromIframe', () => {
  it('retourne l\'index converti en nombre si trouvé dans une URL embed YouTube', () => {
    const src = 'https://www.youtube.com/embed/dQw4w9WgXcQ?index=5';
    expect(getStartIndexFromIframe(src)).toBe(5);
  });

  it('retourne 0 si le paramètre index est absent', () => {
    const src = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
    expect(getStartIndexFromIframe(src)).toBe(0);
  });

  it('retourne 0 si l\'URL n\'est pas un embed YouTube', () => {
    const src = 'https://example.com/embed?index=7';
    expect(getStartIndexFromIframe(src)).toBe(0);
  });

  it('retourne 0 si src est vide, null ou undefined', () => {
    expect(getStartIndexFromIframe('')).toBe(0);
    expect(getStartIndexFromIframe(null)).toBe(0);
    expect(getStartIndexFromIframe(undefined)).toBe(0);
  });

  it('gère plusieurs paramètres dans une URL embed YouTube valide', () => {
    const src = 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&index=7&muted=0';
    expect(getStartIndexFromIframe(src)).toBe(7);
  });

  it('retourne l\'index correctement même si égal à "0"', () => {
    const src = 'https://www.youtube.com/embed/dQw4w9WgXcQ?index=0';
    expect(getStartIndexFromIframe(src)).toBe(0);
  });

  it('parse une valeur avec des caractères non numériques à la fin', () => {
    const src = 'https://www.youtube.com/embed/dQw4w9WgXcQ?index=12abc';
    expect(getStartIndexFromIframe(src)).toBe(12);
  });

  it('retourne NaN si la valeur n\'est pas du tout numérique', () => {
    const src = 'https://www.youtube.com/embed/dQw4w9WgXcQ?index=abc';
    expect(getStartIndexFromIframe(src)).toBeNaN();
  });

  it('gère un index avec un grand nombre', () => {
    const src = 'https://www.youtube.com/embed/dQw4w9WgXcQ?index=99999';
    expect(getStartIndexFromIframe(src)).toBe(99999);
  });
});