// Reglas de negocio de ventas. Hay tres documentos:
//  - Factura de venta (F): descuenta el stock, cuenta como venta y mueve caja o deuda.
//  - Remisión (R): descuenta el stock de lo entregado, pero no cobra; después se pasa a factura.
//  - Cotización (C): solo una oferta con vigencia; no toca stock ni dinero. Se pasa a remisión o a factura.
// Los tres comparten un mismo consecutivo (F1, R2, C3...). Al pasar un documento a otro se conserva el número:
// la cotización C5 se convierte en la remisión R5 o en la factura F5.
// Las devoluciones y anulaciones generan una nota con su propio consecutivo (ND1, NA1) anclada a la factura.
import { estado, guardarEstado } from '../core/store.js';
import { numeroMayor, siguienteNumero } from '../core/codigos.js';
import { aFechaLocal } from '../core/format.js';
import { exigirPermiso, nombreDeUsuario, rolActual, usuarioActual } from '../core/autorizacion.js';
import { exigirEntero, exigirMotivo, exigirTexto, validarLineas, LIMITES } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';
import { ultimoDiaCerrado } from './contabilidad.service.js';
import { cajaAbierta } from './caja.service.js';
import { existenciasEn, moverExistencias, manejaStock, precioDeLista, esListaPrecio, LISTA_POR_DEFECTO } from './inventario.service.js';
import { bodegaDeTienda, exigirTiendaActiva } from '../core/tienda.js';
import { buscarCliente, deudaDeCliente, cupoDisponible } from './clientes.service.js';
import { aPesos } from '../core/format.js';
import { esCredito, esEfectivo, exigirElemento, nombreDe, parametro, prefijoDe, ETAPA_INICIAL } from './catalogos.service.js';

// Los prefijos (F, R, C, ND, NA) se cambian en Ajustes; solo aplican a los documentos nuevos
export const TIPOS_DOCUMENTO = {
  factura: { etiqueta: 'Factura de venta' },
  remision: { etiqueta: 'Remisión' },
  cotizacion: { etiqueta: 'Cotización' },
};

// A qué documentos se puede pasar cada uno
export const DESTINOS_POSIBLES = { cotizacion: ['factura', 'remision'], remision: ['factura'], factura: [] };

// Número compartido por facturas, remisiones y cotizaciones: numeroDe('C5') -> 5
export const numeroDe = (codigo) => numeroMayor([codigo]);

// Consecutivo que tendrá el documento al registrarse (se muestra antes de guardar)
export const consecutivoPrevisto = (tipo, documentoOrigen = '') =>
  prefijoDe(tipo) + (documentoOrigen ? numeroDe(documentoOrigen) : siguienteNumeroDeDocumento());
const siguienteNumeroDeDocumento = () => siguienteNumero([...estado.ventas, ...estado.documentos].map((registro) => registro.id));

export const resumirItems = (venta) => venta.items.map((item) => `${item.nombre} ×${item.cantidad}`).join(', ');
const mismoNombre = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const buscarProducto = (id) => estado.productos.find((candidato) => candidato.id === id);
export const buscarClientePorNombre = (nombre) => estado.clientes.find((cliente) => mismoNombre(cliente.nombre, nombre));

// Valor sugerido al agregar un producto: su precio en la lista de la venta; si no tiene, el de su última venta.
// El producto genérico no sugiere valor: se escribe en cada venta.
export function ultimoValorDeVenta(productoId, listaPrecio = LISTA_POR_DEFECTO) {
  const producto = buscarProducto(productoId);
  if (producto?.generico) return 0;
  const precio = precioDeLista(producto, listaPrecio);
  if (precio) return precio;
  for (let posicion = estado.ventas.length - 1; posicion >= 0; posicion--) {
    const item = estado.ventas[posicion].items.find((candidato) => candidato.productoId === productoId);
    if (item) return item.valorUnitario;
  }
  return 0;
}

// IVA incluido en un valor con la tarifa indicada: valor 11.900 al 19 % -> base 10.000 e IVA 1.900
export const ivaIncluido = (valor, tarifa) => (tarifa ? Math.round(valor - valor / (1 + tarifa / 100)) : 0);

