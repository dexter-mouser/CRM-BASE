// Arma los datos de cada comprobante imprimible a partir de los registros de la aplicación.
import { aPesos, aFecha } from '../../core/format.js';
import { mostrarComprobante } from './recibo.js';
import { estado } from '../../core/store.js';
import { devolucionesDeVenta, estaAnulada, buscarClientePorNombre, impuestosDe, TIPOS_DOCUMENTO, ETIQUETA_NOTA, METODO_CREDITO } from '../../services/ventas.service.js';
import { buscarCliente, deudaDeCliente, vencimientoDe } from '../../services/clientes.service.js';
import { proveedoresConSaldo } from '../../services/pagos.service.js';
import { buscarProveedor, ESTADOS_ORDEN } from '../../services/proveedores.service.js';

// Línea del comprobante: nombre, referencia y "cantidad × valor"
const lineasDe = (items, campoValor) => items.map((item) => ({
  nombre: item.nombre,
  detalle: `${item.referencia ? `${item.referencia} · ` : ''}${item.cantidad} × ${aPesos(item[campoValor])}`,
  valor: aPesos(item.cantidad * item[campoValor]),
}));
const unidades = (items) => items.reduce((acumulado, item) => acumulado + item.cantidad, 0);
const buscarVentaPorId = (id) => estado.ventas.find((venta) => venta.id === id);

// Datos del cliente registrado (teléfono y dirección) para completar el encabezado del comprobante
function datosDelCliente(documento) {
  const cliente = documento.clienteId ? buscarCliente(documento.clienteId) : buscarClientePorNombre(documento.cliente);
  const datos = [['Cliente', documento.cliente]];
  if (cliente?.id) datos.push(['Código cliente', cliente.id]);
  if (cliente?.documento) datos.push([cliente.tipoDocumento, cliente.documento]);
  if (cliente?.telefono) datos.push(['Teléfono', cliente.telefono]);
  if (cliente?.direccion) datos.push(['Dirección', cliente.direccion]);
  return datos;
}

const datosComunes = (documento) => [
  ['Fecha', aFecha(documento.fecha)],
  ...datosDelCliente(documento),
  ['Productos', documento.items.length],
  ['Unidades', unidades(documento.items)],
  ...(documento.usuario ? [['Atendió', documento.usuario]] : []),
];

// Base e IVA por tarifa (los precios incluyen el IVA)
const totalesDeImpuestos = (documento) => impuestosDe(documento).flatMap((grupo) => (grupo.tarifa
  ? [{ etiqueta: `Base IVA ${grupo.tarifa} %`, valor: aPesos(grupo.base) }, { etiqueta: `IVA ${grupo.tarifa} %`, valor: aPesos(grupo.iva) }]
  : [{ etiqueta: 'Excluido de IVA', valor: aPesos(grupo.base) }]));

