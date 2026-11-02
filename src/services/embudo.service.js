// Embudo de ventas: cada cotización es una oportunidad que pasa por etapas.
//  enviada -> negociacion -> ganada (al pasarla a remisión o factura) | perdida (con motivo obligatorio)
// Una cotización vencida que no se ganó ni se perdió genera una alerta para su vendedor hasta que registre el motivo.
import { estado, guardarEstado } from '../core/store.js';
import { exigirPermiso, usuarioActual } from '../core/autorizacion.js';
import { exigirTexto, LIMITES } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';

export const ETAPAS = [
  { id: 'enviada', etiqueta: 'Enviada' },
  { id: 'negociacion', etiqueta: 'En negociación' },
  { id: 'ganada', etiqueta: 'Ganada' },
  { id: 'perdida', etiqueta: 'Perdida' },
];

export const MOTIVOS_PERDIDA = ['Precio', 'Sin existencias', 'Compró a la competencia', 'Sin respuesta del cliente', 'Ya no lo necesita', 'Otro'];

export const etiquetaDeEtapa = (id) => ETAPAS.find((etapa) => etapa.id === id)?.etiqueta ?? id;

// Las cotizaciones guardadas antes de existir el embudo se ubican según su estado
export function etapaDe(cotizacion) {
  if (cotizacion.convertidoEn) return 'ganada';
  if (cotizacion.anulado) return 'perdida';
  return cotizacion.etapa ?? 'enviada';
}

export const cotizaciones = () => estado.documentos.filter((documento) => documento.tipo === 'cotizacion');
const abierta = (cotizacion) => ['enviada', 'negociacion'].includes(etapaDe(cotizacion));
export const estaVencida = (cotizacion, ahora = Date.now()) => abierta(cotizacion) && new Date(cotizacion.vigenciaHasta).getTime() < ahora;

const buscarCotizacion = (id) => {
  const cotizacion = cotizaciones().find((candidata) => candidata.id === id);
  if (!cotizacion) throw new Error('La cotización no existe');
  return cotizacion;
};

const esPropietarioActual = () => {
  const usuario = usuarioActual();
  return Boolean(estado.roles.find((rol) => rol.id === usuario?.rolId)?.protegido);
};

// Alertas del perfil de la sesión: cotizaciones vencidas sin cerrar de ese vendedor (el Propietario ve todas)
export function alertasDeCotizaciones() {
  const correo = usuarioActual()?.correo;
  const todas = esPropietarioActual();
  return cotizaciones().filter((cotizacion) => estaVencida(cotizacion) && (todas || cotizacion.usuarioCorreo === correo));
}

export function cambiarEtapa(id, etapa) {
  exigirPermiso('embudo', 'editar', 'mover oportunidades del embudo');
  const cotizacion = buscarCotizacion(id);
  if (!['enviada', 'negociacion'].includes(etapa)) throw new Error('Para ganarla, pásala a remisión o factura; para perderla, registra el motivo');
  if (!abierta(cotizacion)) throw new Error(`La cotización ${id} ya está ${etiquetaDeEtapa(etapaDe(cotizacion)).toLowerCase()}`);
  cotizacion.etapa = etapa;
  registrarAuditoria('embudo', 'Etapa cambiada', `${id} · ${etiquetaDeEtapa(etapa)}`);
  guardarEstado();
}

// Pierde la oportunidad con un motivo de la lista y un detalle (obligatorio si el motivo es "Otro")
export function marcarPerdida(id, motivo, detalle = '') {
  exigirPermiso('embudo', 'editar', 'registrar oportunidades perdidas');
  const cotizacion = buscarCotizacion(id);
  if (!abierta(cotizacion)) throw new Error(`La cotización ${id} ya está ${etiquetaDeEtapa(etapaDe(cotizacion)).toLowerCase()}`);
  if (!MOTIVOS_PERDIDA.includes(motivo)) throw new Error('Elige el motivo por el que se perdió');
  const detalleLimpio = exigirTexto(detalle, 'el detalle del motivo', { obligatorio: motivo === 'Otro', maximo: LIMITES.motivo });
  cotizacion.etapa = 'perdida';
  cotizacion.motivoPerdida = motivo;
  cotizacion.detallePerdida = detalleLimpio;
  cotizacion.perdidaEn = new Date().toISOString();
  registrarAuditoria('embudo', 'Oportunidad perdida', `${id} · ${motivo}${detalleLimpio ? ` · ${detalleLimpio}` : ''}`);
  guardarEstado();
}

// Resumen del embudo: cantidad y valor por etapa, y tasa de conversión (ganadas sobre cerradas)
export function resumenDelEmbudo(lista = cotizaciones()) {
  const porEtapa = Object.fromEntries(ETAPAS.map((etapa) => [etapa.id, { cantidad: 0, valor: 0 }]));
  lista.forEach((cotizacion) => {
    const grupo = porEtapa[etapaDe(cotizacion)];
    grupo.cantidad += 1;
    grupo.valor += cotizacion.total;
  });
  const cerradas = porEtapa.ganada.cantidad + porEtapa.perdida.cantidad;
  return { porEtapa, conversion: cerradas ? Math.round((porEtapa.ganada.cantidad / cerradas) * 100) : 0 };
}
