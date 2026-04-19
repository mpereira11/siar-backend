const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

// Blacklist de refresh tokens revocados (en memoria).
// En producción con múltiples instancias usar Redis.
const revokedTokens = new Set();

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
}

async function login(req, res) {
  const { email, password } = req.body;

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.activo) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const ok = await bcrypt.compare(password, usuario.password);
  if (!ok) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const payload = { sub: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre };
  const token = signToken(payload);
  const refreshToken = signRefreshToken({ sub: usuario.id });

  // Incluir recicladorId si aplica
  let recicladorId = null;
  if (usuario.rol === 'reciclador_oficio') {
    const rec = await prisma.reciclador.findUnique({ where: { usuarioId: usuario.id } });
    recicladorId = rec?.id ?? null;
  }

  res.json({
    token,
    refreshToken,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      recicladorId,
    },
  });
}

async function refresh(req, res) {
  const { refreshToken } = req.body;
  try {
    if (revokedTokens.has(refreshToken)) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    const newPayload = { sub: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre };
    res.json({ token: signToken(newPayload) });
  } catch {
    res.status(401).json({ error: 'Refresh token inválido o expirado' });
  }
}

async function me(req, res) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.user.sub },
    select: { id: true, nombre: true, email: true, rol: true, activo: true, createdAt: true },
  });
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(usuario);
}

function logout(req, res) {
  const { refreshToken } = req.body ?? {};
  if (refreshToken) revokedTokens.add(refreshToken);
  res.json({ mensaje: 'Sesión cerrada correctamente' });
}

module.exports = { login, refresh, me, logout };
