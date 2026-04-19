const supabase = require('../lib/supabase');

function getMesActual() {
  const hoy = new Date();
  return {
    inicio: new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString(),
    fin:    new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString(),
  };
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

  const total = Array.from(map.values()).reduce((a, m) => a + m.kg, 0);
  return {
    total,
    composicion: Array.from(map.values()).map((m) => ({
      nombre: m.nombre, icono: m.icono ?? '♻️', kg: m.kg,
      porcentaje: total > 0 ? +((m.kg / total) * 100).toFixed(1) : 0,
    })),
  };
}

async function computeTendencia() {
  const hoy   = new Date();
  const inicio = new Date(hoy); inicio.setDate(hoy.getDate() - 7 * 8); inicio.setHours(0, 0, 0, 0);

  const { data: pesajes } = await supabase
    .from('pesaje_materiales')
    .select('pesoNeto, pesajes!pesajeId(horaEntrada, estado)')
    .gte('pesajes.horaEntrada', inicio.toISOString())
    .eq('pesajes.estado', 'OK');

  const semanas = Array.from({ length: 8 }, (_, i) => {
    const finSem = new Date(hoy); finSem.setDate(hoy.getDate() - i * 7);
    const iniSem = new Date(finSem); iniSem.setDate(finSem.getDate() - 6); iniSem.setHours(0, 0, 0, 0);
    finSem.setHours(23, 59, 59, 999);
    return { label: `S${8 - i}`, kg: 0, inicio: iniSem, fin: finSem };
  }).reverse();

  for (const pm of pesajes ?? []) {
    const fecha = new Date(pm.pesajes?.horaEntrada);
    const sem   = semanas.find((s) => fecha >= s.inicio && fecha <= s.fin);
    if (sem) sem.kg += Number(pm.pesoNeto ?? 0);
  }

  return semanas.map((s) => ({
    label: s.label, kg: s.kg,
    inicio: s.inicio.toISOString().slice(0, 10),
    fin:    s.fin.toISOString().slice(0, 10),
  }));
}

// ─── Handlers ────────────────────────────────────────────────────────────────
async function kpis(_req, res) {
  try { res.json(await computeKpis()); }
  catch (err) { console.error('[dashboard.kpis]', err); res.status(500).json({ error: 'Error KPIs' }); }
}
<<<<<<< HEAD
async function actividadReciente(_req, res) {
  try { res.json(await computeActividad()); }
  catch (err) { console.error('[dashboard.actividad]', err); res.status(500).json({ error: 'Error actividad' }); }
=======

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
>>>>>>> aac5922958fce7bdf7f63b6d6e0ff2add250927a
}
async function composicionMaterial(_req, res) {
  try { res.json(await computeComposicion()); }
  catch (err) { console.error('[dashboard.composicion]', err); res.status(500).json({ error: 'Error composición' }); }
}
async function tendenciaSemanal(_req, res) {
  try { res.json(await computeTendencia()); }
  catch (err) { console.error('[dashboard.tendencia]', err); res.status(500).json({ error: 'Error tendencia' }); }
}
async function all(_req, res) {
  try {
    const [kpisData, actividad, composicion, tendencia] = await Promise.all([
      computeKpis(), computeActividad(), computeComposicion(), computeTendencia(),
    ]);
    res.json({ kpis: kpisData, actividad, composicion, tendencia });
  } catch (err) {
    console.error('[dashboard.all]', err);
    res.status(500).json({ error: 'Error dashboard' });
  }
}

module.exports = {
  kpis, actividadReciente, composicionMaterial, tendenciaSemanal, all,
  computeKpis, computeActividad, computeComposicion, computeTendencia,
};
