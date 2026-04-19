const { Router } = require('express');
const { listar, obtener, crear, actualizarPrecio, historialPrecios, listarCompradores, crearComprador } = require('../controllers/materiales.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/roles.middleware');
const { validate } = require('../middleware/validate.middleware');
const { crearMaterialSchema, actualizarPrecioSchema, crearCompradorSchema } = require('../validators/materiales.validator');
const { cacheMiddleware } = require('../lib/cache');

const router = Router();

router.use(authMiddleware);

// Materiales y precios cambian poco — caché de 5 minutos
router.get('/',                    cacheMiddleware(5 * 60 * 1000), listar);
router.get('/compradores',         cacheMiddleware(5 * 60 * 1000), listarCompradores);
router.get('/:id',                 cacheMiddleware(5 * 60 * 1000), obtener);
router.get('/:id/precios',         cacheMiddleware(2 * 60 * 1000), historialPrecios);

router.post(
  '/',
  requireRoles('admin_asociacion'),
  validate(crearMaterialSchema),
  crear
);

router.post(
  '/compradores',
  requireRoles('operador_eca', 'admin_asociacion'),
  validate(crearCompradorSchema),
  crearComprador
);

router.post(
  '/:id/precio',
  requireRoles('operador_eca', 'admin_asociacion'),
  validate(actualizarPrecioSchema),
  actualizarPrecio
);

module.exports = router;
