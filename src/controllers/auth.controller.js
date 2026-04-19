const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');

const revokedTokens = new Set();

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

const signRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });

async function login(req, res) {
  const { email, password } = req.body;

  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('id, nombre, email, password, rol, activo')
    .eq('email', email)
    .single();

  if (error || !usuario || !usuario.activo)
    return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = await bcrypt.compare(password, usuario.password);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  const payload = { sub: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre };

  let recicladorId = null;
  if (usuario.rol === 'reciclador_oficio') {
    const { data: rec } = await supabase
      .from('recicladores')
      .select('id')
      .eq('usuarioId', usuario.id)
      .single();
    recicladorId = rec?.id ?? null;
  }

  res.json({
    token: signToken(payload),
    refreshToken: signRefreshToken({ sub: usuario.id }),
    usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, recicladorId },
  });
}

async function refresh(req, res) {
  const { refreshToken } = req.body;
  try {
    if (revokedTokens.has(refreshToken)) return res.status(401).json({ error: 'Token inválido' });
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const { data: usuario } = await supabase
      .from('usuarios').select('id, nombre, email, rol, activo').eq('id', payload.sub).single();
    if (!usuario || !usuario.activo) return res.status(401).json({ error: 'Token inválido' });
    const newPayload = { sub: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre };
    res.json({ token: signToken(newPayload) });
  } catch {
    res.status(401).json({ error: 'Refresh token inválido o expirado' });
  }
}

async function me(req, res) {
  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('id, nombre, email, rol, activo, createdAt')
    .eq('id', req.user.sub)
    .single();
  if (error || !usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(usuario);
}

function logout(req, res) {
  const { refreshToken } = req.body ?? {};
  if (refreshToken) revokedTokens.add(refreshToken);
  res.json({ mensaje: 'Sesión cerrada correctamente' });
}

module.exports = { login, refresh, me, logout };