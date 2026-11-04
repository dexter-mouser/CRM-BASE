// Reglas de negocio del inventario: productos (costo, precio de venta, IVA, categoría y stock mínimo), stock por bodega,
// importación, facturas de compra y kardex (historial de entradas y salidas de cada producto).
// Cada producto guarda su stock por bodega (producto.stock = { 'B-01': 14, ... }) y el total en producto.existencias.
// Lo que está en un traslado sin recibir no cuenta en ninguna bodega ni en el total.
import { estado, guardarEstado } from '../core/store.js';
import { siguienteCodigo, siguienteNumero } from '../core/codigos.js';
import { ultimoDiaCerrado } from './contabilidad.service.js';
import { exigirPermiso, nombreDeUsuario } from '../core/autorizacion.js';
import { exigirFecha, exigirTexto, validarLineas, validarProducto } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';
import { bodegaDeTienda, tiendaActivaId, TODAS_LAS_TIENDAS } from '../core/tienda.js';
import { exigirElemento, idPorNombre, nombreDe } from './catalogos.service.js';
import { columnasDefinidas, exigirUnico, validarFilas } from '../core/importacion.js';

const quitarTildes = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const buscarProductoPorId = (id) => estado.productos.find((producto) => producto.id === id);
export const buscarBodega = (id) => estado.bodegas.find((bodega) => bodega.id === id);

// Campos que se pueden editar (el ID no se edita porque lo usan ventas y facturas; "genérico" se elige al crear)
export const CAMPOS_EDITABLES = ['referencia', 'nombre', 'categoriaId', 'unidadId', 'costo', 'precioSurtido', 'precioMayor', 'precioDetal', 'iva', 'stockMinimo', 'existencias'];

// Listas de precio: cada producto tiene los tres precios y cada venta usa una lista. En pantalla la lista se nombra
// solo con su número (1, 2 o 3), que es como la conocen los empleados; su nombre (Surtido, Por mayor…) se cambia en Ajustes
export const LISTAS_PRECIO = [
  { id: 'surtido', campo: 'precioSurtido', numero: '1' },
  { id: 'mayor', campo: 'precioMayor', numero: '2' },
  { id: 'detal', campo: 'precioDetal', numero: '3' },
];
export const LISTA_POR_DEFECTO = 'detal';
export const esListaPrecio = (id) => LISTAS_PRECIO.some((lista) => lista.id === id);
export const etiquetaDeLista = (id) => LISTAS_PRECIO.find((lista) => lista.id === id)?.numero ?? '';
// Nombre del precio de una lista en el producto: «Precio 1 · Surtido»
export const nombreDePrecio = (lista) => `Precio ${lista.numero} · ${nombreDe('listasPrecio', lista.id)}`;

// Precio de un producto en una lista; si esa lista no tiene precio, el de la siguiente más alta
export function precioDeLista(producto, listaId = LISTA_POR_DEFECTO) {
  if (!producto || producto.generico) return 0;
  const desde = Math.max(0, LISTAS_PRECIO.findIndex((lista) => lista.id === listaId));
  for (const lista of LISTAS_PRECIO.slice(desde)) if (producto[lista.campo]) return producto[lista.campo];
  return 0;
}

// Un producto genérico (servicios, reparaciones, artículos sin código) no maneja stock
export const manejaStock = (producto) => Boolean(producto) && !producto.generico;


// El ID de producto es solo números: el siguiente es el mayor que exista más uno
export const siguienteIdProducto = () => String(siguienteNumero(estado.productos.map((producto) => producto.id)));

// --- Stock por bodega --------------------------------------------------------------------------------------
// Stock de un producto en una bodega; sin bodega, el total
export const existenciasEn = (producto, bodegaId = null) => (bodegaId ? (producto.stock?.[bodegaId] ?? 0) : producto.existencias);

// Bodega de la sucursal activa (null si se ven todas las tiendas)
export const bodegaActiva = () => (tiendaActivaId() === TODAS_LAS_TIENDAS ? null : bodegaDeTienda(tiendaActivaId()));

// Stock que se muestra: el de la bodega de la sucursal activa o el total si se ven todas
export const existenciasVisibles = (producto) => existenciasEn(producto, bodegaActiva()?.id ?? null);

