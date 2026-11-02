// Tiendas (sedes) de la empresa. Cada tienda tiene su bodega, su caja y sus ventas.
import { estado, guardarEstado } from '../core/store.js';
import { siguienteCodigo } from '../core/codigos.js';
import { exigirPermiso } from '../core/autorizacion.js';
import { exigirTelefono, exigirTexto, LIMITES, LISTAS_PRECIO_VALIDAS } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';
import { aFechaLocal, fechaDeHoy } from '../core/format.js';

const normalizar = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const buscarTienda = (id) => estado.tiendas.find((tienda) => tienda.id === id);

// Ventas del mes en curso, caja y personas de una tienda
export function resumenDeTienda(tiendaId) {
  const mes = fechaDeHoy().slice(0, 7);
  const ventasMes = estado.ventas.filter((venta) => venta.tiendaId === tiendaId && aFechaLocal(venta.fecha).startsWith(mes));
  return {
    ventasMes: ventasMes.reduce((suma, venta) => suma + venta.total, 0),
    cantidadMes: ventasMes.length,
    cajaAbierta: estado.cajas.some((caja) => caja.tiendaId === tiendaId && !caja.cierre),
    empleados: estado.empleados.filter((empleado) => empleado.activo && empleado.tiendaId === tiendaId).length,
  };
}

function prepararTienda(datos, idActual) {
  const limpios = {
    nombre: exigirTexto(datos.nombre, 'el nombre de la sucursal', { maximo: 60 }),
    direccion: exigirTexto(datos.direccion, 'la dirección', { obligatorio: false, maximo: LIMITES.textoLargo }),
    telefono: exigirTelefono(datos.telefono),
    ciudad: exigirTexto(datos.ciudad, 'la ciudad', { obligatorio: false }),
    listaPrecio: LISTAS_PRECIO_VALIDAS.includes(datos.listaPrecio) ? datos.listaPrecio : 'detal',
  };
  if (estado.tiendas.some((tienda) => tienda.id !== idActual && normalizar(tienda.nombre) === normalizar(limpios.nombre))) {
    throw new Error(`Ya existe una sucursal llamada ${limpios.nombre}`);
  }
  const bodega = estado.bodegas.find((candidata) => candidata.id === datos.bodegaId && candidata.activa);
  if (datos.bodegaId && !bodega) throw new Error('Elige una bodega activa');
  limpios.bodegaId = bodega?.id ?? '';
  return limpios;
}

// Al crear una tienda sin bodega se le crea una con su nombre
export function agregarTienda(datos) {
  exigirPermiso('tiendas', 'crear', 'crear sucursales');
  const limpios = prepararTienda(datos, null);
  const tienda = { id: siguienteCodigo(estado.tiendas.map((existente) => existente.id), 'T', 2), ...limpios, activa: true };
  if (!tienda.bodegaId) {
    const bodega = { id: siguienteCodigo(estado.bodegas.map((existente) => existente.id), 'B', 2), nombre: `Bodega ${tienda.nombre}`, tiendaId: tienda.id, direccion: tienda.direccion, activa: true };
    estado.bodegas.push(bodega);
    tienda.bodegaId = bodega.id;
  }
  estado.tiendas.push(tienda);
  registrarAuditoria('tiendas', 'Sucursal creada', `${tienda.id} · ${tienda.nombre}`);
  guardarEstado();
  return tienda;
}

export function actualizarTienda(id, datos) {
  exigirPermiso('tiendas', 'editar', 'editar sucursales');
  const tienda = buscarTienda(id);
  if (!tienda) throw new Error('La sucursal no existe');
  const limpios = prepararTienda(datos, id);
  if (!limpios.bodegaId) throw new Error('Elige la bodega donde vende la sucursal');
  Object.assign(tienda, limpios);
  registrarAuditoria('tiendas', 'Sucursal editada', `${tienda.id} · ${tienda.nombre}`);
  guardarEstado();
}

// Debe quedar al menos una sucursal activa, y una tienda con la caja abierta no se desactiva
export function cambiarEstadoTienda(id, activa) {
  exigirPermiso('tiendas', 'editar', 'activar o desactivar sucursales');
  const tienda = buscarTienda(id);
  if (!tienda) throw new Error('La sucursal no existe');
  if (!activa) {
    if (!estado.tiendas.some((otra) => otra.id !== id && otra.activa)) throw new Error('Debe quedar al menos una sucursal activa');
    if (resumenDeTienda(id).cajaAbierta) throw new Error(`${tienda.nombre} tiene la caja abierta: ciérrala antes`);
  }
  tienda.activa = Boolean(activa);
  registrarAuditoria('tiendas', activa ? 'Sucursal activada' : 'Tienda desactivada', tienda.nombre);
  guardarEstado();
}
