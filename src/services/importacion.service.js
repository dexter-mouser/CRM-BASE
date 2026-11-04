// Importación CSV de documentos y de sucursales, bodegas y usuarios. Cada documento del archivo (las filas con el mismo
// número) se registra con la misma función que usa su pantalla: mueve stock, caja y deuda, valida existencias, caja
// abierta y cupo, y toma el siguiente consecutivo de la app. Si un documento falla, todo vuelve a como estaba.
import { estado, guardarEstado } from '../core/store.js';
import { exigirPermiso } from '../core/autorizacion.js';
import { agruparPorDocumento, aplicarTodoONada, etiquetaDeGrupo } from '../core/importacion.js';
import { registrarAuditoria } from './auditoria.service.js';
import { idPorNombre } from './catalogos.service.js';
import { buscarProductoPorId, registrarFactura, LISTAS_PRECIO } from './inventario.service.js';
import { anularVenta, devolverProductos, leerDescuento, registrarVenta } from './ventas.service.js';
import { buscarCliente } from './clientes.service.js';
import { registrarAbono, registrarPagoProveedor } from './pagos.service.js';
import { registrarOrden } from './proveedores.service.js';
import { registrarMovimiento } from './caja.service.js';
import { actualizarBodega, agregarBodega, enviarTraslado } from './bodegas.service.js';
import { actualizarTienda, agregarTienda } from './tiendas.service.js';
import { agregarUsuario, cambiarRolUsuario } from './roles.service.js';
import { registrarActividad } from './actividades.service.js';

const normalizar = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// --- Búsquedas por lo que se escribe en el archivo ------------------------------------------------------------
function exigirProducto(codigo) {
  const producto = buscarProductoPorId(String(Number(codigo)));
  if (!producto) throw new Error(`no existe el producto ${codigo || '(vacío)'}`);
  return producto;
}

function exigirCliente(codigo) {
  if (!codigo) throw new Error('escribe el código del cliente (C-000 es el consumidor final)');
  const cliente = buscarCliente(codigo.toUpperCase());
  if (!cliente) throw new Error(`no existe el cliente ${codigo}`);
  return cliente;
}

const porNombre = (lista, nombre, etiqueta) => {
  const encontrado = lista.find((elemento) => normalizar(elemento.nombre) === normalizar(nombre));
  if (!encontrado) throw new Error(`no existe ${etiqueta} «${nombre}»`);
  return encontrado;
};

// "Remisión" -> remision; las opciones son [valor, nombre aceptado]
function opcionEscrita(texto, opciones, mensaje) {
  const opcion = opciones.find(([, nombre]) => normalizar(nombre) === normalizar(texto));
  if (!opcion) throw new Error(mensaje);
  return opcion[0];
}

function listaPorNumero(numero) {
  if (!String(numero ?? '').trim()) return '';
  const lista = LISTAS_PRECIO.find((candidata) => candidata.numero === String(numero).trim());
  if (!lista) throw new Error('la lista de precios debe ser 1, 2 o 3');
  return lista.id;
}

// Aplica cada elemento (fila o documento agrupado) y deja un registro de auditoría con el total
function importar(modulo, descripcion, elementos, aplicar, etiqueta) {
  exigirPermiso(modulo, 'importar', `importar ${descripcion}`);
  const resultados = aplicarTodoONada(elementos, aplicar, etiqueta);
  const agregados = resultados.filter((resultado) => resultado !== 'actualizado').length;
  registrarAuditoria(modulo, `Importación CSV: ${descripcion}`, `${agregados} nuevos, ${resultados.length - agregados} actualizados`);
  guardarEstado();
  return { agregados, actualizados: resultados.length - agregados };
}

const importarDocumentos = (modulo, descripcion, filas, columna, aplicar) =>
  importar(modulo, descripcion, agruparPorDocumento(filas, columna), aplicar, etiquetaDeGrupo);

// --- Ventas: facturas, remisiones y cotizaciones -------------------------------------------------------------
function lineasDeVenta(grupo) {
  return grupo.filas.map((fila) => {
    const producto = exigirProducto(fila.producto);
    const linea = { productoId: producto.id, nombre: producto.generico ? fila.nombre : producto.nombre, cantidad: fila.cantidad, valorUnitario: fila.precio };
    linea.descuento = leerDescuento(fila.descuento, linea.cantidad * linea.valorUnitario);
    return linea;
  });
}