// Suma (o resta) stock en una bodega y en el total
export function moverExistencias(producto, cantidad, bodegaId) {
  if (!bodegaId) throw new Error('Falta la bodega del movimiento');
  if (!manejaStock(producto)) return;
  producto.stock ??= {};
  producto.stock[bodegaId] = (producto.stock[bodegaId] ?? 0) + cantidad;
  producto.existencias += cantidad;
}

// Bodega donde se edita o recibe stock: la de la sucursal activa (hace falta elegir una tienda)
function exigirBodegaActiva() {
  const bodega = bodegaActiva();
  if (!bodega) throw new Error('Elige una sucursal en el menú superior para cambiar su stock');
  return bodega;
}

// Deja constancia de un cambio de stock que no viene de un documento (edición manual, creación o importación)
function registrarAjuste(productoId, cantidad, motivo, bodegaId) {
  if (!cantidad) return;
  estado.ajustesInventario.push({
    id: siguienteCodigo(estado.ajustesInventario.map((ajuste) => ajuste.id), 'AJ', 4),
    fecha: new Date().toISOString(),
    productoId,
    cantidad,
    motivo,
    usuario: nombreDeUsuario(),
    bodegaId,
  });
}

// Productos con el stock de la sucursal activa en "existencias", para buscadores y listas
const conStockVisible = (producto) => ({ ...producto, existencias: existenciasVisibles(producto) });

// Cada palabra escrita debe aparecer en algún atributo: ID, nombre, referencia, categoría, costo, precio o stock.
// Primero va el producto cuyo ID o referencia es exactamente lo escrito (así Enter elige el ID tecleado o escaneado).
export function buscarProductos(consulta = '') {
  const terminos = quitarTildes(consulta).split(/\s+/).filter(Boolean);
  const exacto = quitarTildes(consulta.trim());
  const esExacto = (producto) => quitarTildes(producto.id) === exacto || quitarTildes(producto.referencia) === exacto;
  return estado.productos.map(conStockVisible).filter((producto) => {
    const texto = quitarTildes([producto.id, producto.nombre, producto.referencia, nombreDe('categorias', producto.categoriaId), producto.costo, producto.precioDetal, producto.existencias].join(' '));
    return terminos.every((termino) => texto.includes(termino));
  }).sort((a, b) => Number(esExacto(b)) - Number(esExacto(a)));
}

// Filtro por columna: cada casilla con texto debe coincidir con su atributo (id, referencia, nombre, costo, existencias)
export function filtrarProductos(filtros) {
  const condiciones = Object.entries(filtros).filter(([, texto]) => texto.trim());
  return estado.productos.map(conStockVisible).filter((producto) =>
    condiciones.every(([columna, texto]) => quitarTildes(producto[columna]).includes(quitarTildes(texto.trim()))));
}

// Categoría, unidad y tarifa de IVA deben estar activas en los catálogos; al editar se acepta la que ya tenía
function exigirCatalogosDeProducto(limpio, actual = {}) {
  exigirElemento('categorias', limpio.categoriaId, 'Elige una categoría del catálogo', actual.categoriaId);
  exigirElemento('unidades', limpio.unidadId, 'Elige una unidad de medida del catálogo', actual.unidadId);
  exigirElemento('tarifasIva', String(limpio.iva), `La tarifa de IVA ${limpio.iva} % no está activa en Ajustes`, String(actual.iva ?? ''));
}

// Edición de un campo de un producto. El stock que se edita es el de la bodega de la sucursal activa.
export function actualizarProducto(id, campo, valor) {
  exigirPermiso('inventario', 'editar', 'editar productos');
  const producto = buscarProductoPorId(id);
  if (!producto) throw new Error('El producto no existe');
  if (!CAMPOS_EDITABLES.includes(campo)) throw new Error('Ese campo no se puede editar');
  if (campo === 'existencias') {
    if (!manejaStock(producto)) throw new Error(`${producto.nombre} es genérico: no maneja stock`);
    const bodega = exigirBodegaActiva();
    const anterior = existenciasEn(producto, bodega.id);
    const limpio = validarProducto({ ...producto, existencias: valor });
    moverExistencias(producto, limpio.existencias - anterior, bodega.id);
    registrarAjuste(producto.id, limpio.existencias - anterior, 'Ajuste manual de stock', bodega.id);
    registrarAuditoria('inventario', 'Stock ajustado', `${producto.id} · ${bodega.nombre} = ${limpio.existencias}`);
  } else {
    const limpio = validarProducto({ ...producto, [campo]: valor });
    exigirCatalogosDeProducto(limpio, producto);
    producto[campo] = limpio[campo];
    registrarAuditoria('inventario', 'Producto editado', `${producto.id} · ${campo} = ${producto[campo]}`);
  }
  guardarEstado();
}

