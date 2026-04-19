const { Router } = require('express');
const { listar, crear } = require('../controllers/vehiculos.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/roles.middleware');
const { validate } = require('../middleware/validate.middleware');
const { crearVehiculoSchema, listQuerySchema } = require('../validators/vehiculos.validator');
const { cacheMiddleware } = require('../lib/cache');

const router = Router();

router.use(authMiddleware);

router.get('/', validate(listQuerySchema, 'query'), cacheMiddleware(5 * 60 * 1000), listar);

router.post(
  '/',
  requireRoles('operador_eca', 'admin_asociacion'),
  validate(crearVehiculoSchema),
  crear
);

module.exports = router;
