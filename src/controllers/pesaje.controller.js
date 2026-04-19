const supabase = require('../lib/supabase');
const { invalidate } = require('../lib/cache');

async function listar(req, res) {
  try {
    const { fecha, recicladorId, rutaId, estado } = req.query;
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    let query = supabase
      .from('pesajes')
      .select(`
        id, ticket, horaEntrada, horaSalida, estado, observaciones, createdAt,
        recicladores!recicladorId(id, codigo, nombre, color),
        rutas!rutaId(id, numero, nombre),
        pesaje_materiales(id, pesoNeto, rechazo, materiales!materialId(id, nombre, codigo, icono))
      `, { count: 'exact' })
      .order('horaEntrada', { ascending: false })
      .range(from, to);

    if (fecha) {
      const d = new Date(fecha);
      const sig = new Date(d); sig.setDate(d.getDate() + 1);
      query = query.gte('horaEntrada', d.toISOString()).lt('horaEntrada', sig.toISOString());
    }
    if (recicladorId) query = query.eq('recicladorId', Number(recicladorId));
    if (rutaId)       query = query.eq('rutaId', Number(rutaId));
    if (estado)       query = query.eq('estado', estado);

    if (req.user.rol === 'reciclador_oficio') {
      const { data: rec } = await supabase
        .from('recicladores').select('id').eq('usuarioId', req.user.sub).single();
      if (rec) query = query.eq('recicladorId', rec.id);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({
      data: data ?? [],
      meta: { total: count ?? 0, page, limit, pages: Math.ceil((count ?? 0) / limit) },
    });
  } catch (err) {
    console.error('[pesaje.listar]', err);
    res.status(500).json({ error: 'Error al listar pesajes' });
  }
}

async function registroDia(req, res) {
  try {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);

    const { data: pesajes, error } = await supabase
      .from('pesajes')
      .select(`
        id, ticket, horaEntrada, horaSalida, estado, observaciones,
        recicladores!recicladorId(id, codigo, nombre, color),
        rutas!rutaId(id, numero, nombre),
        pesaje_materiales(id, pesoNeto, rechazo, materiales!materialId(id, nombre, codigo, icono))
      `)
      .gte('horaEntrada', hoy.toISOString())
      .lt('horaEntrada', manana.toISOString())
      .order('createdAt', { ascending: false });

    if (error) throw error;

    const lista = pesajes ?? [];
    const resumen = lista.reduce(
      (acc, p) => {
        acc.totalPesajes++;
        (p.pesaje_materiales ?? []).forEach((m) => {
          acc.pesoTotal    += Number(m.pesoNeto  ?? 0);
          acc.rechazoTotal += Number(m.rechazo ?? 0);
        });
        return acc;
      },
      { totalPesajes: 0, pesoTotal: 0, rechazoTotal: 0 }
    );

    res.json({ resumen, pesajes: lista });
  } catch (err) {
    console.error('[pesaje.registroDia]', err);
    res.status(500).json({ error: 'Error al obtener registro del día' });
  }
}

async function obtener(req, res) {
  try {
    const { data: pesaje, error } = await supabase
      .from('pesajes')
      .select(`
        *,
        recicladores!recicladorId(*),
        rutas!rutaId(*),
        pesaje_materiales(*, materiales!materialId(*))
      `)
      .eq('id', Number(req.params.id))
      .single();

    if (error || !pesaje) return res.status(404).json({ error: 'Pesaje no encontrado' });

    if (req.user.rol === 'reciclador_oficio') {
      const { data: rec } = await supabase
        .from('recicladores').select('id').eq('usuarioId', req.user.sub).single();
      if (!rec || rec.id !== pesaje.recicladorId)
        return res.status(403).json({ error: 'Acceso denegado' });
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

    const [{ data: reciclador }, { data: ruta }] = await Promise.all([
      supabase.from('recicladores').select('id').eq('id', recicladorId).single(),
      supabase.from('rutas').select('id').eq('id', rutaId).single(),
    ]);

    if (!reciclador) return res.status(404).json({ error: 'Reciclador no encontrado' });
    if (!ruta)       return res.status(404).json({ error: 'Ruta no encontrada' });

    const pesoTotal    = materiales.reduce((acc, m) => acc + Number(m.pesoNeto), 0);
    const rechazoTotal = materiales.reduce((acc, m) => acc + Number(m.rechazo ?? 0), 0);
    const estado       = pesoTotal > 0 && rechazoTotal / pesoTotal > 0.3 ? 'Rechazo' : 'OK';

    const now = new Date().toISOString();
    const ticket = `T-${Date.now()}`;

    const { data: pesaje, error: errP } = await supabase
      .from('pesajes')
      .insert({
        ticket,
        recicladorId,
        rutaId,
        horaEntrada:  new Date(horaEntrada).toISOString(),
        horaSalida:   horaSalida ? new Date(horaSalida).toISOString() : null,
        estado,
        observaciones,
        operadorId:   req.user.sub,
        createdAt:    now,
        updatedAt:    now,
      })
      .select('id')
      .single();

    if (errP) throw errP;

    const { error: errM } = await supabase
      .from('pesaje_materiales')
      .insert(materiales.map((m) => ({
        pesajeId:   pesaje.id,
        materialId: m.materialId,
        pesoNeto:   m.pesoNeto,
        rechazo:    m.rechazo ?? 0,
      })));
    if (errM) throw errM;

    const { data: resultado } = await supabase
      .from('pesajes')
      .select(`
        *,
        recicladores!recicladorId(id, codigo, nombre),
        rutas!rutaId(id, numero, nombre),
        pesaje_materiales(*, materiales!materialId(*))
      `)
      .eq('id', pesaje.id)
      .single();

    invalidate('/api/dashboard');
    invalidate('/api/rutas');
    res.status(201).json(resultado);
  } catch (err) {
    console.error('[pesaje.crear]', err);
    res.status(500).json({ error: 'Error al crear pesaje' });
  }
}

async function actualizarEstado(req, res) {
  try {
    const { estado, observaciones } = req.body;
    const { data, error } = await supabase
      .from('pesajes')
      .update({ estado, observaciones })
      .eq('id', Number(req.params.id))
      .select()
      .single();
    if (error || !data) return res.status(404).json({ error: 'Pesaje no encontrado' });
    res.json(data);
  } catch (err) {
    console.error('[pesaje.actualizarEstado]', err);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
}

module.exports = { listar, registroDia, obtener, crear, actualizarEstado };