// Código exacto (ID o referencia, sin importar mayúsculas): lo que escribe un lector de código de barras
export const buscarProductoPorCodigo = (codigo) => {
  const buscado = String(codigo).trim().toLowerCase();
  if (!buscado) return null;
  const producto = estado.productos.find((candidato) => candidato.id.toLowerCase() === buscado || candidato.referencia.toLowerCase() === buscado);
  return producto ? conStockVisible(producto) : null;
};

// El stock inicial queda en la bodega de la sucursal activa
export function agregarProducto(datos) {
  exigirPermiso('inventario', 'crear', 'crear productos');
  const limpio = validarProducto(datos);
  exigirCatalogosDeProducto(limpio);
  const bodega = limpio.existencias ? exigirBodegaActiva() : null;
  const idFinal = limpio.id || siguienteIdProducto();
  if (buscarProductoPorId(idFinal)) throw new Error(`Ya existe un producto con el ID ${idFinal}`);
  const producto = { ...limpio, id: idFinal, existencias: 0, stock: {} };
  estado.productos.push(producto);
  if (bodega) {
    moverExistencias(producto, limpio.existencias, bodega.id);
    registrarAjuste(producto.id, limpio.existencias, 'Stock inicial', bodega.id);
  }
  registrarAuditoria('inventario', 'Producto creado', `${producto.id} · ${producto.nombre}`);
  guardarEstado();
  return producto;
}

// Solo se elimina un producto que nunca se ha usado en documentos ni traslados y que no tiene stock;
// si ya tiene historia, se deja (el kardex y los comprobantes lo necesitan).
export function eliminarProducto(id) {
  exigirPermiso('inventario', 'eliminar', 'eliminar productos');
  const producto = buscarProductoPorId(id);
  if (!producto) throw new Error('El producto no existe');
  const usaProducto = (lista = []) => lista.some((registro) => (registro.items ?? []).some((item) => item.productoId === id));
  const usado = [estado.ventas, estado.documentos, estado.devoluciones, estado.facturas, estado.ordenesCompra, estado.traslados].some(usaProducto);
  if (usado) throw new Error(`${producto.nombre} ya tiene ventas, compras o traslados: no se puede eliminar`);
  if (Object.values(producto.stock ?? {}).some((cantidad) => cantidad !== 0)) throw new Error(`${producto.nombre} tiene stock: déjalo en 0 antes de eliminarlo`);
  estado.productos = estado.productos.filter((candidato) => candidato.id !== id);
  estado.ajustesInventario = estado.ajustesInventario.filter((ajuste) => ajuste.productoId !== id);
  registrarAuditoria('inventario', 'Producto eliminado', `${producto.id} · ${producto.nombre}`);
  guardarEstado();
}

