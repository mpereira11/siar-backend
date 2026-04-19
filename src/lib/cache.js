const store = new Map()

/**
 * Middleware de caché en memoria para rutas GET.
 * @param {number} ttlMs - Tiempo de vida en milisegundos
 */
function cacheMiddleware(ttlMs) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next()

    const key = req.originalUrl
    const hit = store.get(key)
    if (hit && hit.expiresAt > Date.now()) {
      res.setHeader('X-Cache', 'HIT')
      return res.json(hit.data)
    }

    // Interceptamos res.json para guardar la respuesta en caché
    const originalJson = res.json.bind(res)
    res.json = (data) => {
      if (res.statusCode === 200) {
        store.set(key, { data, expiresAt: Date.now() + ttlMs })
      }
      res.setHeader('X-Cache', 'MISS')
      return originalJson(data)
    }

    next()
  }
}

/**
 * Invalida todas las entradas de caché cuya clave empiece con el prefijo dado.
 * Llamar desde controllers después de mutaciones (POST/PUT/DELETE).
 */
function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

function warmSet(key, data, ttlMs) {
  store.set(key, { data, expiresAt: Date.now() + ttlMs })
}

module.exports = { cacheMiddleware, invalidate, warmSet }
