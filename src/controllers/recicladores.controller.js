const supabase = require('../lib/supabase');
const { invalidate } = require('../lib/cache');

async function listar(req, res) {
  try {
    const { rutaId, estado, q } = req.query;
    const p   = Math.max(1, Number(req.query.page)  || 1);
    const lim = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const from = (p - 1) * lim;
    const to   = from + lim - 1;

    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
    const inicioSem = new Date(hoy);
    inicioSem.setDate(hoy.getDate() - hoy.getDay());
    inicioSem.setHours(0, 0, 0, 0);

    let query = supabase
      .from('recicladores')
      .select('id, codigo, nombre, estado, color, telefono, rutaId, rutas!rutaId(id, numero, nombre)', { count: 'exact' })
      .order('nombre', { ascending: true })
      .range(from, to);

    if (rutaId) query = query.eq('rutaId', Number(rutaId));
    if (estado) query = query.eq('estado', estado);
    if (q)      query = query.or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%`);

    const { data: recicladores, count, error } = await query;
    if (error) throw error;
    if (!recicladores?.length)
      return res.json({ data: [], meta: { total: 0, page: p, limit: lim, pages: 0 } });

    const ids = recicladores.map((r) => r.id);

    const [{ data: kgMesRaw }, { data: pesajesSemana }, { data: pesajesCount }] = await Promise.all([
      // kg este mes
      supabase
        .from('pesaje_materiales')
        .select('pesoNeto, pesajes!pesajeId(recicladorId, horaEntrada, estado)')
        .gte('pesajes.horaEntrada', inicioMes)
        .eq('pesajes.estado', 'OK')
        .in('pesajes.recicladorId', ids),

      // ingreso semanal — necesita precio vigente
      supabase
        .from('pesajes')
        .select(`
          recicladorId,
          pesaje_materiales(pesoNeto, rechazo,
            materiales!materialId(precios_material(precio, vigenciaHasta)))
        `)
        .gte('horaEntrada', inicioSem.toISOString())
        .eq('estado', 'OK')
        .in('recicladorId', ids),

      // conteo total pesajes
      supabase
        .from('pesajes')
        .select('recicladorId')
        .in('recicladorId', ids),
    ]);

    const kgMesMap = {};
    for (const pm of kgMesRaw ?? []) {
      const recId = pm.pesajes?.recicladorId;
      if (recId) kgMesMap[recId] = (kgMesMap[recId] ?? 0) + Number(pm.pesoNeto ?? 0);
    }

    const ingresoSemMap = {};
    for (const p of pesajesSemana ?? []) {
      for (const pm of p.pesaje_materiales ?? []) {
        const vigente = (pm.materiales?.precios_material ?? [])
          .filter((x) => !x.vigenciaHasta)
          .sort((a, b) => new Date(b.vigenciaDesde) - new Date(a.vigenciaDesde))[0];
        const precio = Number(vigente?.precio ?? 0);
        const kg = Number(pm.pesoNeto ?? 0) - Number(pm.rechazo ?? 0);
        if (kg > 0)
          ingresoSemMap[p.recicladorId] = (ingresoSemMap[p.recicladorId] ?? 0) + kg * precio;
      }
    }

    const conteoMap = {};
    for (const p of pesajesCount ?? [])
      conteoMap[p.recicladorId] = (conteoMap[p.recicladorId] ?? 0) + 1;

    const data = recicladores.map((r) => ({
      ...r,
      kgMes:        kgMesMap[r.id] ?? 0,
      totalPesajes: conteoMap[r.id] ?? 0,
      ingresoSemana: ingresoSemMap[r.id] ?? 0,
    }));

    res.json({ data, meta: { total: count ?? 0, page: p, limit: lim, pages: Math.ceil((count ?? 0) / lim) } });
  } catch (err) {
    console.error('[recicladores.listar]', err);
    res.status(500).json({ error: 'Error al listar recicladores' });
  }
}

async function obtener(req, res) {
  try {
    const id = Number(req.params.id);
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();

    const [
      { data: reciclador, error },
      { data: matMes },
      { count: visitasMes },
      { data: pesajesRecientes },
    ] = await Promise.all([
      supabase
        .from('recicladores')
        .select('*, rutas!rutaId(*), usuarios!usuarioId(id, email, activo)')
        .eq('id', id)
        .single(),
      supabase
        .from('pesajes')
        .select('pesaje_materiales(pesoNeto)')
        .eq('recicladorId', id)
        .gte('horaEntrada', inicioMes)
        .eq('estado', 'OK'),
      supabase
        .from('pesajes')
        .select('id', { count: 'exact', head: true })
        .eq('recicladorId', id)
        .gte('horaEntrada', inicioMes),
      supabase
        .from('pesajes')
        .select(`
          *,
          rutas!rutaId(numero, nombre),
          pesaje_materiales(*, materiales!materialId(nombre, icono))
        `)
        .eq('recicladorId', id)
        .order('horaEntrada', { ascending: false })
        .limit(10),
    ]);

    if (error || !reciclador) return res.status(404).json({ error: 'Reciclador no encontrado' });

    const kgMes = (matMes ?? []).reduce((acc, p) =>
      acc + (p.pesaje_materiales ?? []).reduce((s, m) => s + Number(m.pesoNeto ?? 0), 0), 0);

    res.json({
      ...reciclador,
      estadisticas: { kgMes, visitasMes: visitasMes ?? 0 },
      actividadReciente: pesajesRecientes ?? [],
    });
  } catch (err) {
    console.error('[recicladores.obtener]', err);
    res.status(500).json({ error: 'Error al obtener reciclador' });
  }
}

async function crear(req, res) {
  try {
    const { data: ultimo } = await supabase
      .from('recicladores')
      .select('codigo')
      .order('id', { ascending: false })
      .limit(1)
      .single();

    const nuevoNum = (ultimo ? parseInt(ultimo.codigo.split('-')[1]) + 1 : 1)
      .toString().padStart(4, '0');

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('recicladores')
      .insert({ ...req.body, codigo: `ID-${nuevoNum}`, createdAt: now, updatedAt: now })
      .select('*, rutas!rutaId(*)')
      .single();

    if (error) throw error;
    invalidate('/api/recicladores');
    invalidate('/api/dashboard');
    res.status(201).json(data);
  } catch (err) {
    console.error('[recicladores.crear]', err);
    res.status(500).json({ error: 'Error al crear reciclador' });
  }
}

async function actualizar(req, res) {
  try {
    const { data, error } = await supabase
      .from('recicladores')
      .update(req.body)
      .eq('id', Number(req.params.id))
      .select('*, rutas!rutaId(*)')
      .single();

    if (error || !data) return res.status(404).json({ error: 'Reciclador no encontrado' });
    invalidate('/api/recicladores');
    res.json(data);
  } catch (err) {
    console.error('[recicladores.actualizar]', err);
    res.status(500).json({ error: 'Error al actualizar reciclador' });
  }
}

async function historial(req, res) {
  try {
    const id  = Number(req.params.id);
    const p   = Math.max(1, Number(req.query.page)  || 1);
    const lim = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const from = (p - 1) * lim;
    const to   = from + lim - 1;

    const { data, count, error } = await supabase
      .from('pesajes')
      .select(`
        *, rutas!rutaId(numero, nombre),
        pesaje_materiales(*, materiales!materialId(nombre, icono, codigo))
      `, { count: 'exact' })
      .eq('recicladorId', id)
      .order('horaEntrada', { ascending: false })
      .range(from, to);

    if (error) throw error;
    res.json({ data: data ?? [], meta: { total: count ?? 0, page: p, limit: lim, pages: Math.ceil((count ?? 0) / lim) } });
  } catch (err) {
    console.error('[recicladores.historial]', err);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
}

async function cuentaCobro(req, res) {
  try {
    const id = Number(req.params.id);
    const a  = Number(req.query.anio) || new Date().getFullYear();
    const m  = Number(req.query.mes)  || new Date().getMonth() + 1;
    const inicio = new Date(a, m - 1, 1).toISOString();
    const fin    = new Date(a, m, 1).toISOString();

    const [{ data: reciclador }, { data: pesajes }] = await Promise.all([
      supabase.from('recicladores').select('*, rutas!rutaId(*)').eq('id', id).single(),
      supabase
        .from('pesajes')
        .select(`
          horaEntrada,
          pesaje_materiales(pesoNeto,
            materiales!materialId(nombre, precios_material(precio, vigenciaHasta, vigenciaDesde)))
        `)
        .eq('recicladorId', id)
        .gte('horaEntrada', inicio)
        .lt('horaEntrada', fin)
        .eq('estado', 'OK'),
    ]);

    if (!reciclador) return res.status(404).json({ error: 'Reciclador no encontrado' });

    let totalKg = 0, totalValor = 0;
    const detalles = [];

    for (const pesaje of pesajes ?? []) {
      for (const pm of pesaje.pesaje_materiales ?? []) {
        const vigente = (pm.materiales?.precios_material ?? [])
          .filter((p) => !p.vigenciaHasta)
          .sort((a, b) => new Date(b.vigenciaDesde) - new Date(a.vigenciaDesde))[0];
        const precio = Number(vigente?.precio ?? 0);
        const kg = Number(pm.pesoNeto);
        totalKg    += kg;
        totalValor += kg * precio;
        detalles.push({ fecha: pesaje.horaEntrada, material: pm.materiales?.nombre, kg, precioPorKg: precio, valor: kg * precio });
      }
    }

    res.json({
      reciclador: { id: reciclador.id, codigo: reciclador.codigo, nombre: reciclador.nombre },
      periodo: `${a}-${String(m).padStart(2, '0')}`,
      totalKg, totalValor, visitas: (pesajes ?? []).length, detalles,
    });
  } catch (err) {
    console.error('[recicladores.cuentaCobro]', err);
    res.status(500).json({ error: 'Error al generar cuenta de cobro' });
  }
}

module.exports = { listar, obtener, crear, actualizar, historial, cuentaCobro };