// Base e IVA de un documento, agrupados por tarifa. Los precios incluyen el IVA y el IVA se calcula sobre el total
// de cada línea con sus descuentos ya aplicados (el de la línea y su parte del descuento de la venta)
export function impuestosDe(documento) {
  const porTarifa = new Map();
  documento.items.forEach((item) => {
    const tarifa = item.iva;
    const valor = item.total;
    const anterior = porTarifa.get(tarifa) ?? { tarifa, base: 0, iva: 0 };
    const iva = ivaIncluido(valor, tarifa);
    anterior.iva += iva;
    anterior.base += valor - iva;
    porTarifa.set(tarifa, anterior);
  });
  return [...porTarifa.values()].sort((a, b) => a.tarifa - b.tarifa);
}

// --- Descuentos ------------------------------------------------------------------------------------------
// Un descuento se escribe en pesos ("5000", "$ 5.000") o en porcentaje ("10%") sobre la base; devuelve pesos enteros
export function leerDescuento(texto, base) {
  const limpio = String(texto ?? '').replace(/\s/g, '');
  if (!limpio) return 0;
  const porcentaje = /^(\d+(?:[.,]\d+)?)%$/.exec(limpio);
  const valor = porcentaje
    ? Math.round((base * Number(porcentaje[1].replace(',', '.'))) / 100)
    : (/^\$?[\d.]+$/.test(limpio) ? Number(limpio.replace(/[$.]/g, '')) : NaN);
  if (!Number.isInteger(valor)) throw new Error('Escribe el descuento en pesos (5000) o en porcentaje (10%)');
  if (valor > base) throw new Error('El descuento no puede ser mayor que el valor');
  return valor;
}

const brutoDe = (linea) => linea.cantidad * linea.valorUnitario;

// Total de cada línea: su valor menos su descuento y menos su parte del descuento de la venta, repartido en proporción
// al valor de cada línea. El redondeo lo absorbe la última línea, así la suma da exacto el total del documento
export function calcularLineas(lineas, descuentoVenta = 0) {
  const netos = lineas.map((linea) => brutoDe(linea) - (linea.descuento || 0));
  const suma = netos.reduce((acumulado, neto) => acumulado + neto, 0);
  let repartido = 0;
  return lineas.map((linea, posicion) => {
    const ultima = posicion === lineas.length - 1;
    const parte = ultima ? descuentoVenta - repartido : (suma ? Math.round((descuentoVenta * netos[posicion]) / suma) : 0);
    repartido += parte;
    return { ...linea, descuento: linea.descuento || 0, total: netos[posicion] - parte };
  });
}

// El descuento total (líneas más venta) no supera el máximo de Ajustes, salvo que lo dé el Propietario
function exigirLimiteDescuento(bruto, descuentoTotal) {
  const maximo = parametro('descuentoMaximo');
  const porcentaje = bruto ? (descuentoTotal * 100) / bruto : 0;
  if (porcentaje > maximo && !rolActual()?.protegido) {
    throw new Error(`El descuento (${Math.round(porcentaje)} %) supera el máximo de ${maximo} %: solo el Propietario puede autorizarlo`);
  }
}

// Valida los descuentos y arma las líneas del documento con su total
function armarItems(lineas, nombres, descuentoVenta) {
  lineas.forEach((linea, posicion) => {
    exigirEntero(linea.descuento || 0, `el descuento de ${nombres[posicion]}`, { maximo: brutoDe(linea) });
  });
  const neto = lineas.reduce((acumulado, linea) => acumulado + brutoDe(linea) - (linea.descuento || 0), 0);
  exigirEntero(descuentoVenta, 'el descuento de la venta', { maximo: neto });
  const bruto = lineas.reduce((acumulado, linea) => acumulado + brutoDe(linea), 0);
  exigirLimiteDescuento(bruto, bruto - neto + descuentoVenta);
  return calcularLineas(lineas, descuentoVenta).map(({ productoId, cantidad, valorUnitario, descuento, total }, posicion) => ({
    productoId,
    nombre: nombres[posicion],
    referencia: buscarProducto(productoId)?.referencia ?? '',
    cantidad,
    valorUnitario,
    descuento,
    total,
    iva: buscarProducto(productoId)?.iva ?? 0,
  }));
}

