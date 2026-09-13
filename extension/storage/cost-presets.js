export const COST_PRESET_STORAGE_KEY = 'auctionCostPresetsV1';
export const DEFAULT_COST_PRESET_STORAGE_KEY = 'auctionDefaultCostPresetV1';
export const MAX_COST_PRESETS = 20;

const COST_FIELDS = Object.freeze([
  'marketplaceFee',
  'shipping',
  'tax',
  'repairs',
  'paymentProcessing',
  'holding'
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertStorageArea(storageArea) {
  if (!storageArea || typeof storageArea.get !== 'function' || typeof storageArea.set !== 'function' || typeof storageArea.remove !== 'function') {
    throw new TypeError('storageArea must provide get, set, and remove');
  }
  return storageArea;
}

function normalizeName(name) {
  const normalized = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized) throw new TypeError('preset name is required');
  if (normalized.length > 48) throw new TypeError('preset name must be 48 characters or fewer');
  return normalized;
}

function keyForName(name) {
  return normalizeName(name).toLocaleLowerCase('en-US');
}

function normalizePresetKey(value) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  return normalized || null;
}

function normalizeUpdatedAt(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('updatedAt must be a valid date');
  return date.toISOString();
}

function normalizeCosts(costs) {
  if (!costs || typeof costs !== 'object' || Array.isArray(costs)) {
    throw new TypeError('costs must be an object');
  }

  const normalized = {};
  for (const field of COST_FIELDS) {
    if (!(field in costs) || costs[field] === null || costs[field] === undefined || costs[field] === '') continue;
    const value = Number(costs[field]);
    if (!Number.isFinite(value)) throw new TypeError(`${field} must be finite`);
    if (value < 0) throw new TypeError(`${field} must be non-negative`);
    normalized[field] = value;
  }

  if (Object.keys(normalized).length === 0) {
    throw new TypeError('preset must include at least one explicit cost');
  }

  return Object.freeze(normalized);
}

function sanitizeStoredPreset(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('stored cost preset must be an object');
  }

  const name = normalizeName(candidate.name);
  const key = keyForName(name);
  if (candidate.key !== key) throw new TypeError('stored preset key does not match name');

  return Object.freeze({
    key,
    name,
    updatedAt: normalizeUpdatedAt(candidate.updatedAt),
    costs: normalizeCosts(candidate.costs)
  });
}

export function createCostPresetStore(storageArea, {
  now = () => new Date()
} = {}) {
  const storage = assertStorageArea(storageArea);
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  async function readPresets() {
    const stored = await storage.get(COST_PRESET_STORAGE_KEY);
    const raw = stored?.[COST_PRESET_STORAGE_KEY];
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) {
      await storage.set({ [COST_PRESET_STORAGE_KEY]: [] });
      return [];
    }

    const cleaned = [];
    const positions = new Map();
    let dirty = false;

    for (const candidate of raw) {
      try {
        const preset = sanitizeStoredPreset(candidate);
        if (positions.has(preset.key)) {
          const existingIndex = positions.get(preset.key);
          cleaned.splice(existingIndex, 1);
          for (const [key, index] of positions) {
            if (index > existingIndex) positions.set(key, index - 1);
          }
          dirty = true;
        }
        positions.set(preset.key, cleaned.length);
        cleaned.push(preset);
      } catch {
        dirty = true;
      }
    }

    if (cleaned.length > MAX_COST_PRESETS) {
      cleaned.splice(0, cleaned.length - MAX_COST_PRESETS);
      dirty = true;
    }

    if (dirty) {
      await storage.set({ [COST_PRESET_STORAGE_KEY]: clone(cleaned) });
    }

    return cleaned;
  }

  async function readDefaultKey() {
    const stored = await storage.get(DEFAULT_COST_PRESET_STORAGE_KEY);
    const raw = stored?.[DEFAULT_COST_PRESET_STORAGE_KEY];
    if (raw === undefined) return null;
    if (typeof raw !== 'string') {
      await storage.remove(DEFAULT_COST_PRESET_STORAGE_KEY);
      return null;
    }
    const key = normalizePresetKey(raw);
    if (!key || key !== raw) {
      await storage.remove(DEFAULT_COST_PRESET_STORAGE_KEY);
      return null;
    }
    return key;
  }

  async function clearDefault() {
    const key = await readDefaultKey();
    if (!key) return false;
    await storage.remove(DEFAULT_COST_PRESET_STORAGE_KEY);
    return true;
  }

  return Object.freeze({
    async save(name, costs) {
      const normalizedName = normalizeName(name);
      const preset = Object.freeze({
        key: keyForName(normalizedName),
        name: normalizedName,
        updatedAt: normalizeUpdatedAt(now()),
        costs: normalizeCosts(costs)
      });

      const presets = await readPresets();
      const next = presets.filter(existing => existing.key !== preset.key);
      next.push(preset);
      if (next.length > MAX_COST_PRESETS) {
        next.splice(0, next.length - MAX_COST_PRESETS);
      }
      await storage.set({ [COST_PRESET_STORAGE_KEY]: clone(next) });
      return clone(preset);
    },

    async remove(nameOrKey) {
      const key = normalizePresetKey(nameOrKey);
      if (!key) return false;
      const presets = await readPresets();
      const next = presets.filter(preset => preset.key !== key);
      if (next.length === presets.length) return false;
      await storage.set({ [COST_PRESET_STORAGE_KEY]: clone(next) });
      const defaultKey = await readDefaultKey();
      if (defaultKey === key) await storage.remove(DEFAULT_COST_PRESET_STORAGE_KEY);
      return true;
    },

    async list() {
      const presets = await readPresets();
      return clone([...presets].reverse());
    },

    async setDefault(nameOrKey) {
      const key = normalizePresetKey(nameOrKey);
      if (!key) throw new TypeError('saved preset key is required');
      const presets = await readPresets();
      const preset = presets.find(candidate => candidate.key === key);
      if (!preset) throw new TypeError('default must reference a saved preset');
      await storage.set({ [DEFAULT_COST_PRESET_STORAGE_KEY]: key });
      return clone(preset);
    },

    async getDefault() {
      const key = await readDefaultKey();
      if (!key) return null;
      const presets = await readPresets();
      const preset = presets.find(candidate => candidate.key === key);
      if (!preset) {
        await storage.remove(DEFAULT_COST_PRESET_STORAGE_KEY);
        return null;
      }
      return clone(preset);
    },

    clearDefault
  });
}
