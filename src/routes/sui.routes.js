const { Router } = require('express');
const {
  listar,
  obtener,
  obtenerPorMes,
  crear,
  actualizar,
  enviar,
  generarXML,
  generarReporte,
  generarCSV,
} = require('../controllers/sui.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/roles.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  crearReporteSchema,
  actualizarReporteSchema,
  generarReporteSchema,
} = require('../validators/sui.validator');

const router = Router();

router.use(authMiddleware);
// Solo operador y admin acceden al módulo SUI
router.use(requireRoles('operador_eca', 'admin_asociacion'));

router.get('/',                  listar);
router.post('/generar',          validate(generarReporteSchema), generarReporte);
router.get('/mes/:yyyymm',       obtenerPorMes);
router.get('/:id',               obtener);
router.get('/:id/csv',           generarCSV);
router.get('/:id/xml',           generarXML);

router.post('/',                 validate(crearReporteSchema), crear);
router.put('/:id',               validate(actualizarReporteSchema), actualizar);
router.post('/:id/enviar',       enviar);

module.exports = router;