// --- Documentos sin factura: remisiones y cotizaciones ---------------------------------------------------
export const buscarDocumento = (id) => estado.documentos.find((documento) => documento.id === id);

// Lecturas para las pantallas: devuelven los registros guardados; quien los reordena hace antes una copia
export const listarVentas = () => estado.ventas;
export const listarDocumentos = () => estado.documentos;
export const listarNotas = () => estado.devoluciones;
export const buscarVenta = (id) => estado.ventas.find((venta) => venta.id === id);
export const buscarNota = (id) => estado.devoluciones.find((nota) => nota.id === id);
export const documentoPendiente = (documento) => !documento.convertidoEn && !documento.anulado;

// Unidades ya entregadas por una remisión, por producto (para no descontar dos veces al facturarla)
const remitidas = (documento) => Object.fromEntries((documento?.tipo === 'remision' ? documento.items : []).map((item) => [item.productoId, item.cantidad]));

// Lista de precio con la que vende una tienda si no se elige otra
export const listaDeTienda = (tiendaId) => estado.tiendas.find((tienda) => tienda.id === tiendaId)?.listaPrecio ?? LISTA_POR_DEFECTO;

// Nombre de cada línea: el del producto; el genérico lleva el que se escribió en la venta
function nombreDeLinea(linea) {
  const producto = buscarProducto(linea.productoId);
  if (producto?.generico) return exigirTexto(linea.nombre, `el nombre de ${producto.nombre}`, { maximo: 80 });
  return producto?.nombre ?? exigirTexto(linea.nombre, 'el nombre del producto', { maximo: 120 });
}

// Valida las líneas y arma el documento sin guardarlo: sirve para la vista previa y para registrar
export function armarVenta({ tipo = 'factura', clienteId = '', metodoId = '', lineas, descuentoVenta = 0, recibido, observaciones = '', documentoOrigen = '', listaPrecio = '' }) {
  if (!TIPOS_DOCUMENTO[tipo]) throw new Error('Elige si es factura, remisión o cotización');
  if (!lineas.length) throw new Error('Agrega al menos un producto');
  const nombres = lineas.map(nombreDeLinea);
  validarLineas(lineas.map((linea, posicion) => ({ ...linea, nombre: nombres[posicion] })), 'valorUnitario', 'el valor unitario');
  const repetido = lineas.find((linea, posicion) => lineas.findIndex((otra) => otra.productoId === linea.productoId) !== posicion);
  if (repetido) throw new Error(`${repetido.nombre} está dos veces: deja una sola línea por producto`);

  const origen = documentoOrigen ? buscarDocumento(documentoOrigen) : null;
  if (documentoOrigen && (!origen || !documentoPendiente(origen))) throw new Error(`El documento ${documentoOrigen} ya no se puede convertir`);
  if (origen && !DESTINOS_POSIBLES[origen.tipo].includes(tipo)) {
    throw new Error(`${TIPOS_DOCUMENTO[origen.tipo].etiqueta} ${origen.id} no se puede pasar a ${TIPOS_DOCUMENTO[tipo].etiqueta.toLowerCase()}`);
  }
  const entregadas = remitidas(origen);
  // La venta queda en la sucursal activa; un documento que viene de otro queda en la tienda del original
  const tiendaId = origen?.tiendaId ?? exigirTiendaActiva('registrar ventas').id;
  const bodegaId = origen?.bodegaId ?? bodegaDeTienda(tiendaId)?.id;
  if (!bodegaId) throw new Error('La sucursal no tiene bodega: asígnala en Sucursales');

  if (tipo !== 'cotizacion' && !estado.ajustes.ventas.permitirSinExistencias) {
    for (const linea of lineas) {
      const producto = buscarProducto(linea.productoId);
      if (!manejaStock(producto)) continue;
      const faltante = linea.cantidad - (entregadas[linea.productoId] ?? 0);
      const disponibles = existenciasEn(producto, bodegaId);
      if (faltante > disponibles) {
        throw new Error(`No hay existencias suficientes de ${linea.nombre} en esta sucursal (disponibles: ${disponibles})`);
      }
    }
  }

  // El cliente siempre es uno registrado: por defecto el Consumidor final, que se cambia al elegir otro
  const registrado = buscarCliente(clienteId);
  if (!registrado) throw new Error('Elige el cliente de la venta');

  const items = armarItems(lineas, nombres, descuentoVenta);
  const total = items.reduce((acumulado, item) => acumulado + item.total, 0);
  // La factura exige un medio de pago activo; a crédito, solo hasta el cupo del cliente
  if (tipo === 'factura') exigirElemento('metodosPago', metodoId, 'Elige el medio de pago');
  if (tipo === 'factura' && esCredito(metodoId)) {
    if (registrado.generico) throw new Error('Para vender a Crédito elige un cliente registrado con cupo de crédito');
    if (!registrado.limiteCredito) throw new Error(`${registrado.nombre} no tiene cupo de crédito: asígnalo en Clientes`);
    if (total > cupoDisponible(registrado)) {
      throw new Error(`La venta supera el cupo de crédito de ${registrado.nombre}: disponible ${aPesos(cupoDisponible(registrado))}`);
    }
  }
  const ahora = new Date();
  const documento = {
    tipo,
    fecha: ahora.toISOString(),
    cliente: registrado.nombre,
    clienteId: registrado.id,
    usuario: nombreDeUsuario(),
    usuarioCorreo: usuarioActual()?.correo ?? '',
    tiendaId,
    bodegaId,
    listaPrecio: esListaPrecio(listaPrecio) ? listaPrecio : (origen?.listaPrecio ?? listaDeTienda(tiendaId)),
    observaciones: exigirTexto(observaciones, 'las observaciones', { obligatorio: false, maximo: LIMITES.textoLargo }),
    items,
    descuentoVenta,
    total,
  };

  if (tipo !== 'cotizacion') documento.documentoOrigen = documentoOrigen;
  if (tipo === 'cotizacion') {
    documento.vigenciaHasta = new Date(ahora.getTime() + parametro('vigenciaCotizacion') * 86_400_000).toISOString();
    documento.etapa = ETAPA_INICIAL;
  } else if (tipo === 'factura') {
    documento.metodoId = metodoId;
    documento.metodo = nombreDe('metodosPago', metodoId);
    if (esCredito(metodoId)) documento.plazoDias = registrado.plazoDias;
    // En efectivo se puede escribir con cuánto paga el cliente; la devuelta es la diferencia
    const pagaCon = esEfectivo(metodoId) && recibido ? exigirEntero(recibido, 'el monto recibido', { minimo: 0 }) : total;
    if (pagaCon < total) throw new Error('El monto recibido no cubre el total de la venta');
    documento.recibido = pagaCon;
    documento.devuelta = pagaCon - total;
  }
  return documento;
}