// Factura de venta, remisión o cotización; registrada (con número) o aún sin registrar (vista previa)
export function mostrarReciboDeVenta(documento) {
  const tipo = documento.tipo ?? 'factura';
  const registrado = Boolean(documento.id);
  const etiqueta = TIPOS_DOCUMENTO[tipo].etiqueta;
  const datos = datosComunes(documento);
  const totales = [];
  const notas = [];
  let sello = '';
  let firmas = [];

  if (tipo === 'factura') {
    datos.splice(1, 0, ['Pago', documento.metodo]);
    const notasDeLaFactura = registrado ? devolucionesDeVenta(documento.id) : [];
    const devuelto = notasDeLaFactura.reduce((acumulado, nota) => acumulado + nota.total, 0);
    totales.push(...totalesDeImpuestos(documento));
    totales.push({ etiqueta: 'TOTAL', valor: aPesos(documento.total), fuerte: !devuelto });
    if (documento.metodo === 'Efectivo' && documento.recibido) {
      totales.push({ etiqueta: 'Monto recibido', valor: aPesos(documento.recibido) });
      totales.push({ etiqueta: 'Cambio', valor: aPesos(documento.devuelta) });
    }
    if (devuelto) {
      totales.push({ etiqueta: 'Devuelto', valor: `- ${aPesos(devuelto)}` });
      totales.push({ etiqueta: 'TOTAL NETO', valor: aPesos(documento.total - devuelto), fuerte: true });
    }
    notas.push(...notasDeLaFactura.map((nota) => `${nota.id} · ${nota.tipo === 'anulacion' ? 'Anulada' : 'Devolución'} (${aFecha(nota.fecha)}): ${nota.motivo}`));
    if (registrado && estaAnulada(documento)) sello = 'ANULADA';
    if (documento.metodo === METODO_CREDITO) {
      datos.push(['Vence', aFecha(vencimientoDe(documento).slice(0, 10))]);
      notas.push(`Venta a crédito a ${documento.plazoDias ?? 30} días: el valor queda como deuda del cliente.`);
    }
  } else if (tipo === 'remision') {
    totales.push({ etiqueta: 'VALOR DE LA MERCANCÍA', valor: aPesos(documento.total), fuerte: true });
    notas.push('Mercancía entregada. Este documento no es una factura ni un comprobante de pago.');
    if (documento.convertidoEn) notas.push(`Facturada en ${documento.convertidoEn}`);
    firmas = ['Entregó', 'Recibí conforme'];
  } else {
    datos.push(['Válida hasta', aFecha(documento.vigenciaHasta)]);
    totales.push(...totalesDeImpuestos(documento));
    totales.push({ etiqueta: 'TOTAL COTIZADO', valor: aPesos(documento.total), fuerte: true });
    notas.push('Oferta sujeta a existencias. No es una factura ni descuenta inventario.');
    if (documento.convertidoEn) notas.push(`Pasada a ${documento.convertidoEn}`);
  }
  if (documento.anulado) {
    sello = 'ANULADO';
    notas.push(`Anulado: ${documento.motivoAnulacion}`);
  }
  if (documento.documentoOrigen) datos.push(['Origen', documento.documentoOrigen]);
  // El mensaje personalizado del documento va al pie del comprobante en lugar del mensaje general de Ajustes

  return mostrarComprobante({
    titulo: registrado ? etiqueta : `Vista previa · ${etiqueta}`,
    subtitulo: registrado ? `N° ${documento.id}` : 'Sin registrar',
    datos,
    lineas: lineasDe(documento.items, 'valorUnitario'),
    totales,
    sello,
    notas,
    pie: documento.observaciones || undefined,
    firmas,
  });
}

// Nota de devolución (ND) o de anulación (NA), anclada a la factura original
export function mostrarComprobanteDeDevolucion(nota) {
  const factura = buscarVentaPorId(nota.ventaId);
  const acumulado = estado.devoluciones
    .filter((otra) => otra.ventaId === nota.ventaId && estado.devoluciones.indexOf(otra) <= estado.devoluciones.indexOf(nota))
    .reduce((suma, otra) => suma + otra.total, 0);
  const reembolso = nota.metodo === METODO_CREDITO ? 'Se descontó de la deuda del cliente' : `Reembolso por ${nota.metodo}`;
  const datos = [
    ['Factura original', nota.ventaId],
    ['Fecha de la factura', factura ? aFecha(factura.fecha) : '—'],
    ['Fecha de la nota', aFecha(nota.fecha)],
    ['Cliente', nota.cliente],
    ['Pago de la factura', nota.metodo],
    ['Unidades', unidades(nota.items)],
    ['Registró', nota.usuario],
  ];
  const totales = [];
  if (factura) totales.push({ etiqueta: 'Total de la factura', valor: aPesos(factura.total) });
  totales.push({ etiqueta: 'TOTAL DEVUELTO', valor: aPesos(nota.total), fuerte: true });
  if (factura) totales.push({ etiqueta: 'Saldo de la factura', valor: aPesos(factura.total - acumulado) });
  return mostrarComprobante({
    titulo: ETIQUETA_NOTA[nota.tipo],
    subtitulo: `N° ${nota.id} · sobre la factura ${nota.ventaId}`,
    datos,
    lineas: lineasDe(nota.items, 'valorUnitario'),
    totales,
    sello: nota.tipo === 'anulacion' ? 'ANULADA' : '',
    notas: [`Motivo: ${nota.motivo}`, reembolso],
    firmas: ['Cliente', 'Sucursal'],
  });
}

