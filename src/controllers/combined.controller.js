const supabase = require('../lib/supabase');
const { invalidate } = require('../lib/cache');

// ─── RUTAS ────────────────────────────────────────────────────────────────────

async function listar(_req, res) {
  try {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();

    const [{ data: rutas, error }, { data: pesajesIds }, { data: pesosMes }] = await Promise.all([
      supabase.from('rutas').select('id, numero, nombre, descripcion, barrios, estado').order('numero', { ascending: true }),
      supabase.from('pesajes').select('id, rutaId').gte('horaEntrada', inicioMes).eq('estado', 'OK'),
      supabase
        .from('pesaje_materiales')
        .select('pesoNeto, pesajeId, pesajes!pesajeId(rutaId, horaEntrada, estado)')
        .gte('pesajes.horaEntrada', inicioMes)
        .eq('pesajes.estado', 'OK'),
    ]);
    if (error) throw error;

    // Conteo de recicladores por ruta
    const { data: recsCount } = await supabase
      .from('recicladores').select('rutaId').not('rutaId', 'is', null);

    const recCountMap = {};
    for (const r of recsCount ?? [])
      recCountMap[r.rutaId] = (recCountMap[r.rutaId] ?? 0) + 1;

    const pesajeToRuta = Object.fromEntries((pesajesIds ?? []).map((p) => [p.id, p.rutaId]));
    const kgMap = {};
    for (const pm of pesosMes ?? []) {
      const rutaId = pesajeToRuta[pm.pesajeId] ?? pm.pesajes?.rutaId;
      if (rutaId) kgMap[rutaId] = (kgMap[rutaId] ?? 0) + Number(pm.pesoNeto ?? 0);
    }

    res.json((rutas ?? []).map((r) => ({
      ...r,
      numRecicladores: recCountMap[r.id] ?? 0,
      kgMes:           kgMap[r.id] ?? 0,
    })));
  } catch (err) {
    console.error('[rutas.listar]', err);
    res.status(500).json({ error: 'Error al listar rutas' });
  }
}

async function resumenCobertura(_req, res) {
  try {
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const [{ count: totalRutas }, { data: todasRutas }, { count: recActivos }, { data: matMes }] = await Promise.all([
      supabase.from('rutas').select('id', { count: 'exact', head: true }).neq('estado', 'Inactiva'),
      supabase.from('rutas').select('barrios'),
      supabase.from('recicladores').select('id', { count: 'exact', head: true }).eq('estado', 'Activa'),
      supabase
        .from('pesaje_materiales')
        .select('pesoNeto, pesajes!pesajeId(horaEntrada, estado)')
        .gte('pesajes.horaEntrada', inicioMes)
        .eq('pesajes.estado', 'OK'),
    ]);

    const totalBarrios = (todasRutas ?? []).reduce((acc, r) => acc + (r.barrios?.length ?? 0), 0);
    const kgMes = (matMes ?? []).reduce((a, pm) => a + Number(pm.pesoNeto ?? 0), 0);

    res.json({ totalRutas: totalRutas ?? 0, totalBarrios, recicladoresActivos: recActivos ?? 0, kgMes });
  } catch (err) {
    console.error('[rutas.resumenCobertura]', err);
    res.status(500).json({ error: 'Error al obtener cobertura' });
  }
}

async function obtener(req, res) {
  try {
    const { data, error } = await supabase
      .from('rutas')
      .select('*, recicladores(id, codigo, nombre, estado, color)')
      .eq('id', Number(req.params.id))
      .single();
    if (error || !data) return res.status(404).json({ error: 'Ruta no encontrada' });
    res.json(data);
  } catch (err) {
    console.error('[rutas.obtener]', err);
    res.status(500).json({ error: 'Error al obtener ruta' });
  }
}

async function crear(req, res) {
  try {
    const { data: existe } = await supabase.from('rutas').select('id').eq('numero', req.body.numero).single();
    if (existe) return res.status(409).json({ error: `La ruta ${req.body.numero} ya existe` });
    const nowRuta = new Date().toISOString();
    const { data, error } = await supabase.from('rutas').insert({ ...req.body, createdAt: nowRuta, updatedAt: nowRuta }).select().single();
    if (error) throw error;
    invalidate('/api/rutas');
    res.status(201).json(data);
  } catch (err) {
    console.error('[rutas.crear]', err);
    res.status(500).json({ error: 'Error al crear ruta' });
  }
}

async function actualizar(req, res) {
  try {
    const { data, error } = await supabase
      .from('rutas').update(req.body).eq('id', Number(req.params.id)).select().single();
    if (error || !data) return res.status(404).json({ error: 'Ruta no encontrada' });
    invalidate('/api/rutas');
    res.json(data);
  } catch (err) {
    console.error('[rutas.actualizar]', err);
    res.status(500).json({ error: 'Error al actualizar ruta' });
  }
}

