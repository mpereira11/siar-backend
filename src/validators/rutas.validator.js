const { z } = require('zod');

const crearRutaSchema = z.object({
  numero: z.string().regex(/^R-\d{2}$/, 'Formato: R-01, R-02...'),
  nombre: z.string().min(2).max(100),
  descripcion: z.string().max(300).optional(),
  barrios: z.array(z.string().min(1)).min(1, 'Debe incluir al menos un barrio'),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  estado: z.enum(['Activa', 'Parcial', 'Inactiva']).default('Activa'),
});

const actualizarRutaSchema = crearRutaSchema.partial();

module.exports = { crearRutaSchema, actualizarRutaSchema };
