const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { login, refresh, me, logout } = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { loginSchema, refreshSchema } = require('../validators/auth.validator');

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Intenta de nuevo en 15 minutos.' },
});

router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/refresh', validate(refreshSchema), refresh);
router.post('/logout',  authMiddleware,           logout);
router.get('/me',       authMiddleware,           me);

module.exports = router;