function registrarVentaDeGrupo(grupo, tipo) {
  const [primera] = grupo.filas;
  const lineas = lineasDeVenta(grupo);
  const neto = lineas.reduce((suma, linea) => suma + linea.cantidad * linea.valorUnitario - linea.descuento, 0);
  return registrarVenta({
    tipo,
    clienteId: exigirCliente(primera.cliente).id,
    metodoId: tipo === 'factura' ? idPorNombre('metodosPago', primera.medioPago ?? '', 'El medio de pago') : '',
    lineas,
    descuentoVenta: leerDescuento(primera.descuentoVenta, neto),
    recibido: primera.recibido || 0,
    observaciones: primera.observaciones ?? '',
  });
}

export const importarFacturas = (filas) =>
  importarDocumentos('ventas', 'facturas de venta', filas, 'documento', (grupo) => registrarVentaDeGrupo(grupo, 'factura'));

export const importarRemisionesYCotizaciones = (filas) => importarDocumentos('ventas', 'remisiones y cotizaciones', filas, 'documento', (grupo) => {
  const tipo = opcionEscrita(grupo.filas[0].tipo, [['remision', 'Remisión'], ['cotizacion', 'Cotización']], 'el tipo debe ser Remisión o Cotización');
  return registrarVentaDeGrupo(grupo, tipo);
});

// Notas: una devolución lleva sus productos y cantidades; una anulación devuelve todo lo que queda de la factura
export const importarNotas = (filas) => importarDocumentos('ventas', 'notas', filas, 'nota', (grupo) => {
  const [primera] = grupo.filas;
  const tipo = opcionEscrita(primera.tipo, [['devolucion', 'Devolución'], ['anulacion', 'Anulación']], 'el tipo debe ser Devolución o Anulación');
  if (tipo === 'anulacion') return anularVenta(primera.factura, primera.motivo);
  const cantidades = Object.fromEntries(grupo.filas.map((fila) => [exigirProducto(fila.producto).id, fila.cantidad]));
  return devolverProductos(primera.factura, cantidades, primera.motivo);
});

// --- Compras, órdenes y traslados ------------------------------------------------------------------------
const lineasConCosto = (grupo) => grupo.filas.map((fila) => {
  const producto = exigirProducto(fila.producto);
  return { productoId: producto.id, nombre: producto.nombre, cantidad: fila.cantidad, costoUnitario: fila.costo };
});

const exigirProveedor = (codigo) => {
  const proveedor = estado.proveedores.find((candidato) => candidato.id === String(codigo ?? '').toUpperCase());
  if (!proveedor) throw new Error(`no existe el proveedor ${codigo || '(vacío)'}`);
  return proveedor;
};

export const importarCompras = (filas) => importarDocumentos('inventario', 'facturas de compra', filas, 'factura', (grupo) => {
  const [primera] = grupo.filas;
  return registrarFactura({
    numero: grupo.clave,
    proveedorId: exigirProveedor(primera.proveedor).id,
    fecha: primera.fecha,
    bodegaId: primera.bodega ? porNombre(estado.bodegas, primera.bodega, 'la bodega').id : '',
    ordenId: primera.orden ?? '',
    lineas: lineasConCosto(grupo),
  });
});

export const importarOrdenes = (filas) => importarDocumentos('proveedores', 'órdenes de compra', filas, 'orden', (grupo) => registrarOrden({
  proveedorId: exigirProveedor(grupo.filas[0].proveedor).id,
  observaciones: grupo.filas[0].observaciones ?? '',
  lineas: lineasConCosto(grupo),
}));

export const importarTraslados = (filas) => importarDocumentos('bodegas', 'traslados', filas, 'traslado', (grupo) => {
  const [primera] = grupo.filas;
  return enviarTraslado({
    origenId: porNombre(estado.bodegas, primera.origen, 'la bodega de origen').id,
    destinoId: porNombre(estado.bodegas, primera.destino, 'la bodega de destino').id,
    observaciones: primera.observaciones ?? '',
    lineas: grupo.filas.map((fila) => {
      const producto = exigirProducto(fila.producto);
      return { productoId: producto.id, nombre: producto.nombre, cantidad: fila.cantidad };
    }),
  });
});

