require('dotenv').config();

const REQUIRED_ENV = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`Falta variable de entorno requerida: ${key}`);
}

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');

const authRoutes         = require('./routes/auth.routes');
const dashboardRoutes    = require('./routes/dashboard.routes');
const pesajeRoutes       = require('./routes/pesaje.routes');
const recicladoresRoutes = require('./routes/recicladores.routes');
const rutasRoutes        = require('./routes/rutas.routes');
const materialesRoutes   = require('./routes/materiales.routes');
const balanceRoutes      = require('./routes/balance.routes');
const suiRoutes          = require('./routes/sui.routes');
const pqrRoutes          = require('./routes/pqr.routes');
const vehiculosRoutes    = require('./routes/vehiculos.routes');

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// En producción, CORS_ORIGIN debe ser la URL exacta de tu frontend en Cloudflare
// Ejemplo: CORS_ORIGIN=https://tu-app.pages.dev
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (Postman, Railway health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} no permitido por CORS`));
  },
  credentials: true,
}));

// ─── Middlewares globales ──────────────────────────────────────────────────────
app.use(compression());
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Cache control para endpoints GET estables ─────────────────────────────────
const cacheControl = (segundos) => (req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', `private, max-age=${segundos}`)
  }
  next()
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Rutas API ────────────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/dashboard',    dashboardRoutes);
app.use('/api/pesaje',       pesajeRoutes);
app.use('/api/recicladores', cacheControl(30), recicladoresRoutes);
app.use('/api/rutas',        cacheControl(30), rutasRoutes);
app.use('/api/materiales',   cacheControl(30), materialesRoutes);
app.use('/api/balance',      balanceRoutes);
app.use('/api/sui',          suiRoutes);
app.use('/api/pqr',          pqrRoutes);
app.use('/api/vehiculos',    cacheControl(30), vehiculosRoutes);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ─── Error handler global ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Errores de CORS
  if (err.message?.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  // Errores de Prisma: no exponer detalles en producción
  const isPrismaError = err.code?.startsWith('P');
  if (isPrismaError && process.env.NODE_ENV === 'production') {
    console.error('[Prisma]', err.code, err.meta);
    return res.status(500).json({ error: 'Error de base de datos' });
  }
  console.error(err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
  });
});

// ─── Arranque ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌿 SIAR Backend corriendo en http://0.0.0.0:${PORT}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health:  http://0.0.0.0:${PORT}/health\n`);

  // Warm-up diferido: espera 5s para que el pool de conexiones esté listo
  setTimeout(warmUp, 5000);
});

async function warmUp() {
  const { warmSet } = require('./lib/cache');
  const { computeKpis, computeActividad, computeComposicion, computeTendencia } = require('./controllers/dashboard.controller');
  try {
    // Secuencial para no saturar el pool de Supabase
    const kpisData   = await computeKpis();
    const actividad  = await computeActividad();
    const composicion = await computeComposicion();
    const tendencia  = await computeTendencia();
    warmSet('/api/dashboard/all', { kpis: kpisData, actividad, composicion, tendencia }, 5 * 60_000);
    console.log('   Cache warm-up: /dashboard/all ✓');
  } catch (err) {
    console.warn('   Cache warm-up falló (no crítico):', err.message);
  }
}
