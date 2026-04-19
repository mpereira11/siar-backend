const prisma = require('../lib/prisma');
const { invalidate } = require('../lib/cache');

async function listar(req, res) {
  try {
    const { rutaId, estado, q, page, limit } = req.query;

    const where = {};
    if (rutaId) where.rutaId = Number(rutaId);
    if (estado) where.estado = estado;
    if (q) {
      where.OR = [
        { nombre: { contains: q, mode: 'insensitive' } },
        { codigo: { contains: q, mode: 'insensitive' } },
      ];
    }

    const p     = Number(page)  || 1;
    const lim   = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip  = (p - 1) * lim;

    const hoy        = new Date();
    const inicioMes  = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const inicioSem  = new Date(hoy);
    inicioSem.setDate(hoy.getDate() - hoy.getDay());
    inicioSem.setHours(0, 0, 0, 0);

    const [total, recicladores] = await Promise.all([
      prisma.reciclador.count({ where }),
      prisma.reciclador.findMany({
        where,
        skip,
        take: lim,
        orderBy: { nombre: 'asc' },
        include: {
          ruta: { select: { id: true, numero: true, nombre: true } },
          _count: { select: { pesajes: true } },
        },
      }),
    ]);

    if (!recicladores.length) {
      return res.json({ data: [], meta: { total: 0, page: p, limit: lim, pages: 0 } });
    }

    const ids = recicladores.map((r) => r.id);

    // kg del mes — un solo groupBy incluyendo recicladorId a través de la relación
    const kgMesRaw = await prisma.pesajeMaterial.groupBy({
      by: ['pesajeId'],
      where: {
        pesaje: { recicladorId: { in: ids }, horaEntrada: { gte: inicioMes }, estado: 'OK' },
      },
      _sum: { pesoNeto: true },
    });

    // Recuperamos recicladorId junto con los pesajeIds en una sola query
    const pesajeIdToRec = kgMesRaw.length
      ? Object.fromEntries(
          (await prisma.pesaje.findMany({
            where: { id: { in: kgMesRaw.map((k) => k.pesajeId) } },
            select: { id: true, recicladorId: true },
          })).map((p) => [p.id, p.recicladorId])
        )
      : {};

    const kgMesMap = {};
    for (const k of kgMesRaw) {
      const recId = pesajeIdToRec[k.pesajeId];
      if (recId) kgMesMap[recId] = (kgMesMap[recId] ?? 0) + Number(k._sum.pesoNeto ?? 0);
    }

    // Ingreso semanal — agrupado por recicladorId directamente
    const pesajesSemana = await prisma.pesaje.findMany({
      where: { recicladorId: { in: ids }, horaEntrada: { gte: inicioSem }, estado: 'OK' },
      select: {
        recicladorId: true,
        materiales: {
          select: {
            pesoNeto: true,
            rechazo: true,
            material: {
              select: {
                precios: { where: { vigenciaHasta: null }, orderBy: { vigenciaDesde: 'desc' }, take: 1, select: { precio: true } },
              },
            },
          },
        },
      },
    });

    const ingresoSemMap = {};
    for (const p of pesajesSemana) {
      for (const pm of p.materiales) {
        const precio = Number(pm.material.precios[0]?.precio ?? 0);
        const kg = Number(pm.pesoNeto) - Number(pm.rechazo ?? 0);
        if (kg > 0) ingresoSemMap[p.recicladorId] = (ingresoSemMap[p.recicladorId] ?? 0) + kg * precio;
      }
    }

    const data = recicladores.map((r) => ({
      ...r,
      kgMes:         kgMesMap[r.id] ?? 0,
      totalPesajes:  r._count.pesajes,
      ingresoSemana: ingresoSemMap[r.id] ?? 0,
      _count:        undefined,
    }));

    res.json({ data, meta: { total, page: p, limit: lim, pages: Math.ceil(total / lim) } });
  } catch (err) {
    console.error('[recicladores.listar]', err);
    res.status(500).json({ error: 'Error al listar recicladores' });
  }
}

async function obtener(req, res) {
  try {
    const id = Number(req.params.id);
    const reciclador = await prisma.reciclador.findUnique({
      where: { id },
      include: {
        ruta: true,
        usuario: { select: { id: true, email: true, activo: true } },
      },
    });

    if (!reciclador) return res.status(404).json({ error: 'Reciclador no encontrado' });

    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [kgMes, visitasMes, pesajesRecientes] = await Promise.all([
      prisma.pesajeMaterial.aggregate({
        where: { pesaje: { recicladorId: id, horaEntrada: { gte: inicioMes }, estado: 'OK' } },
        _sum: { pesoNeto: true },
      }),
      prisma.pesaje.count({ where: { recicladorId: id, horaEntrada: { gte: inicioMes } } }),
      prisma.pesaje.findMany({
        where: { recicladorId: id },
        take: 10,
        orderBy: { horaEntrada: 'desc' },
        include: {
          materiales: { include: { material: { select: { nombre: true, icono: true } } } },
          ruta: { select: { numero: true, nombre: true } },
        },
      }),
    ]);

    res.json({
      ...reciclador,
      estadisticas: { kgMes: Number(kgMes._sum.pesoNeto ?? 0), visitasMes },
      actividadReciente: pesajesRecientes,
    });
  } catch (err) {
    console.error('[recicladores.obtener]', err);
    res.status(500).json({ error: 'Error al obtener reciclador' });
  }
}

