require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes         = require('./routes/auth.routes');
const dashboardRoutes    = require('./routes/dashboard.routes');
const pesajeRoutes       = require('./routes/pesaje.routes');
const recicladoresRoutes = require('./routes/recicladores.routes');
const rutasRoutes        = require('./routes/rutas.routes');
const materialesRoutes   = require('./routes/materiales.routes');
const balanceRoutes      = require('./routes/balance.routes');
const suiRoutes          = require('./routes/sui.routes');
const pqrRoutes          = require('./routes/pqr.routes');

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
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ─── Rutas API ────────────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/dashboard',    dashboardRoutes);
app.use('/api/pesaje',       pesajeRoutes);
app.use('/api/recicladores', recicladoresRoutes);
app.use('/api/rutas',        rutasRoutes);
app.use('/api/materiales',   materialesRoutes);
app.use('/api/balance',      balanceRoutes);
app.use('/api/sui',          suiRoutes);
app.use('/api/pqr',          pqrRoutes);

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
});
