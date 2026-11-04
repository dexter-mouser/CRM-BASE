// Sucursal activa del navegador. Cada persona trabaja en las tiendas de su alcance (usuario.tiendas; vacío = todas).
// Ventas, caja y stock se registran en la sucursal activa; los listados y reportes muestran la sucursal activa
// o todas a la vez si se elige "Todas las sucursales".
import { estado } from './store.js';
import { preferencias } from './preferencias.js';
import { usuarioActual } from './autorizacion.js';

const CLAVE_TIENDA = 'generico.tienda-activa';
export const TODAS_LAS_TIENDAS = 'todas';

// Tiendas activas que la persona de la sesión puede usar
export function tiendasPermitidas() {
  const alcance = usuarioActual()?.tiendas ?? [];
  return estado.tiendas.filter((tienda) => tienda.activa && (!alcance.length || alcance.includes(tienda.id)));
}

// Con acceso a más de una tienda se puede ver todo junto
export const puedeVerTodas = () => tiendasPermitidas().length > 1;

// Id de la sucursal activa o TODAS_LAS_TIENDAS
export function tiendaActivaId() {
  const permitidas = tiendasPermitidas();
  const guardada = preferencias.leer(CLAVE_TIENDA);
  if (guardada === TODAS_LAS_TIENDAS && puedeVerTodas()) return TODAS_LAS_TIENDAS;
  if (permitidas.some((tienda) => tienda.id === guardada)) return guardada;
  return permitidas[0]?.id ?? '';
}

export const tiendaActiva = () => estado.tiendas.find((tienda) => tienda.id === tiendaActivaId()) ?? null;

export function elegirTienda(id) {
  if (id !== TODAS_LAS_TIENDAS && !tiendasPermitidas().some((tienda) => tienda.id === id)) throw new Error('No tienes acceso a esa sucursal');
  preferencias.guardar(CLAVE_TIENDA, id);
}

// Para registrar ventas, caja o stock hace falta una tienda concreta
export function exigirTiendaActiva(accion = 'continuar') {
  const tienda = tiendaActiva();
  if (!tienda) throw new Error(`Elige una sucursal en el menú superior para ${accion}`);
  return tienda;
}

// Un registro con tiendaId pertenece a la vista actual si coincide con la sucursal activa (o si se ven todas)
export function enTiendaActiva(registro) {
  const activa = tiendaActivaId();
  return activa === TODAS_LAS_TIENDAS || registro.tiendaId === activa;
}

export const nombreDeTienda = (id) => estado.tiendas.find((tienda) => tienda.id === id)?.nombre ?? '—';

// Bodega donde vende y recibe una tienda
export const bodegaDeTienda = (tiendaId) => estado.bodegas.find((bodega) => bodega.id === estado.tiendas.find((tienda) => tienda.id === tiendaId)?.bodegaId)
  ?? estado.bodegas.find((bodega) => bodega.tiendaId === tiendaId && bodega.activa) ?? null;