// ─── VEHÍCULOS ────────────────────────────────────────────────────────────────
const PREFIJOS = { Camion: 'CAM', Carreta: 'CAR', Bicicleta: 'BIC' };

function formatearVehiculo(v) {
  return {
    id:               `VEH-${String(v.id).padStart(3, '0')}`,
    recicladorId:     v.recicladores?.codigo,
    recicladorNombre: v.recicladores?.nombre,
    tipo:             v.tipo,
    identificador:    v.identificador,
    color:            v.color,
    capacidadKg:      v.capacidadKg,
    estado:           v.estado,
    fechaRegistro:    v.fechaRegistro?.slice(0, 10),
    _id:              v.id,
  };
}

async function listarVehiculos(req, res) {
  try {
    let query = supabase
      .from('vehiculos')
      .select('*, recicladores!recicladorId(id, codigo, nombre)')
      .order('fechaRegistro', { ascending: false });
    if (req.query.recicladorId) query = query.eq('recicladorId', Number(req.query.recicladorId));
    const { data, error } = await query;
    if (error) throw error;
    res.json({ data: (data ?? []).map(formatearVehiculo) });
  } catch (err) {
    console.error('[vehiculos.listar]', err);
    res.status(500).json({ error: 'Error al listar vehículos' });
  }
}

async function crearVehiculo(req, res) {
  try {
    const { recicladorId, tipo, color, capacidadKg, estado } = req.body;
    const { data: rec } = await supabase.from('recicladores').select('id').eq('id', recicladorId).single();
    if (!rec) return res.status(404).json({ error: 'Reciclador no encontrado' });

    const now = new Date().toISOString();
    const { data: vehiculo, error } = await supabase
      .from('vehiculos')
      .insert({ recicladorId, tipo, identificador: `TEMP-${Date.now()}`, color, capacidadKg, estado, fechaRegistro: now, createdAt: now, updatedAt: now })
      .select('id').single();
    if (error) throw error;

    const identificador = `${PREFIJOS[tipo] || 'VEH'}-${String(vehiculo.id).padStart(3, '0')}`;
    const { data: actualizado } = await supabase
      .from('vehiculos').update({ identificador, updatedAt: new Date().toISOString() }).eq('id', vehiculo.id)
      .select('*, recicladores!recicladorId(id, codigo, nombre)').single();

    res.status(201).json(formatearVehiculo(actualizado));
  } catch (err) {
    console.error('[vehiculos.crear]', err);
    res.status(500).json({ error: 'Error al crear vehículo' });
  }
}

// ─── BALANCE ──────────────────────────────────────────────────────────────────

async function obtenerMes(req, res) {
  try {
    const [anio, mes] = req.params.yyyymm.split('-').map(Number);

    const { data: registros, error } = await supabase
      .from('balance_mes')
      .select('*, balance_ajustes(*), materiales!materialId(id, nombre, codigo, icono)')
      .eq('anio', anio).eq('mes', mes)
      .order('materialId', { ascending: true });
    if (error) throw error;

    const lista = registros ?? [];
    const totalIngresado = lista.reduce((a, r) => a + Number(r.ingresado), 0);
    const totalVendido   = lista.reduce((a, r) => a + Number(r.vendido), 0);
    const totalRechazos  = lista.reduce((a, r) => a + Number(r.rechazos), 0);

    res.json({
      periodo: `${anio}-${String(mes).padStart(2, '0')}`,
      resumen: {
        ingresado: totalIngresado, vendido: totalVendido, rechazos: totalRechazos,
        diferencia: totalIngresado - (totalVendido + totalRechazos),
        balanceOK: Math.abs(totalIngresado - (totalVendido + totalRechazos)) < 0.01,
      },
      detalle: lista.map((r) => ({
        id: r.id,
        material: r.materiales ?? { id: r.materialId, nombre: 'Desconocido' },
        ingresado: Number(r.ingresado), vendido: Number(r.vendido), rechazos: Number(r.rechazos),
        diferencia: Number(r.ingresado) - (Number(r.vendido) + Number(r.rechazos)),
        balanceOK: Math.abs(Number(r.ingresado) - (Number(r.vendido) + Number(r.rechazos))) < 0.01,
        cerrado: r.cerrado, ajustes: r.balance_ajustes ?? [],
      })),
    });
  } catch (err) {
    console.error('[balance.obtenerMes]', err);
    res.status(500).json({ error: 'Error al obtener balance' });
  }
}

