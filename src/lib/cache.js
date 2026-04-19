const store = new Map();

function cacheMiddleware(ttlMs) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();
    const key = req.originalUrl;
    const hit = store.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(hit.data);
    }
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode === 200) {
        store.set(key, { data, expiresAt: Date.now() + ttlMs });
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(data);
    };
    next();
  };
}

function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

function warmSet(key, data, ttlMs) {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

module.exports = { cacheMiddleware, invalidate, warmSet };
