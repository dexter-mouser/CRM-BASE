// Datos de ejemplo de una cadena de accesorios para celular: una bodega principal que vende al por mayor y surte a
// tres almacenes que venden al detal. Luego se reemplazan por llamadas a la API.
import { ID_ROL_PROPIETARIO, permisosCompletos } from '../config/permisos.js';

// Fecha de "hace N días" a la hora indicada (nunca en el futuro); los minutos separan registros de la misma hora
const hace = (dias, hora, minutos = 0) => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  fecha.setHours(hora, minutos, 0, 0);
  return new Date(Math.min(fecha.getTime(), Date.now() - 60000)).toISOString();
};

// Fecha de "dentro de N días" a la hora indicada (para tareas y vigencias futuras)
const dentroDe = (dias, hora = 9) => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  fecha.setHours(hora, 0, 0, 0);
  return fecha.toISOString();
};

// --- Productos: costo y tres precios de venta (1 surtido, 2 por mayor, 3 al detal), todos con IVA incluido -----
const producto = (id, referencia, nombre, categoria, costo, precioSurtido, precioMayor, precioDetal, stockMinimo, iva = 19) =>
  ({ id, referencia, nombre, categoria, costo, precioSurtido, precioMayor, precioDetal, iva, stockMinimo, existencias: 0, generico: false });

const PRODUCTOS = [
  producto('1', 'VT-IP15', 'Vidrio templado 9D iPhone 15', 'Vidrios templados', 2500, 3500, 5000, 15000, 30),
  producto('2', 'VT-A54', 'Vidrio templado 9D Samsung A54', 'Vidrios templados', 2300, 3200, 4500, 15000, 30),
  producto('3', 'VT-CER-67', 'Vidrio cerámico mate universal 6,7"', 'Vidrios templados', 3000, 4000, 6000, 18000, 20),
  producto('4', 'ES-IP15-SIL', 'Estuche de silicona iPhone 15', 'Estuches', 6000, 8000, 11000, 28000, 15),
  producto('5', 'ES-A54-ANT', 'Estuche antigolpes Samsung A54', 'Estuches', 5500, 7500, 10000, 25000, 15),
  producto('6', 'ES-RN13-TR', 'Estuche transparente Redmi Note 13', 'Estuches', 3000, 4200, 6000, 18000, 15),
  producto('7', 'ES-BIL-65', 'Estuche billetera universal 6,5"', 'Estuches', 7000, 9500, 13000, 32000, 10),
  producto('8', 'AU-TWS-01', 'Audífonos Bluetooth TWS con estuche de carga', 'Audífonos', 22000, 27000, 35000, 69000, 10),
  producto('9', 'AU-CAB-35', 'Audífonos de cable 3,5 mm con micrófono', 'Audífonos', 4500, 6000, 8500, 19000, 15),
  producto('10', 'AU-DIA-BT', 'Diadema Bluetooth plegable', 'Audífonos', 28000, 34000, 45000, 89000, 5),
  producto('11', 'CG-20W-C', 'Cargador rápido 20 W USB-C', 'Cargadores', 9000, 11500, 15000, 35000, 15),
  producto('12', 'CG-CAR-2P', 'Cargador de carro doble puerto', 'Cargadores', 7000, 9000, 12000, 28000, 10),
  producto('13', 'CB-CC-1M', 'Cable USB-C a USB-C 1 m', 'Cables', 3500, 4800, 6500, 15000, 20),
  producto('14', 'CB-LIG-1M', 'Cable USB a Lightning 1 m', 'Cables', 3800, 5000, 7000, 16000, 20),
  producto('15', 'PB-10K', 'Batería portátil 10.000 mAh', 'Baterías', 30000, 36000, 46000, 85000, 5),
  producto('16', 'SO-MAG-CAR', 'Soporte magnético para carro', 'Soportes', 6000, 8000, 11000, 25000, 10),
  producto('17', 'SO-TRI-LUZ', 'Trípode con aro de luz para selfie', 'Soportes', 18000, 23000, 30000, 59000, 5),
  producto('18', 'MS-64GB', 'Memoria microSD 64 GB', 'Memorias', 14000, 17000, 22000, 39000, 10),
  producto('19', 'PA-BT-MIN', 'Parlante Bluetooth mini', 'Parlantes', 20000, 25000, 33000, 65000, 5),
  producto('20', 'RP-PAN-A54', 'Pantalla de repuesto Samsung A54', 'Repuestos', 120000, 135000, 160000, 230000, 3),
  // Producto genérico: reparaciones, servicios y artículos sin código. Su nombre y su valor se escriben en cada venta.
  { ...producto('99', 'GENERICO', 'Producto o servicio genérico', 'Servicios', 0, 0, 0, 0, 0), generico: true },
];

