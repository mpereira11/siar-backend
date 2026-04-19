const supabase = require('../lib/supabase');
const { invalidate } = require('../lib/cache');

async function listar(_req, res) {
  try {
    const { data, error } = await supabase
      .from('materiales')
      .select('id, nombre, codigo, icono, unidad, precios_material(precio, tendencia, vigenciaDesde, vigenciaHasta)')
      .order('nombre', { ascending: true });
    if (error) throw error;

    res.json((data ?? []).map((m) => {
      const vigente = (m.precios_material ?? [])
        .filter((p) => !p.vigenciaHasta)
        .sort((a, b) => new Date(b.vigenciaDesde) - new Date(a.vigenciaDesde))[0];
      return {
        id: m.id, nombre: m.nombre, codigo: m.codigo, icono: m.icono, unidad: m.unidad,
        precio:       vigente ? Number(vigente.precio) : null,
        tendencia:    vigente?.tendencia ?? 'estable',
        vigenciaDesde: vigente?.vigenciaDesde ?? null,
      };
    }));
  } catch (err) {
    console.error('[materiales.listar]', err);
    res.status(500).json({ error: 'Error al listar materiales' });
  }
}

async function obtener(req, res) {
  try {
    const { data, error } = await supabase
      .from('materiales')
      .select('*, precios_material(*), compradores(*)')
      .eq('id', Number(req.params.id))
      .single();
    if (error || !data) return res.status(404).json({ error: 'Material no encontrado' });
    res.json(data);
  } catch (err) {
    console.error('[materiales.obtener]', err);
    res.status(500).json({ error: 'Error al obtener material' });
  }
}

async function crear(req, res) {
  try {
    const { data: existe } = await supabase
      .from('materiales').select('id').eq('codigo', req.body.codigo).single();
    if (existe) return res.status(409).json({ error: `El código ${req.body.codigo} ya existe` });

    const { data, error } = await supabase.from('materiales').insert(req.body).select().single();
    if (error) throw error;
    invalidate('/api/materiales');
    res.status(201).json(data);
  } catch (err) {
    console.error('[materiales.crear]', err);
    res.status(500).json({ error: 'Error al crear material' });
  }
}

async function actualizarPrecio(req, res) {
  try {
    const id = Number(req.params.id);
    const { precio, tendencia, vigenciaDesde } = req.body;

    const { data: material } = await supabase
      .from('materiales').select('id, nombre').eq('id', id).single();
    if (!material) return res.status(404).json({ error: 'Material no encontrado' });

    // Cerrar precio anterior
    await supabase
      .from('precios_material')
      .update({ vigenciaHasta: new Date().toISOString() })
      .eq('materialId', id)
      .is('vigenciaHasta', null);

    const { data: nuevoPrecio, error } = await supabase
      .from('precios_material')
      .insert({
        materialId:    id,
        precio,
        tendencia,
        vigenciaDesde: vigenciaDesde ? new Date(vigenciaDesde).toISOString() : new Date().toISOString(),
        operadorId:    req.user.sub,
      })
      .select().single();
    if (error) throw error;

    invalidate('/api/materiales');
    invalidate('/api/dashboard');
    res.json({ material: { id, nombre: material.nombre }, nuevoPrecio });
  } catch (err) {
    console.error('[materiales.actualizarPrecio]', err);
    res.status(500).json({ error: 'Error al actualizar precio' });
  }
}

async function historialPrecios(req, res) {
  try {
    const id = Number(req.params.id);
    const { data: material } = await supabase
      .from('materiales').select('id, nombre, codigo').eq('id', id).single();
    if (!material) return res.status(404).json({ error: 'Material no encontrado' });

    const { data: precios } = await supabase
      .from('precios_material').select('*').eq('materialId', id)
      .order('vigenciaDesde', { ascending: false });

    res.json({ material, precios: precios ?? [] });
  } catch (err) {
    console.error('[materiales.historialPrecios]', err);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
}

async function listarCompradores(_req, res) {
  try {
    const { data, error } = await supabase
      .from('compradores')
      .select('*, materiales!materialId(id, nombre, codigo, icono)')
      .eq('activo', true)
      .order('empresa', { ascending: true });
    if (error) throw error;
    res.json(data ?? []);
  } catch (err) {
    console.error('[materiales.listarCompradores]', err);
    res.status(500).json({ error: 'Error al listar compradores' });
  }
}

async function crearComprador(req, res) {
  try {
    const { data, error } = await supabase
      .from('compradores').insert(req.body)
      .select('*, materiales!materialId(nombre, codigo)').single();
    if (error) throw error;
    invalidate('/api/materiales');
    res.status(201).json(data);
  } catch (err) {
    console.error('[materiales.crearComprador]', err);
    res.status(500).json({ error: 'Error al crear comprador' });
  }
}

module.exports = { listar, obtener, crear, actualizarPrecio, historialPrecios, listarCompradores, crearComprador };