// --- Pagos, caja y seguimiento: una fila es un registro ------------------------------------------------------
export const importarPagos = (filas) => importar('pagos', 'pagos', filas, (fila) => {
  const tipo = opcionEscrita(fila.tipo, [['abono', 'Abono'], ['proveedor', 'Pago a proveedor'], ['proveedor', 'Proveedor']], 'el tipo debe ser Abono o Pago a proveedor');
  const metodoId = idPorNombre('metodosPago', fila.medioPago ?? '', 'El medio de pago');
  const tercero = String(fila.tercero ?? '').toUpperCase();
  return tipo === 'abono'
    ? registrarAbono({ clienteId: tercero, valor: fila.valor, metodoId })
    : registrarPagoProveedor({ proveedorId: tercero, concepto: fila.concepto, valor: fila.valor, metodoId });
});

export const importarMovimientosDeCaja = (filas) => importar('caja', 'movimientos de caja', filas, (fila) => registrarMovimiento({
  tipo: opcionEscrita(fila.tipo, [['ingreso', 'Ingreso'], ['egreso', 'Egreso']], 'el tipo debe ser Ingreso o Egreso'),
  concepto: fila.concepto,
  valor: fila.valor,
}));

export const importarActividades = (filas) => importar('seguimiento', 'actividades', filas, (fila) => registrarActividad({
  clienteId: exigirCliente(fila.cliente).id,
  tipo: idPorNombre('tiposActividad', fila.tipo ?? '', 'El tipo de actividad'),
  descripcion: fila.descripcion,
  vence: fila.vence,
  responsableCorreo: fila.responsable ?? '',
}));

// --- Sucursales, bodegas y usuarios: con código (o correo) se actualizan; sin él, se crean --------------------------
export const importarSucursales = (filas) => importar('tiendas', 'sucursales', filas, (fila) => {
  const actual = fila.id ? estado.tiendas.find((tienda) => tienda.id === fila.id.toUpperCase()) : null;
  if (fila.id && !actual) throw new Error(`no existe la sucursal ${fila.id}: deja el código vacío para crearla`);
  const datos = {
    ...actual,
    ...Object.fromEntries(['nombre', 'direccion', 'telefono', 'ciudad'].filter((clave) => fila[clave] !== undefined).map((clave) => [clave, fila[clave]])),
  };
  if (fila.bodega !== undefined) datos.bodegaId = fila.bodega ? porNombre(estado.bodegas, fila.bodega, 'la bodega').id : '';
  if (fila.listaPrecio !== undefined) datos.listaPrecio = listaPorNumero(fila.listaPrecio);
  if (!actual) return agregarTienda(datos);
  actualizarTienda(actual.id, datos);
  return 'actualizado';
});

export const importarBodegas = (filas) => importar('bodegas', 'bodegas', filas, (fila) => {
  const actual = fila.id ? estado.bodegas.find((bodega) => bodega.id === fila.id.toUpperCase()) : null;
  if (fila.id && !actual) throw new Error(`no existe la bodega ${fila.id}: deja el código vacío para crearla`);
  const datos = { ...actual };
  if (fila.nombre !== undefined) datos.nombre = fila.nombre;
  if (fila.direccion !== undefined) datos.direccion = fila.direccion;
  if (fila.sucursal !== undefined) datos.tiendaId = fila.sucursal ? porNombre(estado.tiendas, fila.sucursal, 'la sucursal').id : '';
  if (!actual) return agregarBodega(datos);
  actualizarBodega(actual.id, datos);
  return 'actualizado';
});

// Un correo ya registrado solo cambia de rol; uno nuevo crea la persona activa
export const importarUsuarios = (filas) => importar('roles', 'usuarios', filas, (fila) => {
  const rol = porNombre(estado.roles, fila.rol ?? '', 'el rol');
  const actual = estado.usuarios.find((usuario) => usuario.correo === String(fila.correo ?? '').trim().toLowerCase());
  if (!actual) return agregarUsuario({ nombre: fila.nombre, correo: fila.correo, rolId: rol.id });
  if (actual.rolId !== rol.id) cambiarRolUsuario(actual.id, rol.id);
  return 'actualizado';
});
