const prisma = require('../lib/prisma');
const { invalidate } = require('../lib/cache');

async function listar(req, res) {
  try {
    const { fecha, recicladorId, rutaId, estado } = req.query;
    // BUG FIX: parsear page y limit a Number con defaults
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const where = {};

    if (fecha) {
      const d       = new Date(fecha);
      const siguiente = new Date(d);
      siguiente.setDate(siguiente.getDate() + 1);
      where.horaEntrada = { gte: d, lt: siguiente };
    }

    if (recicladorId) where.recicladorId = Number(recicladorId);
    if (rutaId)       where.rutaId       = Number(rutaId);
    if (estado)       where.estado       = estado;

    // Recicladores solo ven sus propios pesajes
    if (req.user.rol === 'reciclador_oficio') {
      const rec = await prisma.reciclador.findUnique({ where: { usuarioId: req.user.sub } });
      if (rec) where.recicladorId = rec.id;
    }

    const skip = (page - 1) * limit;

    const [total, pesajes] = await Promise.all([
      prisma.pesaje.count({ where }),
      prisma.pesaje.findMany({
        where,
        skip,
        take: limit,
        orderBy: { horaEntrada: 'desc' },
        include: {
          reciclador: { select: { id: true, codigo: true, nombre: true, color: true } },
          ruta:       { select: { id: true, numero: true, nombre: true } },
          materiales: {
            include: {
              material: { select: { id: true, nombre: true, codigo: true, icono: true } },
            },
          },
        },
      }),
    ]);

    res.json({
      data: pesajes,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[pesaje.listar]', err);
    res.status(500).json({ error: 'Error al listar pesajes' });
  }
}

async function registroDia(req, res) {
  try {
    const hoy   = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const pesajes = await prisma.pesaje.findMany({
      where: { horaEntrada: { gte: hoy, lt: manana } },
      orderBy: { createdAt: 'desc' },
      include: {
        reciclador: { select: { id: true, codigo: true, nombre: true, color: true } },
        ruta:       { select: { id: true, numero: true, nombre: true } },
        materiales: {
          include: {
            material: { select: { id: true, nombre: true, codigo: true, icono: true } },
          },
        },
      },
    });

    const resumen = pesajes.reduce(
      (acc, p) => {
        acc.totalPesajes++;
        p.materiales.forEach((m) => {
          acc.pesoTotal    += Number(m.pesoNeto);
          acc.rechazoTotal += Number(m.rechazo);
        });
        return acc;
      },
      { totalPesajes: 0, pesoTotal: 0, rechazoTotal: 0 }
    );

    res.json({ resumen, pesajes });
  } catch (err) {
    console.error('[pesaje.registroDia]', err);
    res.status(500).json({ error: 'Error al obtener registro del día' });
  }
}

async function obtener(req, res) {
  try {
    const pesaje = await prisma.pesaje.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        reciclador: true,
        ruta:       true,
        materiales: { include: { material: true } },
      },
    });

    if (!pesaje) return res.status(404).json({ error: 'Pesaje no encontrado' });

    if (req.user.rol === 'reciclador_oficio') {
      const rec = await prisma.reciclador.findUnique({ where: { usuarioId: req.user.sub } });
      if (!rec || rec.id !== pesaje.recicladorId) {
        return res.status(403).json({ error: 'Acceso denegado' });
      }
    }

    res.json(pesaje);
  } catch (err) {
    console.error('[pesaje.obtener]', err);
    res.status(500).json({ error: 'Error al obtener pesaje' });
  }
}

async function crear(req, res) {
  try {
    const { recicladorId, rutaId, horaEntrada, horaSalida, materiales, observaciones } = req.body;

    const [reciclador, ruta] = await Promise.all([
      prisma.reciclador.findUnique({ where: { id: recicladorId } }),
      prisma.ruta.findUnique({ where: { id: rutaId } }),
    ]);

    if (!reciclador) return res.status(404).json({ error: 'Reciclador no encontrado' });
    if (!ruta)       return res.status(404).json({ error: 'Ruta no encontrada' });

    const pesoTotal    = materiales.reduce((acc, m) => acc + Number(m.pesoNeto), 0);
    const rechazoTotal = materiales.reduce((acc, m) => acc + Number(m.rechazo ?? 0), 0);
    const estado       = pesoTotal > 0 && rechazoTotal / pesoTotal > 0.3 ? 'Rechazo' : 'OK';

    const pesaje = await prisma.pesaje.create({
      data: {
        recicladorId,
        rutaId,
        horaEntrada: new Date(horaEntrada),
        horaSalida:  horaSalida ? new Date(horaSalida) : null,
        estado,
        observaciones,
        operadorId: req.user.sub,
        materiales: {
          create: materiales.map((m) => ({
            materialId: m.materialId,
            pesoNeto:   m.pesoNeto,
            rechazo:    m.rechazo ?? 0,
          })),
        },
      },
      include: {
        reciclador: { select: { id: true, codigo: true, nombre: true } },
        ruta:       { select: { id: true, numero: true, nombre: true } },
        materiales: { include: { material: true } },
      },
    });

    invalidate('/api/dashboard');
    invalidate('/api/rutas');
    res.status(201).json(pesaje);
  } catch (err) {
    console.error('[pesaje.crear]', err);
    res.status(500).json({ error: 'Error al crear pesaje' });
  }
}

async function actualizarEstado(req, res) {
  try {
    const { estado, observaciones } = req.body;
    const id = Number(req.params.id);

    const existe = await prisma.pesaje.findUnique({ where: { id } });
    if (!existe) return res.status(404).json({ error: 'Pesaje no encontrado' });

    const pesaje = await prisma.pesaje.update({
      where: { id },
      data:  { estado, observaciones },
    });

    res.json(pesaje);
  } catch (err) {
    console.error('[pesaje.actualizarEstado]', err);
    res.status(500).json({ error: 'Error al actualizar estado del pesaje' });
  }
}

module.exports = { listar, registroDia, obtener, crear, actualizarEstado };