const buscarProducto = (id) => PRODUCTOS.find((candidato) => candidato.id === id);

// Línea de un documento con el precio de la lista elegida; el genérico lleva su propio nombre y valor
const LISTA_CAMPO = { surtido: 'precioSurtido', mayor: 'precioMayor', detal: 'precioDetal' };
const linea = (productoId, cantidad, lista, nombreGenerico = '', valorGenerico = 0) => {
  const elegido = buscarProducto(productoId);
  return {
    productoId,
    nombre: elegido.generico ? nombreGenerico : elegido.nombre,
    referencia: elegido.referencia,
    cantidad,
    valorUnitario: elegido.generico ? valorGenerico : elegido[LISTA_CAMPO[lista]],
    iva: elegido.iva,
  };
};

// Documento de venta con su total calculado a partir de las líneas
const venta = (datos, lista, lineas) => {
  const items = lineas.map(([productoId, cantidad, nombre, valor]) => linea(productoId, cantidad, lista, nombre, valor));
  return { ...datos, listaPrecio: lista, items, total: items.reduce((suma, item) => suma + item.cantidad * item.valorUnitario, 0) };
};

// Tiendas: T-01 es la bodega principal (vende al por mayor), las demás son almacenes al detal
const EN = {
  bodega: { tiendaId: 'T-01', bodegaId: 'B-01' },
  principal: { tiendaId: 'T-02', bodegaId: 'B-02' },
  unicentro: { tiendaId: 'T-03', bodegaId: 'B-03' },
  florida: { tiendaId: 'T-04', bodegaId: 'B-04' },
};
const ADMIN = { usuario: 'Administrador', usuarioCorreo: 'demo@generico.com' };
const CAMILA = { usuario: 'Camila Duarte', usuarioCorreo: 'camila@generico.com' };
// Ventas de mostrador sin datos del comprador: quedan a nombre del cliente Consumidor final (C-000)
const SIN_NOMBRE = { cliente: 'Consumidor final', clienteId: 'C-000' };

