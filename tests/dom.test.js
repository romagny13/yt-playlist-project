// tests/dom.test.js
import { resolveScope, queryYouTubeIframes } from "../src/dom.js";

describe("resolveScope", () => {
  beforeEach(() => {
    // On prépare un DOM propre avant chaque test
    document.body.innerHTML = `
      <div id="container">
        <p class="item">Hello</p>
      </div>
    `;
  });

  test("retourne document quand aucun argument n’est fourni", () => {
    expect(resolveScope()).toBe(document);
    expect(resolveScope(null)).toBe(document);
    expect(resolveScope(undefined)).toBe(document);
  });

  test("retourne l’élément trouvé avec un sélecteur CSS (string)", () => {
    const element = resolveScope("#container");
    expect(element).toBeInstanceOf(HTMLElement);
    expect(element.id).toBe("container");

    const paragraph = resolveScope(".item");
    expect(paragraph.textContent).toBe("Hello");
  });

  test("lance une erreur si le sélecteur ne trouve rien", () => {
    expect(() => {
      resolveScope("#does-not-exist");
    }).toThrow(
      '[YTPlaylist] Element not found for selector: "#does-not-exist"'
    );
  });

  test("retourne l’élément tel quel s’il s’agit déjà d’un HTMLElement", () => {
    const existingElement = document.getElementById("container");
    const result = resolveScope(existingElement);

    expect(result).toBe(existingElement); // même référence
  });

  test("accepte aussi un objet qui ressemble à un élément (cas rare)", () => {
    const fakeElement = { nodeType: 1, tagName: "DIV" };
    expect(resolveScope(fakeElement)).toBe(fakeElement);
  });
});


describe('queryYouTubeIframes', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="scope">
        <iframe src="https://www.youtube.com/embed/abc123"></iframe>
        <iframe src="https://www.youtube-nocookie.com/embed/def456"></iframe>
        <iframe src="https://example.com/video"></iframe>
        <iframe src="https://www.youtube.com/embed/videoseries?list=PLxxx"></iframe>
      </div>
    `;
  });

  test('retourne toutes les iframes YouTube', () => {
    const iframes = queryYouTubeIframes(document.getElementById('scope'));
    
    expect(iframes).toHaveLength(3);
    expect(iframes[0].src).toContain('youtube.com/embed/abc123');
    expect(iframes[1].src).toContain('youtube-nocookie.com');
  });

  test('retourne un tableau vide si aucune iframe YouTube', () => {
    document.body.innerHTML = `<div id="empty"><p>Rien</p></div>`;
    const iframes = queryYouTubeIframes(document.getElementById('empty'));
    expect(iframes).toEqual([]);
  });

  test('fonctionne avec document par défaut', () => {
    const iframes = queryYouTubeIframes();
    expect(iframes.length).toBeGreaterThan(0);
  });
});