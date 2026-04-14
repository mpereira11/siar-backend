const prisma = require('../lib/prisma');

function getMesActual() {
  const hoy = new Date();
  return { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
}

async function kpis(req, res) {
  try {
    const { anio, mes } = getMesActual();
    const inicio    = new Date(anio, mes - 1, 1);
    const fin       = new Date(anio, mes,     1);
    const inicioAnt = new Date(anio, mes - 2, 1); // JS maneja wrap automático (ej: enero → diciembre año anterior)
    const finAnt    = new Date(anio, mes - 1, 1); // coincide con inicio del mes actual

    const includeDetalle = {
      material: {
        include: {
          precios: { where: { vigenciaHasta: null }, orderBy: { vigenciaDesde: 'desc' }, take: 1 },
        },
      },
    };

    const [
      [pesajesMes,    recicladoresActivos, pesajesMesDetalle],
      [pesajesMesAnt, recicladoresAnt,     pesajesMesDetalleAnt],
    ] = await Promise.all([
      Promise.all([
        prisma.pesajeMaterial.aggregate({
          where: { pesaje: { horaEntrada: { gte: inicio,    lt: fin    }, estado: 'OK' } },
          _sum: { pesoNeto: true, rechazo: true },
        }),
        prisma.reciclador.count({
          where: { estado: 'Activa', pesajes: { some: { horaEntrada: { gte: inicio,    lt: fin    }, estado: 'OK' } } },
        }),
        prisma.pesajeMaterial.findMany({
          where: { pesaje: { horaEntrada: { gte: inicio,    lt: fin    }, estado: 'OK' } },
          include: includeDetalle,
        }),
      ]),
      Promise.all([
        prisma.pesajeMaterial.aggregate({
          where: { pesaje: { horaEntrada: { gte: inicioAnt, lt: finAnt }, estado: 'OK' } },
          _sum: { pesoNeto: true, rechazo: true },
        }),
        prisma.reciclador.count({
          where: { estado: 'Activa', pesajes: { some: { horaEntrada: { gte: inicioAnt, lt: finAnt }, estado: 'OK' } } },
        }),
        prisma.pesajeMaterial.findMany({
          where: { pesaje: { horaEntrada: { gte: inicioAnt, lt: finAnt }, estado: 'OK' } },
          include: includeDetalle,
        }),
      ]),
    ]);

    // ── Valores mes actual ──────────────────────────────────────────────────
    const rechazos    = Number(pesajesMes._sum.rechazo  ?? 0);
    const aprovechado = Number(pesajesMes._sum.pesoNeto ?? 0) - rechazos;
    const liquidado   = pesajesMesDetalle.reduce((acc, pm) => {
      const precio            = Number(pm.material.precios[0]?.precio ?? 0);
      const kgComercializable = Number(pm.pesoNeto ?? 0) - Number(pm.rechazo ?? 0);
      return acc + (kgComercializable > 0 ? kgComercializable * precio : 0);
    }, 0);

    // ── Valores mes anterior ────────────────────────────────────────────────
    const rechazosAnt    = Number(pesajesMesAnt._sum.rechazo  ?? 0);
    const aprovechadoAnt = Number(pesajesMesAnt._sum.pesoNeto ?? 0) - rechazosAnt;
    const liquidadoAnt   = pesajesMesDetalleAnt.reduce((acc, pm) => {
      const precio            = Number(pm.material.precios[0]?.precio ?? 0);
      const kgComercializable = Number(pm.pesoNeto ?? 0) - Number(pm.rechazo ?? 0);
      return acc + (kgComercializable > 0 ? kgComercializable * precio : 0);
    }, 0);

    // ── Helper delta ────────────────────────────────────────────────────────
    const calcDelta = (actual, anterior) => {
      if (anterior === 0) return { delta: 'Nuevo', dir: 'up' };
      const pct     = ((actual - anterior) / anterior) * 100;
      const rounded = Math.round(pct);
      const dir     = rounded >= 0 ? 'up' : 'down';
      const sign    = rounded >= 0 ? '+' : '';
      return { delta: `${sign}${rounded}%`, dir };
    };

    res.json({
      aprovechado:         { valor: aprovechado,           unidad: 'kg',  ...calcDelta(aprovechado,        aprovechadoAnt)  },
      recicladoresActivos: { valor: recicladoresActivos,                  ...calcDelta(recicladoresActivos, recicladoresAnt) },
      rechazos:            { valor: rechazos,              unidad: 'kg',  ...calcDelta(rechazos,            rechazosAnt)     },
      liquidado:           { valor: Math.round(liquidado), unidad: 'COP', ...calcDelta(liquidado,           liquidadoAnt)    },
    });
  } catch (err) {
    console.error('[dashboard.kpis]', err);
    res.status(500).json({ error: 'Error al obtener KPIs' });
  }
}

async function actividadReciente(req, res) {
  try {
    const pesajes = await prisma.pesaje.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: {
        reciclador: { select: { nombre: true, codigo: true } },
        materiales: { include: { material: { select: { nombre: true, icono: true } } } },
      },
    });

    const actividad = pesajes.map((p) => {
      const pesoTotal = p.materiales.reduce((acc, m) => acc + Number(m.pesoNeto), 0);
      const iniciales = p.reciclador.nombre
        .split(' ').slice(0, 2).map((n) => n[0]).join('');
      return {
        initials:  iniciales,
        nombre:    p.reciclador.nombre,
        codigo:    p.reciclador.codigo,
        materiales:p.materiales.map((m) => m.material.nombre).join(', '),
        kg:        pesoTotal.toFixed(1),
        hora:      p.horaEntrada,
        estado:    p.estado,
      };
    });

    res.json(actividad);
  } catch (err) {
    console.error('[dashboard.actividadReciente]', err);
    res.status(500).json({ error: 'Error al obtener actividad reciente' });
  }
}