const VENTAS = [
  // Bodega principal: surtido a los almacenes (precio 1) y ventas por mayor (precio 2)
  venta({ id: 'F1', fecha: hace(7, 9, 1), ...ADMIN, ...EN.bodega, cliente: 'Almacén Principal', clienteId: 'C-007', metodo: 'Transferencia' }, 'surtido',
    [['1', 30], ['2', 30], ['4', 15], ['5', 15], ['11', 10], ['13', 20]]),
  venta({ id: 'F2', fecha: hace(7, 11, 2), ...ADMIN, ...EN.bodega, cliente: 'TecnoCel Envigado S.A.S.', clienteId: 'C-005', metodo: 'Crédito', plazoDias: 30 }, 'mayor',
    [['1', 40], ['2', 40], ['8', 6], ['11', 12], ['14', 20]]),
  venta({ id: 'F3', fecha: hace(6, 10, 3), ...ADMIN, ...EN.bodega, cliente: 'Almacén Unicentro', clienteId: 'C-008', metodo: 'Transferencia' }, 'surtido',
    [['3', 15], ['6', 15], ['9', 10], ['12', 6], ['16', 6]]),
  venta({ id: 'F4', fecha: hace(5, 15, 4), ...ADMIN, ...EN.bodega, cliente: 'Comunicaciones El Poblado', clienteId: 'C-006', metodo: 'Transferencia' }, 'mayor',
    [['4', 12], ['5', 12], ['7', 6], ['15', 4], ['18', 10]]),
  venta({ id: 'F5', fecha: hace(4, 9, 5), ...ADMIN, ...EN.bodega, cliente: 'Almacén Florida', clienteId: 'C-009', metodo: 'Transferencia' }, 'surtido',
    [['1', 20], ['2', 20], ['9', 8], ['13', 10], ['19', 3]]),
  venta({ id: 'F6', fecha: hace(2, 11, 6), ...ADMIN, ...EN.bodega, cliente: 'TecnoCel Envigado S.A.S.', clienteId: 'C-005', metodo: 'Crédito', plazoDias: 30 }, 'mayor',
    [['10', 4], ['17', 5], ['19', 6], ['20', 2]]),
  // Almacén principal: ventas al detal (precio 3) y reparaciones con el producto genérico
  venta({ id: 'F7', fecha: hace(6, 12, 7), ...CAMILA, ...EN.principal, ...SIN_NOMBRE, metodo: 'Efectivo', recibido: 50000, devuelta: 7000 }, 'detal',
    [['1', 1], ['4', 1]]),
  venta({ id: 'F8', fecha: hace(5, 17, 8), ...CAMILA, ...EN.principal, cliente: 'Laura Martínez', clienteId: 'C-001', metodo: 'Nequi' }, 'detal',
    [['8', 1], ['13', 1]]),
  venta({ id: 'F9', fecha: hace(4, 16, 9), ...CAMILA, ...EN.principal, cliente: 'Carlos Rodríguez', clienteId: 'C-002', metodo: 'Tarjeta' }, 'detal',
    [['99', 1, 'Cambio de pantalla Samsung A54 (mano de obra)', 70000], ['20', 1], ['2', 1]]),
  venta({ id: 'F10', fecha: hace(3, 13, 10), ...CAMILA, ...EN.principal, cliente: 'Valentina Gómez', clienteId: 'C-003', metodo: 'Crédito', plazoDias: 30 }, 'detal',
    [['15', 1], ['11', 1], ['5', 1]]),
  venta({ id: 'F11', fecha: hace(1, 10, 11), ...CAMILA, ...EN.principal, ...SIN_NOMBRE, metodo: 'Efectivo', recibido: 40000, devuelta: 0 }, 'detal',
    [['99', 1, 'Cambio de pin de carga', 25000], ['2', 1]]),
  venta({ id: 'F12', fecha: hace(0, 9, 12), ...CAMILA, ...EN.principal, cliente: 'Sofía Restrepo', clienteId: 'C-010', metodo: 'Nequi' }, 'detal',
    [['4', 1], ['1', 1], ['14', 1]]),
  // Almacén Unicentro y Almacén Florida
  venta({ id: 'F13', fecha: hace(5, 11, 13), ...ADMIN, ...EN.unicentro, ...SIN_NOMBRE, metodo: 'Efectivo', recibido: 20000, devuelta: 2000 }, 'detal',
    [['3', 1]]),
  venta({ id: 'F14', fecha: hace(3, 18, 14), ...ADMIN, ...EN.unicentro, cliente: 'Andrés Herrera', clienteId: 'C-004', metodo: 'Tarjeta' }, 'detal',
    [['9', 1], ['16', 1], ['6', 1]]),
  venta({ id: 'F15', fecha: hace(1, 15, 15), ...ADMIN, ...EN.unicentro, ...SIN_NOMBRE, metodo: 'Nequi' }, 'detal',
    [['99', 1, 'Instalación de vidrio templado', 5000], ['3', 1]]),
  venta({ id: 'F16', fecha: hace(4, 12, 16), ...ADMIN, ...EN.florida, ...SIN_NOMBRE, metodo: 'Efectivo', recibido: 50000, devuelta: 5000 }, 'detal',
    [['1', 2], ['13', 1]]),
  venta({ id: 'F17', fecha: hace(2, 17, 17), ...ADMIN, ...EN.florida, cliente: 'Laura Martínez', clienteId: 'C-001', metodo: 'Transferencia' }, 'detal',
    [['19', 1]]),
  venta({ id: 'F18', fecha: hace(0, 10, 18), ...ADMIN, ...EN.florida, ...SIN_NOMBRE, metodo: 'Efectivo', recibido: 20000, devuelta: 1000 }, 'detal',
    [['9', 1]]),
];

const DOCUMENTOS = [
  {
    ...venta({ id: 'C19', tipo: 'cotizacion', fecha: hace(20, 10, 19), ...CAMILA, ...EN.principal, cliente: 'Comunicaciones El Poblado', clienteId: 'C-006' }, 'mayor',
      [['8', 20], ['10', 5]]),
    observaciones: 'Pedido para temporada de fin de año', vigenciaHasta: hace(5, 10, 19), etapa: 'negociacion', convertidoEn: null, anulado: false,
  },
  {
    ...venta({ id: 'C20', tipo: 'cotizacion', fecha: hace(3, 15, 20), ...ADMIN, ...EN.bodega, cliente: 'TecnoCel Envigado S.A.S.', clienteId: 'C-005' }, 'mayor',
      [['15', 10], ['18', 20]]),
    observaciones: '', vigenciaHasta: dentroDe(12), etapa: 'enviada', convertidoEn: null, anulado: false,
  },
  {
    ...venta({ id: 'R21', tipo: 'remision', fecha: hace(1, 11, 21), ...ADMIN, ...EN.bodega, cliente: 'Comunicaciones El Poblado', clienteId: 'C-006' }, 'mayor',
      [['1', 25], ['3', 10]]),
    observaciones: 'Entrega en el local; se factura a fin de mes', convertidoEn: null, anulado: false,
  },
];