// Importación validada: se revisan todas las filas antes de cambiar nada; si alguna falla no se importa ninguna.
// Las columnas que no trae el archivo conservan el valor actual del producto. El stock del archivo es el de la
// bodega de la sucursal activa.
export function importarProductos(filas) {
  exigirPermiso('inventario', 'importar', 'importar productos');
  const traeStock = filas.some((fila) => fila.existencias !== undefined);
  const bodega = traeStock ? exigirBodegaActiva() : null;
  const vistos = new Set();
  const validas = validarFilas(filas, (fila) => {
    const actual = fila.id ? buscarProductoPorId(String(Number(fila.id))) : null;
    const { categoria, unidad, ...definidos } = columnasDefinidas(fila);
    // El archivo trae los nombres de la categoría y la unidad; se guardan sus códigos del catálogo
    if (categoria !== undefined) definidos.categoriaId = idPorNombre('categorias', categoria, 'La categoría');
    if (unidad !== undefined) definidos.unidadId = idPorNombre('unidades', unidad, 'La unidad');
    const base = actual ? { ...actual, existencias: bodega ? existenciasEn(actual, bodega.id) : actual.existencias } : {};
    const limpia = validarProducto({ existencias: 0, ...base, ...definidos, generico: actual?.generico ?? false });
    exigirCatalogosDeProducto(limpia, actual ?? {});
    exigirUnico(vistos, limpia.id, `el ID ${limpia.id} está repetido en el archivo`);
    return limpia;
  });

  let agregados = 0, actualizados = 0;
  for (const { existencias, ...fila } of validas) {
    let producto = fila.id ? buscarProductoPorId(fila.id) : null;
    if (producto) {
      Object.assign(producto, fila);
      actualizados++;
    } else {
      producto = { ...fila, id: fila.id || siguienteIdProducto(), existencias: 0, stock: {} };
      estado.productos.push(producto);
      agregados++;
    }
    if (bodega) {
      const diferencia = existencias - existenciasEn(producto, bodega.id);
      moverExistencias(producto, diferencia, bodega.id);
      registrarAjuste(producto.id, diferencia, 'Importación de inventario', bodega.id);
    }
  }
  registrarAuditoria('inventario', 'Inventario importado', `${agregados} nuevos, ${actualizados} actualizados`);
  guardarEstado();
  return { agregados, actualizados };
}

// Factura de compra: suma las cantidades al stock de la bodega elegida y deja el costo de la factura como costo del
// producto. Si viene de una orden de compra, la orden queda recibida.
export function registrarFactura(datos) {
  exigirPermiso('inventario', 'crear', 'registrar facturas de compra');
  const { lineas } = datos;
  const proveedor = estado.proveedores.find((candidato) => candidato.id === datos.proveedorId);
  if (!proveedor) throw new Error('Elige el proveedor de la factura (créalo antes en Proveedores)');
  const bodega = buscarBodega(datos.bodegaId) ?? bodegaActiva();
  if (!bodega?.activa) throw new Error('Elige la bodega donde entra la mercancía');
  const numero = exigirTexto(datos.numero, 'el número de la factura', { maximo: 40 });
  const fecha = exigirFecha(datos.fecha, 'la fecha de la factura');
  if (!lineas.length) throw new Error('Agrega al menos un producto a la factura');
  validarLineas(lineas, 'costoUnitario', 'el costo unitario');
  if (fecha <= ultimoDiaCerrado()) throw new Error('Ese día ya tiene la contabilidad cerrada: elige una fecha posterior');
  const repetida = estado.facturas.some((factura) => factura.numero === numero && factura.proveedorId === proveedor.id);
  if (repetida) throw new Error('Esa factura de ese proveedor ya fue ingresada');
  const orden = datos.ordenId ? estado.ordenesCompra.find((candidata) => candidata.id === datos.ordenId) : null;
  if (datos.ordenId && (!orden || orden.estado !== 'abierta')) throw new Error(`La orden ${datos.ordenId} ya no está abierta`);

  const items = lineas.map(({ productoId, nombre, cantidad, costoUnitario }) => ({ productoId, nombre, cantidad, costoUnitario }));
  const factura = {
    numero,
    proveedorId: proveedor.id,
    proveedor: proveedor.nombre,
    fecha,
    bodegaId: bodega.id,
    usuario: nombreDeUsuario(),
    ordenId: orden?.id ?? '',
    items,
    total: items.reduce((acumulado, item) => acumulado + item.cantidad * item.costoUnitario, 0),
  };
  estado.facturas.push(factura);
  if (orden) {
    orden.estado = 'recibida';
    orden.facturaNumero = numero;
  }
  registrarAuditoria('inventario', 'Factura de compra', `${factura.numero} · ${factura.proveedor} · ${bodega.nombre} · $ ${factura.total}${orden ? ` · orden ${orden.id}` : ''}`);
  items.forEach((item) => {
    const producto = buscarProductoPorId(item.productoId);
    if (producto) {
      moverExistencias(producto, item.cantidad, bodega.id);
      producto.costo = item.costoUnitario;
    }
  });
  guardarEstado();
  return factura;
}