async function recalcularDesdePesajes(req, res) {
  try {
    const [anio, mes] = req.params.yyyymm.split('-').map(Number);
    const inicio = new Date(anio, mes - 1, 1).toISOString();
    const fin    = new Date(anio, mes, 1).toISOString();

    const [{ data: todos }, { data: soloOK }] = await Promise.all([
      supabase
        .from('pesaje_materiales')
        .select('materialId, pesoNeto, rechazo, pesajes!pesajeId(horaEntrada)')
        .gte('pesajes.horaEntrada', inicio).lt('pesajes.horaEntrada', fin),
      supabase
        .from('pesaje_materiales')
        .select('materialId, pesoNeto, rechazo, pesajes!pesajeId(horaEntrada, estado)')
        .gte('pesajes.horaEntrada', inicio).lt('pesajes.horaEntrada', fin)
        .eq('pesajes.estado', 'OK'),
    ]);

    const totalesMap = {};
    for (const pm of todos ?? []) {
      const k = pm.materialId;
      if (!totalesMap[k]) totalesMap[k] = { ingresado: 0, rechazos: 0 };
      totalesMap[k].ingresado += Number(pm.pesoNeto ?? 0);
      totalesMap[k].rechazos  += Number(pm.rechazo ?? 0);
    }
    const okMap = {};
    for (const pm of soloOK ?? []) {
      const k = pm.materialId;
      if (!okMap[k]) okMap[k] = { pesoNeto: 0, rechazo: 0 };
      okMap[k].pesoNeto += Number(pm.pesoNeto ?? 0);
      okMap[k].rechazo  += Number(pm.rechazo ?? 0);
    }

    const nowBalance = new Date().toISOString();
    const upserts = Object.entries(totalesMap).map(([materialId, t]) => ({
      anio, mes, materialId: Number(materialId),
      ingresado: t.ingresado, rechazos: t.rechazos,
      vendido: (okMap[materialId]?.pesoNeto ?? 0) - (okMap[materialId]?.rechazo ?? 0),
      createdAt: nowBalance, updatedAt: nowBalance,
    }));

    // Supabase upsert con constraint compuesto — asegúrate de que la constraint exista en DB
    const { error } = await supabase.from('balance_mes').upsert(upserts, {
      onConflict: 'anio,mes,materialId',
    });
    if (error) throw error;

    res.json({ mensaje: 'Balance recalculado', actualizados: upserts.length });
  } catch (err) {
    console.error('[balance.recalcular]', err);
    res.status(500).json({ error: 'Error al recalcular balance' });
  }
}