// Saca (signo 1) o devuelve (signo -1) las cantidades en la bodega del documento
const moverStock = (items, signo, bodegaId, entregadas = {}) => items.forEach((item) => {
  const producto = buscarProducto(item.productoId);
  if (producto) moverExistencias(producto, -signo * (item.cantidad - (entregadas[item.productoId] ?? 0)), bodegaId);
});

// Lo remitido que no quedó en la factura vuelve al stock: no se entregó o el cliente lo devolvió
function devolverLoNoFacturado(origen, items) {
  if (origen?.tipo !== 'remision') return;
  const facturados = new Set(items.map((item) => item.productoId));
  const sobrantes = origen.items.filter((item) => !facturados.has(item.productoId));
  moverStock(sobrantes, -1, origen.bodegaId);
}

// Registra la factura, la remisión o la cotización según el tipo; devuelve el documento guardado
export function registrarVenta(datos) {
  exigirPermiso('nueva-venta', 'crear', 'registrar ventas');
  const documento = armarVenta(datos);
  if (documento.tipo === 'factura' && esEfectivo(documento.metodoId) && !cajaAbierta(documento.tiendaId)) {
    throw new Error('Abre la caja de esta sucursal antes de registrar ventas en efectivo');
  }
  const etiqueta = TIPOS_DOCUMENTO[documento.tipo].etiqueta;
  const origen = datos.documentoOrigen ? buscarDocumento(datos.documentoOrigen) : null;
  // Si viene de otro documento conserva su número; si no, toma el siguiente del consecutivo compartido
  const numero = origen ? numeroDe(origen.id) : siguienteNumeroDeDocumento();
  const id = `${prefijoDe(documento.tipo)}${numero}`;
  if ([...estado.ventas, ...estado.documentos].some((existente) => existente.id === id)) throw new Error(`Ya existe el documento ${id}`);
  const desde = origen ? ` · desde ${origen.id}` : '';

  let registro;
  if (documento.tipo === 'factura') {
    registro = { id, ...documento };
    estado.ventas.push(registro);
    moverStock(registro.items, 1, registro.bodegaId, remitidas(origen));
    devolverLoNoFacturado(origen, registro.items);
    registrarAuditoria('ventas', 'Factura de venta registrada', `${id} · ${registro.cliente} · ${registro.metodo} · $ ${registro.total}${desde}`);
  } else {
    registro = { id, ...documento, convertidoEn: null, anulado: false };
    estado.documentos.push(registro);
    if (registro.tipo === 'remision') moverStock(registro.items, 1, registro.bodegaId);
    registrarAuditoria('ventas', `${etiqueta} registrada`, `${id} · ${registro.cliente} · $ ${registro.total}${desde}`);
  }
  if (origen) {
    origen.convertidoEn = id;
    if (origen.tipo === 'cotizacion') origen.etapa = 'ganada';
  }
  guardarEstado();
  return registro;
}