// Facturas de compra: todo entra a la bodega principal
const compra = (numero, proveedorId, proveedor, dias, lineas) => {
  const items = lineas.map(([productoId, cantidad]) => {
    const elegido = buscarProducto(productoId);
    return { productoId, nombre: elegido.nombre, cantidad, costoUnitario: elegido.costo };
  });
  return {
    numero, proveedorId, proveedor, fecha: hace(dias, 8).slice(0, 10), bodegaId: 'B-01', usuario: 'Administrador', ordenId: '',
    items, total: items.reduce((suma, item) => suma + item.cantidad * item.costoUnitario, 0),
  };
};

const FACTURAS = [
  compra('IC-5520', 'PV-001', 'Importadora Celutec S.A.S.', 10, [['1', 200], ['2', 200], ['3', 100], ['4', 80], ['5', 80], ['6', 80], ['7', 40]]),
  compra('AP-1187', 'PV-002', 'Audio Pro Colombia', 9, [['8', 40], ['9', 80], ['10', 15], ['19', 20]]),
  compra('PC-0932', 'PV-003', 'Distribuidora PowerCell', 8, [['11', 60], ['12', 40], ['13', 100], ['14', 100], ['15', 20], ['16', 40], ['17', 15], ['18', 50]]),
  compra('RM-0415', 'PV-004', 'Repuestos Móviles Medellín', 6, [['20', 8]]),
];

// Traslado ya recibido: la bodega principal surte memorias y soportes al Almacén Principal
const TRASLADOS = [
  {
    id: 'TR-0001', fecha: hace(5, 8, 30), origenId: 'B-01', destinoId: 'B-02', estado: 'recibido', usuario: 'Felipe Mora',
    observaciones: 'Reposición semanal', recibidoEn: hace(5, 14, 0), recibidoPor: 'Camila Duarte',
    items: [{ productoId: '18', nombre: 'Memoria microSD 64 GB', cantidad: 6 }, { productoId: '16', nombre: 'Soporte magnético para carro', cantidad: 6 }],
  },
];

// Stock final de cada producto en cada bodega (lo que se ve al abrir la app)
const STOCK_FINAL = {
  'B-01': { 1: 180, 2: 170, 3: 95, 4: 75, 5: 70, 6: 70, 7: 40, 8: 38, 9: 80, 10: 14, 11: 50, 12: 38, 13: 95, 14: 92, 15: 18, 16: 32, 17: 12, 18: 40, 19: 16, 20: 6 },
  'B-02': { 1: 28, 2: 26, 3: 8, 4: 13, 5: 14, 6: 6, 7: 4, 8: 3, 9: 6, 10: 1, 11: 9, 12: 3, 13: 19, 14: 6, 15: 2, 16: 8, 17: 2, 18: 7, 19: 2, 20: 2 },
  'B-03': { 1: 6, 2: 5, 3: 13, 4: 3, 5: 2, 6: 14, 7: 2, 8: 2, 9: 8, 11: 2, 12: 6, 13: 4, 14: 3, 16: 5, 18: 2 },
  'B-04': { 1: 18, 2: 20, 3: 2, 4: 2, 5: 2, 6: 3, 8: 1, 9: 6, 11: 2, 13: 9, 14: 2, 16: 1, 18: 1, 19: 2 },
};

