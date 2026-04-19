const { Router } = require('express');
const { kpis, actividadReciente, composicionMaterial, tendenciaSemanal, all } = require('../controllers/dashboard.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { cacheMiddleware } = require('../lib/cache');

const router = Router();

router.use(authMiddleware);

// Dashboard se recalcula cada 5 minutos — datos agregados no cambian con cada pesaje
const cache5m = cacheMiddleware(5 * 60 * 1000);

// Endpoint combinado — una sola request desde el frontend
router.get('/all',                cache5m, all);

// Endpoints individuales mantenidos por compatibilidad
router.get('/kpis',               cache5m, kpis);
router.get('/actividad-reciente', cache5m, actividadReciente);
router.get('/composicion',        cache5m, composicionMaterial);
router.get('/tendencia-semanal',  cache5m, tendenciaSemanal);

module.exports = router;