async function crear(req, res) {
  try {
    const ultimo = await prisma.reciclador.findFirst({ orderBy: { id: 'desc' } });
    const nuevoNum = (ultimo ? parseInt(ultimo.codigo.split('-')[1]) + 1 : 1)
      .toString()
      .padStart(4, '0');
    const codigo = `ID-${nuevoNum}`;

    const reciclador = await prisma.reciclador.create({
      data: { ...req.body, codigo },
      include: { ruta: true },
    });

    invalidate('/api/recicladores');
    invalidate('/api/dashboard');
    res.status(201).json(reciclador);
  } catch (err) {
    console.error('[recicladores.crear]', err);
    res.status(500).json({ error: 'Error al crear reciclador' });
  }
}

async function actualizar(req, res) {
  try {
    const id = Number(req.params.id);
    const existe = await prisma.reciclador.findUnique({ where: { id } });
    if (!existe) return res.status(404).json({ error: 'Reciclador no encontrado' });

    const reciclador = await prisma.reciclador.update({
      where: { id },
      data: req.body,
      include: { ruta: true },
    });

    invalidate('/api/recicladores');
    res.json(reciclador);
  } catch (err) {
    console.error('[recicladores.actualizar]', err);
    res.status(500).json({ error: 'Error al actualizar reciclador' });
  }
}

async function historial(req, res) {
  try {
    const id = Number(req.params.id);
    const { page = 1, limit = 20 } = req.query;

    const existe = await prisma.reciclador.findUnique({ where: { id } });
    if (!existe) return res.status(404).json({ error: 'Reciclador no encontrado' });

    const p   = Math.max(1, Number(page));
    const lim = Math.min(100, Math.max(1, Number(limit)));
    const skip = (p - 1) * lim;

    const [total, pesajes] = await Promise.all([
      prisma.pesaje.count({ where: { recicladorId: id } }),
      prisma.pesaje.findMany({
        where: { recicladorId: id },
        skip,
        take: lim,
        orderBy: { horaEntrada: 'desc' },
        include: {
          ruta: { select: { numero: true, nombre: true } },
          materiales: { include: { material: { select: { nombre: true, icono: true, codigo: true } } } },
        },
      }),
    ]);

    res.json({ data: pesajes, meta: { total, page: p, limit: lim, pages: Math.ceil(total / lim) } });
  } catch (err) {
    console.error('[recicladores.historial]', err);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
}

async function cuentaCobro(req, res) {
  try {
    const id = Number(req.params.id);
    const { mes, anio } = req.query;

    const a = anio ? Number(anio) : new Date().getFullYear();
    const m = mes  ? Number(mes)  : new Date().getMonth() + 1;

    const inicio = new Date(a, m - 1, 1);
    const fin    = new Date(a, m, 1);

    const reciclador = await prisma.reciclador.findUnique({ where: { id }, include: { ruta: true } });
    if (!reciclador) return res.status(404).json({ error: 'Reciclador no encontrado' });

    const pesajes = await prisma.pesaje.findMany({
      where: { recicladorId: id, horaEntrada: { gte: inicio, lt: fin }, estado: 'OK' },
      include: {
        materiales: {
          include: {
            material: {
              include: {
                precios: { where: { vigenciaHasta: null }, orderBy: { vigenciaDesde: 'desc' }, take: 1 },
              },
            },
          },
        },
      },
    });

    let totalKg = 0;
    let totalValor = 0;
    const detalles = [];

    for (const pesaje of pesajes) {
      for (const pm of pesaje.materiales) {
        const precio = pm.material.precios[0]?.precio ?? 0;
        const kg = Number(pm.pesoNeto);
        const valor = kg * Number(precio);
        totalKg += kg;
        totalValor += valor;
        detalles.push({ fecha: pesaje.horaEntrada, material: pm.material.nombre, kg, precioPorKg: Number(precio), valor });
      }
    }

    res.json({
      reciclador: { id: reciclador.id, codigo: reciclador.codigo, nombre: reciclador.nombre },
      periodo: `${a}-${String(m).padStart(2, '0')}`,
      totalKg,
      totalValor,
      visitas: pesajes.length,
      detalles,
    });
  } catch (err) {
    console.error('[recicladores.cuentaCobro]', err);
    res.status(500).json({ error: 'Error al generar cuenta de cobro' });
  }
}

module.exports = { listar, obtener, crear, actualizar, historial, cuentaCobro };