const semilla = {
  version: 9,
  productos: PRODUCTOS,
  ventas: VENTAS,
  facturas: FACTURAS,
  orden: [0, 1, 2, 3],
  devoluciones: [],
  documentos: DOCUMENTOS,
  actividades: [
    { id: 'AC-0001', clienteId: 'C-006', tipo: 'llamada', descripcion: 'Pide precios de audífonos TWS y diademas para fin de año', fecha: hace(9, 11, 1), vence: '', responsable: 'Camila Duarte', responsableCorreo: 'camila@generico.com', completada: true },
    { id: 'AC-0002', clienteId: 'C-003', tipo: 'whatsapp', descripcion: 'Recordatorio del saldo de la factura F10', fecha: hace(1, 16, 2), vence: '', responsable: 'Camila Duarte', responsableCorreo: 'camila@generico.com', completada: true },
    { id: 'AC-0003', clienteId: 'C-005', tipo: 'tarea', descripcion: 'Cobrar el saldo de la factura F2', fecha: hace(1, 9, 3), vence: dentroDe(2), responsable: 'Administrador', responsableCorreo: 'demo@generico.com', completada: false },
    { id: 'AC-0004', clienteId: 'C-006', tipo: 'tarea', descripcion: 'Llamar para cerrar la cotización C19', fecha: hace(1, 10, 4), vence: dentroDe(1), responsable: 'Camila Duarte', responsableCorreo: 'camila@generico.com', completada: false },
    { id: 'AC-0005', clienteId: 'C-002', tipo: 'nota', descripcion: 'La pantalla del A54 quedó con garantía de 3 meses', fecha: hace(4, 17, 5), vence: '', responsable: 'Camila Duarte', responsableCorreo: 'camila@generico.com', completada: true },
  ],
  proveedores: [
    { id: 'PV-001', nombre: 'Importadora Celutec S.A.S.', nit: '900812345-1', telefono: '601 555 0110', correo: 'ventas@celutec.com.co', contacto: 'Andrea Ríos', plazoDias: 30 },
    { id: 'PV-002', nombre: 'Audio Pro Colombia', nit: '901223344-5', telefono: '604 555 0120', correo: 'pedidos@audiopro.co', contacto: 'Luis Gómez', plazoDias: 15 },
    { id: 'PV-003', nombre: 'Distribuidora PowerCell', nit: '800556677-2', telefono: '602 555 0130', correo: 'comercial@powercell.co', contacto: 'Paula Mesa', plazoDias: 30 },
    { id: 'PV-004', nombre: 'Repuestos Móviles Medellín', nit: '901998877-3', telefono: '604 555 0140', correo: 'repuestos@moviles.co', contacto: 'Jorge Patiño', plazoDias: 8 },
  ],
  ordenesCompra: [
    {
      id: 'OC-0001', fecha: hace(2, 9, 0), proveedorId: 'PV-002', proveedor: 'Audio Pro Colombia', estado: 'abierta', usuario: 'Administrador',
      observaciones: 'Para la cotización C19', facturaNumero: '',
      items: [{ productoId: '8', nombre: 'Audífonos Bluetooth TWS con estuche de carga', cantidad: 30, costoUnitario: 22000 }],
      total: 660000,
    },
  ],
  ajustesInventario: [],
  auditoria: [],
  ajustes: {
    tienda: { nombre: 'Zona Móvil Accesorios', nit: '901.456.789-1', telefono: '604 444 0100', ciudad: 'Medellín', direccion: 'Cra 52 # 14-30, Guayabal' },
    ventas: { metodosPago: ['Efectivo', 'Nequi', 'Tarjeta', 'Transferencia', 'Crédito'], permitirSinExistencias: false },
    recibo: { pie: 'Gracias por tu compra · Garantía de 30 días presentando este comprobante', mostrarDatosTienda: true },
  },
  clientes: [
    // Cliente fijo de las ventas de mostrador: viene elegido en Registrar venta, no tiene crédito ni se elimina
    { id: 'C-000', tipoDocumento: 'CC', documento: '222222222222', tipoPersona: 'natural', nombre: 'Consumidor final', telefono: '', correo: '', direccion: '', etiquetas: [], autorizaDatos: false, limiteCredito: 0, plazoDias: 30, listaPrecio: '', generico: true, creadoEn: hace(365, 9) },
    { id: 'C-001', tipoDocumento: 'CC', documento: '1036654321', tipoPersona: 'natural', nombre: 'Laura Martínez', telefono: '310 555 0142', correo: 'laura.martinez@correo.com', direccion: 'Cra 70 # 44-12', etiquetas: ['Frecuente'], autorizaDatos: true, limiteCredito: 0, plazoDias: 30, listaPrecio: '', creadoEn: hace(60, 9) },
    { id: 'C-002', tipoDocumento: 'CC', documento: '71234567', tipoPersona: 'natural', nombre: 'Carlos Rodríguez', telefono: '311 555 0187', correo: 'carlos.rodriguez@correo.com', direccion: 'Calle 33 # 80-25', etiquetas: ['Reparación'], autorizaDatos: true, limiteCredito: 0, plazoDias: 30, listaPrecio: '', creadoEn: hace(40, 9) },
    { id: 'C-003', tipoDocumento: 'CC', documento: '1017223344', tipoPersona: 'natural', nombre: 'Valentina Gómez', telefono: '312 555 0199', correo: 'valentina.gomez@correo.com', direccion: 'Cra 43A # 5-30', etiquetas: ['Frecuente', 'Crédito'], autorizaDatos: true, limiteCredito: 300000, plazoDias: 30, listaPrecio: '', creadoEn: hace(50, 9) },
    { id: 'C-004', tipoDocumento: 'CC', documento: '98765432', tipoPersona: 'natural', nombre: 'Andrés Herrera', telefono: '313 555 0123', correo: '', direccion: 'Calle 10 # 38-45', etiquetas: [], autorizaDatos: true, limiteCredito: 0, plazoDias: 30, listaPrecio: '', creadoEn: hace(30, 9) },
    { id: 'C-005', tipoDocumento: 'NIT', documento: '901555123-4', tipoPersona: 'juridica', nombre: 'TecnoCel Envigado S.A.S.', telefono: '604 555 0178', correo: 'compras@tecnocel.co', direccion: 'Calle 38 Sur # 43-20, Envigado', etiquetas: ['Mayorista', 'Crédito'], autorizaDatos: true, limiteCredito: 5000000, plazoDias: 30, listaPrecio: 'mayor', creadoEn: hace(90, 9) },
    { id: 'C-006', tipoDocumento: 'NIT', documento: '900777888-1', tipoPersona: 'juridica', nombre: 'Comunicaciones El Poblado', telefono: '604 555 0190', correo: 'gerencia@compoblado.co', direccion: 'Cra 43A # 1 Sur-100, local 140', etiquetas: ['Mayorista'], autorizaDatos: true, limiteCredito: 2000000, plazoDias: 30, listaPrecio: 'mayor', creadoEn: hace(80, 9) },
    { id: 'C-007', tipoDocumento: '', documento: '', tipoPersona: 'juridica', nombre: 'Almacén Principal', telefono: '604 444 0200', correo: '', direccion: 'Calle 52 # 47-28, local 112', etiquetas: ['Interno'], autorizaDatos: true, limiteCredito: 0, plazoDias: 30, listaPrecio: 'surtido', creadoEn: hace(120, 9) },
    { id: 'C-008', tipoDocumento: '', documento: '', tipoPersona: 'juridica', nombre: 'Almacén Unicentro', telefono: '604 444 0300', correo: '', direccion: 'Cra 66B # 34A-76, local 215', etiquetas: ['Interno'], autorizaDatos: true, limiteCredito: 0, plazoDias: 30, listaPrecio: 'surtido', creadoEn: hace(120, 9) },
    { id: 'C-009', tipoDocumento: '', documento: '', tipoPersona: 'juridica', nombre: 'Almacén Florida', telefono: '604 444 0400', correo: '', direccion: 'Calle 71 # 65-150, local 210', etiquetas: ['Interno'], autorizaDatos: true, limiteCredito: 0, plazoDias: 30, listaPrecio: 'surtido', creadoEn: hace(120, 9) },
    { id: 'C-010', tipoDocumento: 'CC', documento: '1037556677', tipoPersona: 'natural', nombre: 'Sofía Restrepo', telefono: '316 555 0134', correo: 'sofia.restrepo@correo.com', direccion: 'Calle 7 # 43-90', etiquetas: [], autorizaDatos: true, limiteCredito: 0, plazoDias: 30, listaPrecio: '', creadoEn: hace(10, 9) },
  ],
  pagos: [
    { id: 'PG-0001', fecha: hace(5, 11, 1), tipo: 'proveedor', terceroId: 'PV-001', tercero: 'Importadora Celutec S.A.S.', concepto: 'Abono a factura IC-5520', metodo: 'Transferencia', valor: 1500000, tiendaId: 'T-01', usuario: 'Administrador' },
    { id: 'PG-0002', fecha: hace(2, 12, 2), tipo: 'abono', terceroId: 'C-005', tercero: 'TecnoCel Envigado S.A.S.', concepto: 'Abono a deuda', metodo: 'Transferencia', valor: 500000, tiendaId: 'T-01', usuario: 'Administrador' },
  ],
  cajas: [],
  movimientosCaja: [],
  contabilidad: [],
  roles: [
    { id: ID_ROL_PROPIETARIO, nombre: 'Propietario', descripcion: 'Acceso total. No se puede modificar.', protegido: true, permisos: permisosCompletos() },
    {
      id: 'cajero', nombre: 'Cajero', descripcion: 'Registra ventas y consulta clientes.', protegido: false,
      permisos: { panel: ['ver'], 'nueva-venta': ['ver', 'crear'], ventas: ['ver'], clientes: ['ver', 'crear'], seguimiento: ['ver', 'crear', 'editar'], embudo: ['ver', 'editar'], caja: ['ver', 'crear'] },
    },
    {
      id: 'bodega', nombre: 'Bodeguero', descripcion: 'Administra el inventario, las compras y los traslados.', protegido: false,
      permisos: { panel: ['ver'], inventario: ['ver', 'crear', 'editar'], bodegas: ['ver', 'crear', 'editar'], proveedores: ['ver', 'crear', 'editar'] },
    },
  ],
  // tiendas: [] = acceso a todas las tiendas
  usuarios: [
    { id: 'U-001', nombre: 'Administrador', correo: 'demo@generico.com', rolId: ID_ROL_PROPIETARIO, activo: true, tiendas: [] },
    { id: 'U-002', nombre: 'Camila Duarte', correo: 'camila@generico.com', rolId: 'cajero', activo: true, tiendas: ['T-02'] },
    { id: 'U-003', nombre: 'Felipe Mora', correo: 'felipe@generico.com', rolId: 'bodega', activo: true, tiendas: [] },
  ],
  tiendas: [
    { id: 'T-01', nombre: 'Bodega Principal', direccion: 'Cra 52 # 14-30, Guayabal', telefono: '604 444 0100', ciudad: 'Medellín', bodegaId: 'B-01', listaPrecio: 'mayor', activa: true },
    { id: 'T-02', nombre: 'Almacén Principal', direccion: 'Calle 52 # 47-28, local 112', telefono: '604 444 0200', ciudad: 'Medellín', bodegaId: 'B-02', listaPrecio: 'detal', activa: true },
    { id: 'T-03', nombre: 'Almacén Unicentro', direccion: 'Cra 66B # 34A-76, local 215', telefono: '604 444 0300', ciudad: 'Medellín', bodegaId: 'B-03', listaPrecio: 'detal', activa: true },
    { id: 'T-04', nombre: 'Almacén Florida', direccion: 'Calle 71 # 65-150, local 210', telefono: '604 444 0400', ciudad: 'Medellín', bodegaId: 'B-04', listaPrecio: 'detal', activa: true },
  ],
  bodegas: [
    { id: 'B-01', nombre: 'Bodega principal', tiendaId: 'T-01', direccion: 'Cra 52 # 14-30, Guayabal', activa: true },
    { id: 'B-02', nombre: 'Bodega Almacén Principal', tiendaId: 'T-02', direccion: 'Calle 52 # 47-28, local 112', activa: true },
    { id: 'B-03', nombre: 'Bodega Almacén Unicentro', tiendaId: 'T-03', direccion: 'Cra 66B # 34A-76, local 215', activa: true },
    { id: 'B-04', nombre: 'Bodega Almacén Florida', tiendaId: 'T-04', direccion: 'Calle 71 # 65-150, local 210', activa: true },
  ],
  traslados: TRASLADOS,
  // Bodega: administrador y dos empleados. Almacén Principal: tres. Unicentro y Florida: uno cada uno.
  empleados: [
    { id: 'E-001', nombre: 'Administrador', tipoDocumento: 'CC', documento: '43111222', cargo: 'Gerente', tiendaId: 'T-01', telefono: '300 555 0101', correo: 'demo@generico.com',
      fechaIngreso: '2023-02-01', activo: true, usuarioId: 'U-001', metaMensual: 0, comision: 0, turno: 'Lunes a sábado 8:00 a 17:00' },
    { id: 'E-002', nombre: 'Felipe Mora', tipoDocumento: 'CC', documento: '1017445566', cargo: 'Auxiliar de bodega', tiendaId: 'T-01', telefono: '302 555 0103', correo: 'felipe@generico.com',
      fechaIngreso: '2024-06-01', activo: true, usuarioId: 'U-003', metaMensual: 0, comision: 0, turno: 'Lunes a sábado 7:00 a 16:00' },
    { id: 'E-003', nombre: 'Luisa Fernanda Ríos', tipoDocumento: 'CC', documento: '1036112233', cargo: 'Asesor mayorista', tiendaId: 'T-01', telefono: '304 555 0105', correo: '',
      fechaIngreso: '2025-01-15', activo: true, usuarioId: '', metaMensual: 15000000, comision: 1, turno: 'Lunes a viernes 8:00 a 17:00' },
    { id: 'E-004', nombre: 'Camila Duarte', tipoDocumento: 'CC', documento: '1036998877', cargo: 'Cajera', tiendaId: 'T-02', telefono: '301 555 0102', correo: 'camila@generico.com',
      fechaIngreso: '2025-03-15', activo: true, usuarioId: 'U-002', metaMensual: 4000000, comision: 2, turno: 'Lunes a sábado 9:00 a 19:00' },
    { id: 'E-005', nombre: 'Santiago Gil', tipoDocumento: 'CC', documento: '1152009988', cargo: 'Vendedor', tiendaId: 'T-02', telefono: '305 555 0106', correo: '',
      fechaIngreso: '2025-08-01', activo: true, usuarioId: '', metaMensual: 3500000, comision: 2, turno: 'Martes a domingo 10:00 a 20:00' },
    { id: 'E-006', nombre: 'Daniela Arango', tipoDocumento: 'CC', documento: '1001776655', cargo: 'Técnico de reparación', tiendaId: 'T-02', telefono: '306 555 0107', correo: '',
      fechaIngreso: '2024-11-10', activo: true, usuarioId: '', metaMensual: 0, comision: 10, turno: 'Lunes a sábado 9:00 a 18:00' },
    { id: 'E-007', nombre: 'Juliana Restrepo', tipoDocumento: 'CC', documento: '1152334455', cargo: 'Vendedora', tiendaId: 'T-03', telefono: '303 555 0104', correo: '',
      fechaIngreso: '2026-01-10', activo: true, usuarioId: '', metaMensual: 2500000, comision: 2, turno: 'Martes a domingo 10:00 a 20:00' },
    { id: 'E-008', nombre: 'Mateo Cárdenas', tipoDocumento: 'CC', documento: '1040667788', cargo: 'Vendedor', tiendaId: 'T-04', telefono: '307 555 0108', correo: '',
      fechaIngreso: '2025-10-01', activo: true, usuarioId: '', metaMensual: 2500000, comision: 2, turno: 'Lunes a sábado 10:00 a 20:00' },
  ],
};