// --- Kardex ----------------------------------------------------------------------------------------------
// Historial de un producto armado con los documentos que mueven stock, de una bodega o de todas. El saldo se calcula
// hacia atrás desde el stock actual, así siempre termina en lo que hay hoy.
export function kardexDeProducto(productoId, bodegaId = null) {
  const producto = buscarProductoPorId(productoId);
  if (!producto) return [];
  const movimientos = [];
  const deLaBodega = (id) => !bodegaId || id === bodegaId;
  const agregar = (fecha, documento, detalle, cantidad, bodega, costo = null) => {
    if (cantidad && deLaBodega(bodega)) movimientos.push({ fecha, documento, detalle, cantidad, costo, bodegaId: bodega });
  };
  const deItems = (items) => items.filter((item) => item.productoId === productoId).reduce((suma, item) => suma + item.cantidad, 0);
  const bodegaDe = (registro) => registro.bodegaId;

  estado.facturas.forEach((factura) => {
    const item = factura.items.find((candidato) => candidato.productoId === productoId);
    // La factura de compra solo guarda el día: se ubica al comenzarlo, antes de las ventas de ese día
    if (item) agregar(`${factura.fecha}T00:00:00`, factura.numero, `Compra a ${factura.proveedor}`, item.cantidad, bodegaDe(factura), item.costoUnitario);
  });
  estado.ventas.forEach((venta) => {
    const remision = venta.documentoOrigen ? estado.documentos.find((documento) => documento.id === venta.documentoOrigen && documento.tipo === 'remision') : null;
    const entregado = remision ? deItems(remision.items) : 0;
    const vendido = deItems(venta.items);
    // Al facturar una remisión solo mueve stock la diferencia con lo ya entregado
    agregar(venta.fecha, venta.id, remision ? `Factura desde ${remision.id}` : `Venta a ${venta.cliente}`, remision ? entregado - vendido : -vendido, bodegaDe(venta));
  });
  estado.documentos.filter((documento) => documento.tipo === 'remision').forEach((remision) => {
    agregar(remision.fecha, remision.id, `Remisión a ${remision.cliente}`, -deItems(remision.items), bodegaDe(remision));
    // Una remisión anulada devolvió lo entregado; se registra con la fecha del documento por no guardar otra
    if (remision.anulado) agregar(remision.fecha, remision.id, `Anulación de ${remision.id}`, deItems(remision.items), bodegaDe(remision));
  });
  estado.devoluciones.forEach((nota) => {
    agregar(nota.fecha, nota.id, `${nota.tipo === 'anulacion' ? 'Anulación' : 'Devolución'} de ${nota.ventaId}`, deItems(nota.items), bodegaDe(nota));
  });
  estado.ajustesInventario.filter((ajuste) => ajuste.productoId === productoId)
    .forEach((ajuste) => agregar(ajuste.fecha, ajuste.id, `${ajuste.motivo} (${ajuste.usuario})`, ajuste.cantidad, bodegaDe(ajuste)));
  estado.traslados.forEach((traslado) => {
    const cantidad = deItems(traslado.items);
    agregar(traslado.fecha, traslado.id, `Traslado a ${buscarBodega(traslado.destinoId)?.nombre ?? traslado.destinoId}`, -cantidad, traslado.origenId);
    if (traslado.estado === 'anulado') agregar(traslado.anuladoEn ?? traslado.fecha, traslado.id, 'Traslado anulado: regresa a la bodega', cantidad, traslado.origenId);
    if (traslado.estado === 'recibido') agregar(traslado.recibidoEn, traslado.id, `Traslado desde ${buscarBodega(traslado.origenId)?.nombre ?? traslado.origenId}`, cantidad, traslado.destinoId);
  });

  movimientos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  let saldo = existenciasEn(producto, bodegaId);
  for (let posicion = movimientos.length - 1; posicion >= 0; posicion--) {
    movimientos[posicion].saldo = saldo;
    saldo -= movimientos[posicion].cantidad;
  }
  return movimientos;
}

// Productos en o por debajo de su stock mínimo (en la bodega de la sucursal activa o en total)
export const productosBajoMinimo = () => estado.productos
  .filter(manejaStock)
  .map(conStockVisible)
  .filter((producto) => producto.existencias <= (producto.stockMinimo ?? 0))
  .sort((a, b) => a.existencias - b.existencias);
