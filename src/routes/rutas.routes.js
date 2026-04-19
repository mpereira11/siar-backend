const { Router } = require('express');
const { listar, resumenCobertura, obtener, crear, actualizar } = require('../controllers/rutas.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/roles.middleware');
const { validate } = require('../middleware/validate.middleware');
const { crearRutaSchema, actualizarRutaSchema } = require('../validators/rutas.validator');
const { cacheMiddleware, invalidate } = require('../lib/cache');

const router = Router();

router.use(authMiddleware);

// Rutas cambian muy poco — caché de 5 minutos
router.get('/',          cacheMiddleware(5 * 60 * 1000), listar);
router.get('/cobertura', cacheMiddleware(5 * 60 * 1000), resumenCobertura);
router.get('/:id',       cacheMiddleware(5 * 60 * 1000), obtener);

router.post(
  '/',
  requireRoles('admin_asociacion'),
  validate(crearRutaSchema),
  crear
);

router.put(
  '/:id',
  requireRoles('operador_eca', 'admin_asociacion'),
  validate(actualizarRutaSchema),
  actualizar
);

module.exports = router;
