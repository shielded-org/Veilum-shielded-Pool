/** Safe chrome.storage.local access — works in extension popup; falls back in Vite dev. */

type StorageArea = {
  get: (keys: string | string[] | Record<string, unknown> | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

const memory = new Map<string, unknown>();

function devStorage(): StorageArea {
  return {
    async get(keys) {
      if (keys == null) {
        return Object.fromEntries(memory);
      }
      if (typeof keys === "string") {
        return keys in memory ? { [keys]: memory.get(keys) } : {};
      }
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {};
        for (const k of keys) {
          if (memory.has(k)) out[k] = memory.get(k);
        }
        return out;
      }
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(keys)) {
        if (memory.has(k)) out[k] = memory.get(k);
      }
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) memory.set(k, v);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) memory.delete(k);
    },
  };
}

export function getChromeStorageLocal(): StorageArea {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    return chrome.storage.local;
  }
  return devStorage();
}