async function composicionMaterial(req, res) {
  try {
    const { anio, mes } = getMesActual();
    const inicio = new Date(anio, mes - 1, 1);
    const fin    = new Date(anio, mes, 1);

    // Una sola query con JOIN en lugar de dos queries separadas
    const composicion_raw = await prisma.pesajeMaterial.findMany({
      where: { pesaje: { horaEntrada: { gte: inicio, lt: fin }, estado: 'OK' } },
      select: {
        pesoNeto: true,
        material: { select: { nombre: true, icono: true } },
      },
    });

    // Agrupar en JS
    const por_material_map = new Map();
    composicion_raw.forEach((pm) => {
      const key = pm.material.nombre;
      if (!por_material_map.has(key)) {
        por_material_map.set(key, { nombre: pm.material.nombre, icono: pm.material.icono, kg: 0 });
      }
      const entry = por_material_map.get(key);
      entry.kg += Number(pm.pesoNeto ?? 0);
    });

    const total = Array.from(por_material_map.values()).reduce((acc, m) => acc + m.kg, 0);

    const composicion = Array.from(por_material_map.values())
      .sort((a, b) => b.kg - a.kg)
      .map((m) => ({
        nombre:      m.nombre,
        icono:       m.icono ?? '♻️',
        kg:          m.kg,
        porcentaje:  total > 0 ? +((m.kg / total) * 100).toFixed(1) : 0,
      }));

    res.json({ total, composicion });
  } catch (err) {
    console.error('[dashboard.composicionMaterial]', err);
    res.status(500).json({ error: 'Error al obtener composición de materiales' });
  }
}

// ─── OPTIMIZADO: 1 sola query agrupada en lugar de 8 queries secuenciales ─────
async function tendenciaSemanal(req, res) {
  try {
    const hoy = new Date();
    // Inicio de la semana 1 (hace 7 semanas)
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() - 7 * 8);
    inicio.setHours(0, 0, 0, 0);

    // Una sola query trae todos los pesajes de las últimas 8 semanas
    const pesajes = await prisma.pesajeMaterial.findMany({
      where: {
        pesaje: {
          horaEntrada: { gte: inicio },
          estado: 'OK',
        },
      },
      select: {
        pesoNeto: true,
        pesaje: { select: { horaEntrada: true } },
      },
    });

    // Agrupar en JavaScript por semana relativa
    const semanas = Array.from({ length: 8 }, (_, i) => {
      const finSemana   = new Date(hoy);
      finSemana.setDate(hoy.getDate() - i * 7);
      const inicioSemana = new Date(finSemana);
      inicioSemana.setDate(finSemana.getDate() - 6);
      inicioSemana.setHours(0, 0, 0, 0);
      finSemana.setHours(23, 59, 59, 999);
      return {
        label:  `S${8 - i}`,
        kg:     0,
        inicio: inicioSemana,
        fin:    finSemana,
        inicioStr: inicioSemana.toISOString().slice(0, 10),
        finStr:    finSemana.toISOString().slice(0, 10),
      };
    }).reverse();

    for (const pm of pesajes) {
      const fecha = new Date(pm.pesaje.horaEntrada);
      const semana = semanas.find(s => fecha >= s.inicio && fecha <= s.fin);
      if (semana) semana.kg += Number(pm.pesoNeto ?? 0);
    }

    res.json(semanas.map(s => ({
      label:  s.label,
      kg:     s.kg,
      inicio: s.inicioStr,
      fin:    s.finStr,
    })));
  } catch (err) {
    console.error('[dashboard.tendenciaSemanal]', err);
    res.status(500).json({ error: 'Error al obtener tendencia semanal' });
  }
}

module.exports = { kpis, actividadReciente, composicionMaterial, tendenciaSemanal };
