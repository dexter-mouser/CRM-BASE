// Embudo de ventas: cada cotización es una oportunidad que pasa por etapas (catálogo de Ajustes).
//  Enviada -> etapas intermedias que define el dueño (por ejemplo, En negociación) -> Ganada (al pasarla a remisión o
//  factura) | Perdida (con un motivo del catálogo; algunos motivos piden detalle).
// Una cotización vencida que no se ganó ni se perdió genera una alerta para su vendedor hasta que registre el motivo.
import { estado, guardarEstado } from '../core/store.js';
import { exigirPermiso, usuarioActual } from '../core/autorizacion.js';
import { exigirTexto, LIMITES } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';
import { buscarElemento, elementos, estaActivo, etapasAbiertas, exigirElemento, nombreDe, ETAPAS_CERRADAS } from './catalogos.service.js';

export const etiquetaDeEtapa = (id) => nombreDe('etapasEmbudo', id);
export const etapaDe = (cotizacion) => cotizacion.etapa;

export const cotizaciones = () => estado.documentos.filter((documento) => documento.tipo === 'cotizacion');
const abierta = (cotizacion) => !ETAPAS_CERRADAS.includes(etapaDe(cotizacion));
export const estaVencida = (cotizacion, ahora = Date.now()) => abierta(cotizacion) && new Date(cotizacion.vigenciaHasta).getTime() < ahora;

// Siguiente etapa abierta y activa de una cotización abierta (null si ya está en la última)
export function siguienteEtapa(cotizacion) {
  if (!abierta(cotizacion)) return null;
  const lista = etapasAbiertas();
  const posicion = lista.findIndex((etapa) => etapa.id === etapaDe(cotizacion));
  return lista.slice(posicion + 1).find((etapa) => etapa.activo) ?? null;
}

// Motivo de pérdida para mostrar: el del catálogo y su detalle; sin motivo de la lista, la cotización se anuló
export function motivoDePerdida(cotizacion) {
  const motivo = cotizacion.motivoPerdida ? nombreDe('motivosPerdida', cotizacion.motivoPerdida) : 'Anulada';
  return cotizacion.detallePerdida ? `${motivo}: ${cotizacion.detallePerdida}` : motivo;
}

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
  if (ETAPAS_CERRADAS.includes(etapa)) throw new Error('Para ganarla, pásala a remisión o factura; para perderla, registra el motivo');
  if (!estaActivo('etapasEmbudo', etapa)) throw new Error('Elige una etapa activa del embudo');
  if (!abierta(cotizacion)) throw new Error(`La cotización ${id} ya está ${etiquetaDeEtapa(etapaDe(cotizacion)).toLowerCase()}`);
  cotizacion.etapa = etapa;
  registrarAuditoria('embudo', 'Etapa cambiada', `${id} · ${etiquetaDeEtapa(etapa)}`);
  guardarEstado();
}

// Pierde la oportunidad con un motivo del catálogo; el detalle es obligatorio si el motivo lo pide
export function marcarPerdida(id, motivo, detalle = '') {
  exigirPermiso('embudo', 'editar', 'registrar oportunidades perdidas');
  const cotizacion = buscarCotizacion(id);
  if (!abierta(cotizacion)) throw new Error(`La cotización ${id} ya está ${etiquetaDeEtapa(etapaDe(cotizacion)).toLowerCase()}`);
  exigirElemento('motivosPerdida', motivo, 'Elige el motivo por el que se perdió');
  const pideDetalle = buscarElemento('motivosPerdida', motivo).pideDetalle;
  const detalleLimpio = exigirTexto(detalle, 'el detalle del motivo', { obligatorio: pideDetalle, maximo: LIMITES.motivo });
  cotizacion.etapa = 'perdida';
  cotizacion.motivoPerdida = motivo;
  cotizacion.detallePerdida = detalleLimpio;
  cotizacion.perdidaEn = new Date().toISOString();
  registrarAuditoria('embudo', 'Oportunidad perdida', `${id} · ${nombreDe('motivosPerdida', motivo)}${detalleLimpio ? ` · ${detalleLimpio}` : ''}`);
  guardarEstado();
}

// Resumen del embudo: cantidad y valor por etapa, valor en juego (abiertas) y tasa de conversión (ganadas sobre cerradas)
export function resumenDelEmbudo(lista = cotizaciones()) {
  const porEtapa = Object.fromEntries(elementos('etapasEmbudo').map((etapa) => [etapa.id, { cantidad: 0, valor: 0 }]));
  let enJuego = 0;
  lista.forEach((cotizacion) => {
    const grupo = porEtapa[etapaDe(cotizacion)];
    grupo.cantidad += 1;
    grupo.valor += cotizacion.total;
    if (abierta(cotizacion)) enJuego += cotizacion.total;
  });
  const cerradas = porEtapa.ganada.cantidad + porEtapa.perdida.cantidad;
  return { porEtapa, enJuego, conversion: cerradas ? Math.round((porEtapa.ganada.cantidad / cerradas) * 100) : 0 };
}
