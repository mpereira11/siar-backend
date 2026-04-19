const c = require('./combined.controller');
module.exports = {
  listar: c.listar, resumenCobertura: c.resumenCobertura,
  obtener: c.obtener, crear: c.crear, actualizar: c.actualizar,
};