export function mostrarComprobanteDePago(pago) {
  const esAbono = pago.tipo === 'abono';
  let saldo;
  if (esAbono) {
    const cliente = buscarCliente(pago.terceroId);
    saldo = cliente ? deudaDeCliente(cliente) : 0;
  } else {
    saldo = proveedoresConSaldo().find((proveedor) => proveedor.nombre.toLowerCase() === pago.tercero.toLowerCase())?.pendiente ?? 0;
  }
  return mostrarComprobante({
    titulo: esAbono ? 'Recibo de abono' : 'Comprobante de pago a proveedor',
    subtitulo: `N° ${pago.id}`,
    datos: [['Fecha', aFecha(pago.fecha)], [esAbono ? 'Cliente' : 'Proveedor', pago.tercero], ['Concepto', pago.concepto], ['Medio de pago', pago.metodo]],
    totales: [
      { etiqueta: esAbono ? 'VALOR ABONADO' : 'VALOR PAGADO', valor: aPesos(pago.valor), fuerte: true },
      { etiqueta: esAbono ? 'Deuda actual' : 'Saldo pendiente', valor: aPesos(saldo) },
    ],
    firmas: esAbono ? ['Recibí conforme', 'Cliente'] : ['Recibí conforme', 'Proveedor'],
  });
}

export function mostrarComprobanteDeFactura(factura) {
  const proveedor = buscarProveedor(factura.proveedorId);
  const datos = [['Proveedor', factura.proveedor], ...(proveedor?.nit ? [['NIT', proveedor.nit]] : []), ['N° de factura', factura.numero], ['Fecha', aFecha(factura.fecha)], ['Unidades', unidades(factura.items)]];
  if (factura.ordenId) datos.push(['Orden de compra', factura.ordenId]);
  if (factura.usuario) datos.push(['Registró', factura.usuario]);
  return mostrarComprobante({
    titulo: 'Factura de compra',
    subtitulo: `${factura.proveedor} · ${factura.numero}`,
    datos,
    lineas: lineasDe(factura.items, 'costoUnitario'),
    totales: [{ etiqueta: 'TOTAL FACTURA', valor: aPesos(factura.total), fuerte: true }],
    notas: ['Las cantidades se sumaron al inventario.'],
  });
}

// Orden de compra para enviar al proveedor
export function mostrarComprobanteDeOrden(orden) {
  const proveedor = buscarProveedor(orden.proveedorId);
  const datos = [['Proveedor', orden.proveedor]];
  if (proveedor?.nit) datos.push(['NIT', proveedor.nit]);
  if (proveedor?.contacto) datos.push(['Contacto', proveedor.contacto]);
  datos.push(['Fecha', aFecha(orden.fecha)], ['Estado', ESTADOS_ORDEN[orden.estado]], ['Unidades', unidades(orden.items)], ['Elaboró', orden.usuario]);
  const notas = [];
  if (orden.observaciones) notas.push(`Observaciones: ${orden.observaciones}`);
  if (orden.facturaNumero) notas.push(`Recibida con la factura ${orden.facturaNumero}`);
  if (orden.motivoAnulacion) notas.push(`Anulada: ${orden.motivoAnulacion}`);
  return mostrarComprobante({
    titulo: 'Orden de compra',
    subtitulo: `N° ${orden.id}`,
    datos,
    lineas: lineasDe(orden.items, 'costoUnitario'),
    totales: [{ etiqueta: 'TOTAL ORDEN', valor: aPesos(orden.total), fuerte: true }],
    sello: orden.estado === 'anulada' ? 'ANULADA' : '',
    notas,
    firmas: ['Elaboró', 'Proveedor'],
  });
}