// --- Stock e inventario inicial --------------------------------------------------------------------------
// Cada producto arranca con un ajuste "Inventario inicial" por bodega, calculado para que, con las compras, ventas,
// remisiones y traslados de la semilla, su kardex termine en el stock final de arriba.
const salidas = (bodegaId, productoId) =>
  [...VENTAS, ...DOCUMENTOS.filter((documento) => documento.tipo === 'remision')]
    .filter((documento) => documento.bodegaId === bodegaId)
    .flatMap((documento) => documento.items)
    .filter((item) => item.productoId === productoId)
    .reduce((suma, item) => suma + item.cantidad, 0);
const entradasPorCompra = (bodegaId, productoId) => FACTURAS
  .filter((factura) => factura.bodegaId === bodegaId)
  .flatMap((factura) => factura.items)
  .filter((item) => item.productoId === productoId)
  .reduce((suma, item) => suma + item.cantidad, 0);
const porTraslado = (bodegaId, productoId) => TRASLADOS.filter((traslado) => traslado.estado === 'recibido').reduce((suma, traslado) => {
  const cantidad = traslado.items.filter((item) => item.productoId === productoId).reduce((total, item) => total + item.cantidad, 0);
  if (traslado.destinoId === bodegaId) return suma + cantidad;
  if (traslado.origenId === bodegaId) return suma - cantidad;
  return suma;
}, 0);

PRODUCTOS.filter((elegido) => !elegido.generico).forEach((elegido, posicion) => {
  elegido.stock = {};
  Object.entries(STOCK_FINAL).forEach(([bodegaId, cantidades]) => {
    const final = cantidades[elegido.id] ?? 0;
    elegido.stock[bodegaId] = final;
    elegido.existencias += final;
    const inicial = final - entradasPorCompra(bodegaId, elegido.id) - porTraslado(bodegaId, elegido.id) + salidas(bodegaId, elegido.id);
    if (!inicial) return;
    semilla.ajustesInventario.push({
      id: `AJ-${String(semilla.ajustesInventario.length + 1).padStart(4, '0')}`,
      fecha: hace(15, 8, posicion),
      productoId: elegido.id,
      cantidad: inicial,
      motivo: 'Inventario inicial',
      usuario: 'Administrador',
      bodegaId,
    });
  });
});
PRODUCTOS.filter((elegido) => elegido.generico).forEach((elegido) => { elegido.stock = {}; });

export { semilla };
