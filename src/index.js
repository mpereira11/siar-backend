require('dotenv').config();

const REQUIRED_ENV = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`Falta variable de entorno: ${key}`);
}

const express     = require('express');
const cors        = require('cors');
const morgan      = require('morgan');
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

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return cb(null, true);
    cb(new Error(`Origin ${origin} no permitido por CORS`));
  },
  credentials: true,
}));

// ─── Middlewares ─────────────────────────────────────────────────────────────
app.use(compression());
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const cacheControl = (s) => (req, res, next) => {
  if (req.method === 'GET') res.set('Cache-Control', `private, max-age=${s}`);
  next();
};

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Rutas ───────────────────────────────────────────────────────────────────
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

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ─── Error handler ───────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.message?.includes('CORS')) return res.status(403).json({ error: err.message });
  console.error(err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
  });
});

// ─── Arranque ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌿 SIAR Backend (sin Prisma) → http://0.0.0.0:${PORT}`);
  console.log(`   Entorno:  ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL}`);
  console.log(`   Health:   http://0.0.0.0:${PORT}/health\n`);
  setTimeout(warmUp, 5000);
});

async function warmUp() {
  const { warmSet } = require('./lib/cache');
  const { computeKpis, computeActividad, computeComposicion, computeTendencia } = require('./controllers/dashboard.controller');
  try {
    const [kpisData, actividad, composicion, tendencia] = await Promise.all([
      computeKpis(), computeActividad(), computeComposicion(), computeTendencia(),
    ]);
    warmSet('/api/dashboard/all', { kpis: kpisData, actividad, composicion, tendencia }, 5 * 60_000);
    console.log('   Cache warm-up: /dashboard/all ✓');
  } catch (err) {
    console.warn('   Cache warm-up falló (no crítico):', err.message);
  }
}