async function ajusteManual(req, res) {
  try {
    const { materialId, anio, mes, cantidad, tipo, motivo } = req.body;

    let { data: balance } = await supabase
      .from('balance_mes').select('id, cerrado, ingresado')
      .eq('anio', anio).eq('mes', mes).eq('materialId', materialId).single();

    if (!balance) {
      const { data } = await supabase
        .from('balance_mes')
        .insert({ anio, mes, materialId, ingresado: 0, vendido: 0, rechazos: 0, cerrado: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .select('id, cerrado, ingresado').single();
      balance = data;
    }
    if (balance.cerrado) return res.status(409).json({ error: 'El periodo está cerrado' });

    const { data: ajuste, error } = await supabase
      .from('balance_ajustes')
      .insert({ balanceId: balance.id, cantidad, tipo, motivo, operadorId: req.user.sub, createdAt: new Date().toISOString() })
      .select().single();
    if (error) throw error;

    const delta = tipo === 'entrada' ? Number(cantidad) : -Number(cantidad);
    await supabase.from('balance_mes').update({ ingresado: Number(balance.ingresado) + delta }).eq('id', balance.id);

    res.status(201).json(ajuste);
  } catch (err) {
    console.error('[balance.ajuste]', err);
    res.status(500).json({ error: 'Error al registrar ajuste' });
  }
}

// ─── PQR ──────────────────────────────────────────────────────────────────────

function generarRadicado(id) {
  return `PQR-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;
}

function diasHabiles(dias) {
  const fecha = new Date();
  let agregados = 0;
  while (agregados < dias) {
    fecha.setDate(fecha.getDate() + 1);
    const dia = fecha.getDay();
    if (dia !== 0 && dia !== 6) agregados++;
  }
  return fecha;
}

async function listarPQR(req, res) {
  try {
    const { estado, tipo } = req.query;
    const pageNum  = Math.max(1, Number(req.query.page)  || 1);
    const limitNum = Math.max(1, Number(req.query.limit) || 50);
    const from = (pageNum - 1) * limitNum;
    const to   = from + limitNum - 1;

    let query = supabase
      .from('pqrs')
      .select('*, usuarios!operadorId(id, nombre)', { count: 'exact' })
      .order('createdAt', { ascending: false })
      .range(from, to);
    if (estado) query = query.eq('estado', estado);
    if (tipo)   query = query.eq('tipo', tipo);

    const { data, count, error } = await query;
    if (error) throw error;
    res.json({ data: data ?? [], meta: { total: count ?? 0, page: pageNum, limit: limitNum, pages: Math.ceil((count ?? 0) / limitNum) } });
  } catch (err) {
    console.error('[pqr.listar]', err);
    res.status(500).json({ error: 'Error al listar PQRs' });
  }
}

async function estadisticasPQR(_req, res) {
  try {
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const [
      { count: total }, { count: enTramite }, { count: respondidas },
      { count: cerradas }, { count: quejas }, { data: resueltas },
    ] = await Promise.all([
      supabase.from('pqrs').select('id', { count: 'exact', head: true }).gte('createdAt', inicioMes),
      supabase.from('pqrs').select('id', { count: 'exact', head: true }).eq('estado', 'EnTramite'),
      supabase.from('pqrs').select('id', { count: 'exact', head: true }).eq('estado', 'Respondida').gte('createdAt', inicioMes),
      supabase.from('pqrs').select('id', { count: 'exact', head: true }).eq('estado', 'Cerrada').gte('createdAt', inicioMes),
      supabase.from('pqrs').select('id', { count: 'exact', head: true }).eq('tipo', 'Queja').in('estado', ['Recibida', 'EnTramite']),
      supabase.from('pqrs').select('createdAt, fechaCierre').in('estado', ['Respondida', 'Cerrada']).not('fechaCierre', 'is', null).gte('createdAt', inicioMes),
    ]);

    let tiempoPromedio = 0;
    if (resueltas?.length > 0) {
      const totalDias = resueltas.reduce((acc, p) =>
        acc + (new Date(p.fechaCierre) - new Date(p.createdAt)) / (1000 * 60 * 60 * 24), 0);
      tiempoPromedio = +(totalDias / resueltas.length).toFixed(1);
    }

    res.json({ totalMes: total ?? 0, enTramite: enTramite ?? 0, respondidas: respondidas ?? 0, cerradas: cerradas ?? 0, quejasSinResolver: quejas ?? 0, tiempoPromedioRespuesta: tiempoPromedio });
  } catch (err) {
    console.error('[pqr.estadisticas]', err);
    res.status(500).json({ error: 'Error en estadísticas PQR' });
  }
}

async function obtenerPQR(req, res) {
  try {
    const { data, error } = await supabase
      .from('pqrs')
      .select('*, usuarios!solicitanteId(id, nombre, email), usuarios!operadorId(id, nombre)')
      .eq('radicado', req.params.radicado).single();
    if (error || !data) return res.status(404).json({ error: 'PQR no encontrada' });
    res.json(data);
  } catch (err) {
    console.error('[pqr.obtener]', err);
    res.status(500).json({ error: 'Error al obtener PQR' });
  }
}

async function crearPQR(req, res) {
  try {
    const { count } = await supabase.from('pqrs').select('id', { count: 'exact', head: true });
    const radicado = generarRadicado((count ?? 0) + 1);
    const nowPqr = new Date().toISOString();
    const { data, error } = await supabase
      .from('pqrs')
      .insert({ ...req.body, radicado, fechaLimite: diasHabiles(15).toISOString(), solicitanteId: req.user?.sub ?? null, createdAt: nowPqr, updatedAt: nowPqr })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[pqr.crear]', err);
    res.status(500).json({ error: 'Error al crear PQR' });
  }
}

async function responderPQR(req, res) {
  try {
    const { data: pqr } = await supabase.from('pqrs').select('estado').eq('radicado', req.params.radicado).single();
    if (!pqr) return res.status(404).json({ error: 'PQR no encontrada' });
    if (pqr.estado === 'Cerrada') return res.status(409).json({ error: 'La PQR ya está cerrada' });

    const { data, error } = await supabase
      .from('pqrs')
      .update({ respuesta: req.body.respuesta, estado: 'Respondida', operadorId: req.user.sub, fechaCierre: new Date().toISOString() })
      .eq('radicado', req.params.radicado).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[pqr.responder]', err);
    res.status(500).json({ error: 'Error al responder PQR' });
  }
}

async function cerrarPQR(req, res) {
  try {
    const { data, error } = await supabase
      .from('pqrs')
      .update({ estado: 'Cerrada', fechaCierre: new Date().toISOString() })
      .eq('radicado', req.params.radicado).select().single();
    if (error || !data) return res.status(404).json({ error: 'PQR no encontrada' });
    res.json(data);
  } catch (err) {
    console.error('[pqr.cerrar]', err);
    res.status(500).json({ error: 'Error al cerrar PQR' });
  }
}

module.exports = {
  listar, resumenCobertura, obtener, crear, actualizar,   // rutas
  listarVehiculos, crearVehiculo,                          // vehiculos
  obtenerMes, recalcularDesdePesajes, ajusteManual,        // balance
  listarPQR, estadisticasPQR, obtenerPQR, crearPQR, responderPQR, cerrarPQR, // pqr
};
