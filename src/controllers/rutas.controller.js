const prisma = require('../lib/prisma');
const { invalidate } = require('../lib/cache');

async function listar(_req, res) {
  try {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [rutas, kgPorRuta] = await Promise.all([
      prisma.ruta.findMany({
        orderBy: { numero: 'asc' },
        include: { _count: { select: { recicladores: true } } },
      }),
      // Un solo groupBy por rutaId — sin el N+1 intermedio
      prisma.pesaje.groupBy({
        by: ['rutaId'],
        where: { horaEntrada: { gte: inicioMes }, estado: 'OK' },
        _sum: { id: true }, // solo necesitamos agrupar, el peso viene de PesajeMaterial
      }),
    ]);

    // Peso neto por ruta en una sola query
    const pesajeIds = await prisma.pesaje.findMany({
      where: { horaEntrada: { gte: inicioMes }, estado: 'OK' },
      select: { id: true, rutaId: true },
    });

    const pesajeIdToRutaId = Object.fromEntries(pesajeIds.map((p) => [p.id, p.rutaId]));

    const pesosMes = await prisma.pesajeMaterial.groupBy({
      by: ['pesajeId'],
      where: { pesaje: { horaEntrada: { gte: inicioMes }, estado: 'OK' } },
      _sum: { pesoNeto: true },
    });

    const kgMap = {};
    for (const pm of pesosMes) {
      const rutaId = pesajeIdToRutaId[pm.pesajeId];
      if (rutaId) kgMap[rutaId] = (kgMap[rutaId] ?? 0) + Number(pm._sum.pesoNeto ?? 0);
    }

    const data = rutas.map((r) => ({
      ...r,
      numRecicladores: r._count.recicladores,
      kgMes: kgMap[r.id] ?? 0,
      _count: undefined,
    }));

    res.json(data);
  } catch (err) {
    console.error('[rutas.listar]', err);
    res.status(500).json({ error: 'Error al listar rutas' });
  }
}

async function resumenCobertura(_req, res) {
  try {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [totalRutas, todasRutas, recicladoresActivos, kgMes] = await Promise.all([
      prisma.ruta.count({ where: { estado: { not: 'Inactiva' } } }),
      prisma.ruta.findMany({ select: { barrios: true } }),
      prisma.reciclador.count({ where: { estado: 'Activa' } }),
      prisma.pesajeMaterial.aggregate({
        where: { pesaje: { horaEntrada: { gte: inicioMes }, estado: 'OK' } },
        _sum: { pesoNeto: true },
      }),
    ]);

    const totalBarrios = todasRutas.reduce((acc, r) => acc + r.barrios.length, 0);

    res.json({
      totalRutas,
      totalBarrios,
      recicladoresActivos,
      kgMes: Number(kgMes._sum.pesoNeto ?? 0),
    });
  } catch (err) {
    console.error('[rutas.resumenCobertura]', err);
    res.status(500).json({ error: 'Error al obtener cobertura' });
  }
}

async function obtener(req, res) {
  try {
    const id = Number(req.params.id);
    const ruta = await prisma.ruta.findUnique({
      where: { id },
      include: {
        recicladores: { select: { id: true, codigo: true, nombre: true, estado: true, color: true } },
      },
    });

    if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada' });
    res.json(ruta);
  } catch (err) {
    console.error('[rutas.obtener]', err);
    res.status(500).json({ error: 'Error al obtener ruta' });
  }
}

async function crear(req, res) {
  try {
    const existe = await prisma.ruta.findUnique({ where: { numero: req.body.numero } });
    if (existe) return res.status(409).json({ error: `La ruta ${req.body.numero} ya existe` });

    const ruta = await prisma.ruta.create({ data: req.body });
    invalidate('/api/rutas');
    res.status(201).json(ruta);
  } catch (err) {
    console.error('[rutas.crear]', err);
    res.status(500).json({ error: 'Error al crear ruta' });
  }
}

async function actualizar(req, res) {
  try {
    const id = Number(req.params.id);
    const existe = await prisma.ruta.findUnique({ where: { id } });
    if (!existe) return res.status(404).json({ error: 'Ruta no encontrada' });

    const ruta = await prisma.ruta.update({ where: { id }, data: req.body });
    invalidate('/api/rutas');
    res.json(ruta);
  } catch (err) {
    console.error('[rutas.actualizar]', err);
    res.status(500).json({ error: 'Error al actualizar ruta' });
  }
}

module.exports = { listar, resumenCobertura, obtener, crear, actualizar };
