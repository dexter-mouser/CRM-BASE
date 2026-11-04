// Reglas de negocio de Ajustes: datos del negocio, marca, recibo, ventas y restablecimiento de datos de prueba.
// Los catálogos y parámetros (medios de pago, prefijos, etapas…) están en catalogos.service.js.
import { estado, guardarEstado } from '../core/store.js';
import { semilla } from '../data/seed.js';
import { borrarBusquedas } from '../core/busquedas.js';
import { exigirPermiso } from '../core/autorizacion.js';
import { exigirTelefono, exigirTexto, LIMITES } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';

// Lecturas de los ajustes para las pantallas y los comprobantes
export const datosDelNegocio = () => estado.ajustes.tienda;
export const ajustesDeRecibo = () => estado.ajustes.recibo;
export const marcaActual = () => estado.ajustes.marca;
export const permiteVenderSinExistencias = () => estado.ajustes.ventas.permitirSinExistencias;
export const ordenDelPanel = () => estado.orden;

// El orden de las tarjetas del panel es una lista de índices sin repetir
export function guardarOrdenDelPanel(orden) {
  const esValido = Array.isArray(orden) && orden.length === estado.orden.length
    && orden.every((indice) => estado.orden.includes(indice)) && new Set(orden).size === orden.length;
  if (!esValido) throw new Error('No se pudo cambiar el orden de las tarjetas');
  estado.orden = orden;
  guardarEstado();
}

export function guardarDatosTienda({ nombre, nit, telefono, ciudad, direccion }) {
  exigirPermiso('ajustes', 'editar', 'cambiar los ajustes');
  Object.assign(estado.ajustes.tienda, {
    nombre: exigirTexto(nombre, 'el nombre del negocio'),
    nit: exigirTexto(nit, 'el NIT', { obligatorio: false, maximo: 30 }),
    telefono: exigirTelefono(telefono),
    ciudad: exigirTexto(ciudad, 'la ciudad', { obligatorio: false }),
    direccion: exigirTexto(direccion, 'la dirección', { obligatorio: false, maximo: LIMITES.textoLargo }),
  });
  registrarAuditoria('ajustes', 'Datos del negocio', estado.ajustes.tienda.nombre);
  guardarEstado();
}

// Anchos de papel de las impresoras de tirilla (punto de venta)
export const ANCHOS_TIRILLA = [80, 58];

// Recibo: mensaje final y ancho de la tirilla
export function guardarRecibo({ pie, anchoTirilla }) {
  exigirPermiso('ajustes', 'editar', 'cambiar los ajustes');
  const ancho = Number(anchoTirilla);
  if (!ANCHOS_TIRILLA.includes(ancho)) throw new Error('Elige el ancho de la tirilla');
  estado.ajustes.recibo.pie = exigirTexto(pie, 'el mensaje del recibo', { obligatorio: false, maximo: LIMITES.textoLargo });
  estado.ajustes.recibo.anchoTirilla = ancho;
  registrarAuditoria('ajustes', 'Recibo', `Tirilla de ${ancho} mm`);
  guardarEstado();
}

export function establecerMostrarDatosTienda(valor) {
  exigirPermiso('ajustes', 'editar', 'cambiar los ajustes');
  estado.ajustes.recibo.mostrarDatosTienda = Boolean(valor);
  registrarAuditoria('ajustes', 'Datos del negocio en el recibo', valor ? 'Se muestran' : 'Se ocultan');
  guardarEstado();
}

// Marca: nombre comercial del encabezado y el ingreso, logo (imagen pequeña en data URL; vacío = el de Genérico) y
// color de acento en formato #rrggbb
const LOGO_MAXIMO_BYTES = 200 * 1024;
const PATRON_LOGO = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

export function guardarMarca({ nombreComercial, acento, logo }) {
  exigirPermiso('ajustes', 'editar', 'cambiar los ajustes');
  const color = String(acento ?? '').trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error('Elige el color de la marca');
  const imagen = String(logo ?? '');
  if (imagen && !PATRON_LOGO.test(imagen)) throw new Error('El logo debe ser una imagen PNG, JPG, WEBP o SVG');
  if (imagen.length * 0.75 > LOGO_MAXIMO_BYTES) throw new Error('El logo es demasiado grande (máximo 200 KB)');
  estado.ajustes.marca = { nombreComercial: exigirTexto(nombreComercial, 'el nombre comercial', { maximo: 40 }), acento: color, logo: imagen };
  registrarAuditoria('ajustes', 'Marca', `${estado.ajustes.marca.nombreComercial} · ${color}${imagen ? ' · con logo' : ''}`);
  guardarEstado();
}

export function establecerPermitirSinExistencias(valor) {
  exigirPermiso('ajustes', 'editar', 'cambiar los ajustes');
  estado.ajustes.ventas.permitirSinExistencias = Boolean(valor);
  registrarAuditoria('ajustes', 'Ventas sin existencias', valor ? 'Permitidas' : 'No permitidas');
  guardarEstado();
}

// Deja el inventario, las ventas, las remisiones y cotizaciones, los clientes y su seguimiento, los proveedores, los
// pagos, la caja, los traslados y la contabilidad como en la instalación (vacíos, con el Consumidor final y el producto
// genérico). También los catálogos y parámetros, porque esos datos usan sus códigos. Los datos del negocio, la marca,
// el recibo, roles, personas, tiendas, bodegas, empleados y la auditoría no cambian
export function restablecerDatosIniciales() {
  exigirPermiso('ajustes', 'editar', 'cambiar los ajustes');
  const datos = structuredClone(semilla);
  const claves = ['productos', 'ventas', 'documentos', 'facturas', 'orden', 'clientes', 'pagos', 'cajas', 'movimientosCaja', 'contabilidad',
    'devoluciones', 'actividades', 'proveedores', 'ordenesCompra', 'ajustesInventario', 'traslados'];
  claves.forEach((clave) => { estado[clave] = datos[clave]; });
  estado.ajustes.catalogos = datos.ajustes.catalogos;
  estado.ajustes.parametros = datos.ajustes.parametros;
  borrarBusquedas();
  registrarAuditoria('ajustes', 'Datos iniciales restablecidos', '');
  guardarEstado();
}
