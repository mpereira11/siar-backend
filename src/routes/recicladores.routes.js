const { Router } = require('express');
const { listar, obtener, crear, actualizar, historial, cuentaCobro } = require('../controllers/recicladores.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/roles.middleware');
const { validate } = require('../middleware/validate.middleware');
const { crearRecicladorSchema, actualizarRecicladorSchema, listQuerySchema } = require('../validators/recicladores.validator');
const { cacheMiddleware } = require('../lib/cache');

const router = Router();

router.use(authMiddleware);

router.get('/',                validate(listQuerySchema, 'query'), cacheMiddleware(5 * 60 * 1000), listar);
router.get('/:id',             cacheMiddleware(5 * 60 * 1000), obtener);
router.get('/:id/historial',   cacheMiddleware(2 * 60 * 1000), historial);
router.get('/:id/cuenta-cobro', cacheMiddleware(2 * 60 * 1000), cuentaCobro);

router.post(
  '/',
  requireRoles('operador_eca', 'admin_asociacion'),
  validate(crearRecicladorSchema),
  crear
);

router.put(
  '/:id',
  requireRoles('operador_eca', 'admin_asociacion'),
  validate(actualizarRecicladorSchema),
  actualizar
);

module.exports = router;