// Una remisión o cotización sin facturar se puede anular; la remisión devuelve lo entregado al stock
export function anularDocumento(id, motivo) {
  exigirPermiso('ventas', 'eliminar', 'anular documentos');
  const documento = buscarDocumento(id);
  if (!documento) throw new Error('El documento no existe');
  const motivoLimpio = exigirMotivo(motivo);
  if (documento.convertidoEn) throw new Error(`${id} ya se pasó a ${documento.convertidoEn}: anula ese documento`);
  if (documento.anulado) throw new Error(`${id} ya está anulado`);
  documento.anulado = true;
  documento.motivoAnulacion = motivoLimpio;
  // Una cotización anulada es una oportunidad perdida sin motivo de la lista: el detalle es el motivo de la anulación
  if (documento.tipo === 'cotizacion') {
    documento.etapa = 'perdida';
    documento.motivoPerdida = '';
    documento.detallePerdida = motivoLimpio;
  }
  if (documento.tipo === 'remision') moverStock(documento.items, -1, documento.bodegaId);
  registrarAuditoria('ventas', `${TIPOS_DOCUMENTO[documento.tipo].etiqueta} anulada`, `${id} · ${motivoLimpio}`);
  guardarEstado();
  return documento;
}

// --- Devoluciones y anulaciones de facturas ------------------------------------------------------------
// Cada una genera una nota anclada a la factura: ND1 (nota de devolución) o NA1 (nota de anulación),
// con un consecutivo propio para cada tipo de nota, independiente del de facturas, remisiones y cotizaciones.
// Una anulación es la devolución de todo lo que quedaba de la factura. Ambas suman el stock, devuelven el dinero
// con el mismo método de pago (en efectivo sale de la caja abierta) o bajan la deuda si la venta fue a Crédito.
export const devolucionesDeVenta = (ventaId) => estado.devoluciones.filter((devolucion) => devolucion.ventaId === ventaId);
export const estaAnulada = (venta) => devolucionesDeVenta(venta.id).some((devolucion) => devolucion.tipo === 'anulacion');
export const totalDevuelto = (ventaId) => devolucionesDeVenta(ventaId).reduce((acumulado, devolucion) => acumulado + devolucion.total, 0);

export const ETIQUETA_NOTA = { devolucion: 'Nota de devolución', anulacion: 'Nota de anulación' };

// Productos de la venta con lo que aún se puede devolver
export function pendientesDeDevolver(venta) {
  const devueltas = devolucionesDeVenta(venta.id).flatMap((devolucion) => devolucion.items);
  return venta.items.map((item) => {
    const delProducto = devueltas.filter((devuelta) => devuelta.productoId === item.productoId);
    const devuelto = delProducto.reduce((acumulado, devuelta) => acumulado + devuelta.cantidad, 0);
    const valorDevuelto = delProducto.reduce((acumulado, devuelta) => acumulado + devuelta.total, 0);
    return { ...item, disponibles: item.cantidad - devuelto, valorDevuelto };
  }).filter((item) => item.disponibles > 0);
}

