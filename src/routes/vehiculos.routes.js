const { Router } = require('express');
const { listar, crear } = require('../controllers/vehiculos.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/roles.middleware');
const { validate } = require('../middleware/validate.middleware');
const { crearVehiculoSchema, listQuerySchema } = require('../validators/vehiculos.validator');

const router = Router();

router.use(authMiddleware);

router.get('/', validate(listQuerySchema, 'query'), listar);

router.post(
  '/',
  requireRoles('operador_eca', 'admin_asociacion'),
  validate(crearVehiculoSchema),
  crear
);

module.exports = router;
