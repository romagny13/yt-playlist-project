import { jest } from "@jest/globals";
import { createCache } from "../src/cache";

function createFakeStorage() {
  const store = new Map();
  return {
    getItem: jest.fn((key) => store.get(key) ?? null),
    setItem: jest.fn((key, value) => store.set(key, value)),
    removeItem: jest.fn((key) => store.delete(key))
  };
}

describe("createCache", () => {
  it("lève une erreur si prefix est absent", () => {
    expect(() => createCache({})).toThrow("prefix");
  });

  it("retourne null si la clé n'existe pas", () => {
    const cache = createCache({
      prefix: "test_",
      storage: createFakeStorage()
    });
    expect(cache.get("missing")).toBeNull();
  });

  it("stocke et récupère une valeur", () => {
    const cache = createCache({
      prefix: "test_",
      storage: createFakeStorage()
    });
    cache.set("id1", { foo: "bar" });
    expect(cache.get("id1")).toEqual({ foo: "bar" });
  });

  it("préfixe bien la clé de storage", () => {
    const storage = createFakeStorage();
    const cache = createCache({ prefix: "test_", storage });
    cache.set("id1", { foo: "bar" });
    expect(storage.setItem).toHaveBeenCalledWith(
      "test_id1",
      expect.any(String)
    );
  });

  it("retourne null et supprime l'entrée si elle est expirée", () => {
    const storage = createFakeStorage();
    const cache = createCache({ prefix: "test_", ttlMs: 1000, storage });

    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(now);
    cache.set("id1", { foo: "bar" });

    jest.spyOn(Date, "now").mockReturnValue(now + 2000);
    expect(cache.get("id1")).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith("test_id1");

    Date.now.mockRestore();
  });

  it("retourne null si le JSON stocké est corrompu", () => {
    const storage = createFakeStorage();
    storage.getItem.mockReturnValueOnce("not valid json");
    const cache = createCache({ prefix: "test_", storage });

    expect(cache.get("id1")).toBeNull();
  });

  it("ne stocke rien si data est null ou undefined", () => {
    const storage = createFakeStorage();
    const cache = createCache({ prefix: "test_", storage });

    cache.set("id1", null);
    cache.set("id2", undefined);

    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("ne fait rien si key est falsy", () => {
    const storage = createFakeStorage();
    const cache = createCache({ prefix: "test_", storage });

    expect(cache.get("")).toBeNull();
    cache.set("", { foo: "bar" });
    cache.remove("");

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("n'explose pas si setItem lève une exception (quota dépassé)", () => {
    const storage = createFakeStorage();
    storage.setItem.mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });
    const cache = createCache({ prefix: "test_", storage });

    expect(() => cache.set("id1", { foo: "bar" })).not.toThrow();
  });

  it("remove supprime bien l'entrée", () => {
    const storage = createFakeStorage();
    const cache = createCache({ prefix: "test_", storage });

    cache.set("id1", { foo: "bar" });
    cache.remove("id1");

    expect(cache.get("id1")).toBeNull();
  });
});