// Lo que se reembolsa por unas unidades: su parte del total de la línea (con descuentos). Al devolver las últimas se
// reembolsa exactamente lo que queda, así la línea nunca devuelve más ni menos de lo que se cobró
const valorDeDevolucion = (item, cantidad) => (cantidad === item.disponibles
  ? item.total - item.valorDevuelto
  : Math.round((item.total * cantidad) / item.cantidad));

function crearNota(venta, tipo, cantidades, motivo) {
  const motivoLimpio = exigirMotivo(motivo);
  if (estaAnulada(venta)) throw new Error(`La factura ${venta.id} ya está anulada`);
  const pendientes = pendientesDeDevolver(venta);
  if (!pendientes.length) throw new Error(`La factura ${venta.id} ya fue devuelta por completo`);

  const elegidos = pendientes
    .map((item) => ({ ...item, devolver: cantidades[item.productoId] ?? 0 }))
    .filter((item) => item.devolver > 0);
  if (!elegidos.length) throw new Error('Escribe la cantidad que se devuelve de al menos un producto');
  const exceso = elegidos.find((item) => !Number.isInteger(item.devolver) || item.devolver > item.disponibles);
  if (exceso) throw new Error(`De ${exceso.nombre} solo se pueden devolver ${exceso.disponibles} unidad(es)`);
  const items = elegidos.map((item) => ({
    productoId: item.productoId,
    nombre: item.nombre,
    referencia: item.referencia,
    cantidad: item.devolver,
    valorUnitario: item.valorUnitario,
    iva: item.iva,
    total: valorDeDevolucion(item, item.devolver),
  }));
  const total = items.reduce((acumulado, item) => acumulado + item.total, 0);

  if (esCredito(venta.metodoId)) {
    const cliente = buscarCliente(venta.clienteId);
    if (cliente && total > deudaDeCliente(cliente)) {
      throw new Error(`${cliente.nombre} ya abonó parte de esta factura: la devolución supera su deuda actual. Registra el reembolso como egreso en Caja`);
    }
  } else if (esEfectivo(venta.metodoId) && !cajaAbierta(venta.tiendaId)) {
    throw new Error('Abre la caja de la sucursal de la factura para devolver dinero en efectivo');
  }

  const nota = {
    id: `${prefijoDe(tipo)}${siguienteNumero(estado.devoluciones.filter((existente) => existente.tipo === tipo).map((existente) => existente.id))}`,
    ventaId: venta.id,
    fecha: new Date().toISOString(),
    tipo,
    motivo: motivoLimpio,
    usuario: nombreDeUsuario(),
    cliente: venta.cliente,
    clienteId: venta.clienteId,
    metodoId: venta.metodoId,
    metodo: venta.metodo,
    tiendaId: venta.tiendaId,
    bodegaId: venta.bodegaId,
    items,
    total,
  };
  estado.devoluciones.push(nota);
  moverStock(nota.items, -1, nota.bodegaId);
  registrarAuditoria('ventas', tipo === 'anulacion' ? 'Factura anulada' : 'Devolución registrada', `${nota.id} sobre ${venta.id} · $ ${total} · ${motivoLimpio}`);
  guardarEstado();
  return nota;
}

const exigirVenta = (id) => {
  const venta = buscarVenta(id);
  if (!venta) throw new Error('La factura no existe');
  return venta;
};

export function devolverProductos(ventaId, cantidades, motivo) {
  exigirPermiso('ventas', 'eliminar', 'registrar devoluciones');
  return crearNota(exigirVenta(ventaId), 'devolucion', cantidades, motivo);
}

// Solo se anula una factura del día o de días con la contabilidad abierta; si no, se registra una devolución
export function anularVenta(ventaId, motivo) {
  exigirPermiso('ventas', 'eliminar', 'anular facturas');
  const venta = exigirVenta(ventaId);
  if (aFechaLocal(venta.fecha) <= ultimoDiaCerrado()) {
    throw new Error('La contabilidad de ese día ya está cerrada: registra una devolución en lugar de anular');
  }
  const todo = Object.fromEntries(pendientesDeDevolver(venta).map((item) => [item.productoId, item.disponibles]));
  return crearNota(venta, 'anulacion', todo, motivo);
}
