export function createMemoryRateLimiter(options = {}) {
  const limit = Math.max(1, Number(options.limit || 60));
  const windowMs = Math.max(1, Number(options.windowMs || 60_000));
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const buckets = new Map();

  return {
    consume(key = 'anonymous') {
      const id = String(key || 'anonymous').slice(0, 256);
      const timestamp = now();
      const current = buckets.get(id);
      if (!current || timestamp - current.windowStart >= windowMs) {
        buckets.set(id, { windowStart: timestamp, count: 1 });
        return { allowed: true, remaining: limit - 1, resetAt: timestamp + windowMs };
      }

      if (current.count >= limit) {
        return { allowed: false, remaining: 0, resetAt: current.windowStart + windowMs };
      }

      current.count += 1;
      return { allowed: true, remaining: limit - current.count, resetAt: current.windowStart + windowMs };
    },
    reset(key) {
      buckets.delete(String(key || 'anonymous').slice(0, 256));
    }
  };
}
