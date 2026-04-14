const { z } = require('zod');

const registro13Schema = z.object({
  materialAprovechado: z.number().min(0),
  rechazos: z.number().min(0),
  numRecicladores: z.number().int().min(0),
  ecaRegistrada: z.boolean(),
  numRutas: z.number().int().min(0),
  periodoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodoFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const registro14Schema = z.object({
  totalLiquidado: z.number().min(0),
  recicladoresConIngresos: z.number().int().min(0),
  totalRecicladores: z.number().int().min(0),
  tasaAprovechamiento: z.number().min(0),
  promedioPorReciclador: z.number().min(0),
  quejas: z.number().int().min(0),
});

const crearReporteSchema = z.object({
  anio: z.number().int().min(2020).max(2099),
  mes: z.number().int().min(1).max(12),
  registro13: registro13Schema,
  registro14: registro14Schema,
});

const actualizarReporteSchema = crearReporteSchema.partial();

const generarReporteSchema = z.object({
  anio: z.number().int().min(2020).max(2099),
  mes: z.number().int().min(1).max(12),
});

module.exports = { crearReporteSchema, actualizarReporteSchema, generarReporteSchema };
