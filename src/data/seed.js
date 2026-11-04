// Datos iniciales de la app recién instalada: sin productos, ventas ni clientes de ejemplo. Trae solo lo que la app
// necesita para funcionar: el administrador, una sucursal con su bodega, el Consumidor final, el producto genérico,
// los roles base y los catálogos y parámetros de Ajustes. Luego se reemplazan por llamadas a la API.
import { ID_ROL_PROPIETARIO, permisosCompletos } from '../config/permisos.js';

const AHORA = new Date().toISOString();

// Elemento activo de un catálogo de Ajustes; el primero de cada lista es el que se ve precargado
const elemento = (id, nombre, extras = {}) => ({ id, nombre, activo: true, ...extras });
const CATALOGOS = {
  metodosPago: [
    elemento('efectivo', 'Efectivo', { tipo: 'efectivo' }), elemento('nequi', 'Nequi', { tipo: 'otro' }), elemento('tarjeta', 'Tarjeta', { tipo: 'otro' }),
    elemento('transferencia', 'Transferencia', { tipo: 'otro' }), elemento('credito', 'Crédito', { tipo: 'credito' }),
  ],
  tarifasIva: [elemento('19', 'General 19 %'), elemento('5', 'Reducida 5 %'), elemento('0', 'Exento 0 %')],
  listasPrecio: [elemento('surtido', 'Surtido'), elemento('mayor', 'Por mayor'), elemento('detal', 'Al detal')],
  etapasEmbudo: [elemento('enviada', 'Enviada'), elemento('negociacion', 'En negociación'), elemento('ganada', 'Ganada'), elemento('perdida', 'Perdida')],
  motivosPerdida: [
    elemento('precio', 'Precio', { pideDetalle: false }), elemento('sin-existencias', 'Sin existencias', { pideDetalle: false }),
    elemento('competencia', 'Compró a la competencia', { pideDetalle: false }), elemento('sin-respuesta', 'Sin respuesta del cliente', { pideDetalle: false }),
    elemento('no-lo-necesita', 'Ya no lo necesita', { pideDetalle: false }), elemento('otro', 'Otro', { pideDetalle: true }),
  ],
  tiposActividad: [
    elemento('llamada', 'Llamada'), elemento('whatsapp', 'WhatsApp'), elemento('visita', 'Visita'), elemento('correo', 'Correo'),
    elemento('nota', 'Nota'), elemento('tarea', 'Tarea'),
  ],
  etiquetasCliente: [elemento('frecuente', 'Frecuente'), elemento('mayorista', 'Mayorista'), elemento('credito', 'Crédito')],
  tiposDocumento: [
    elemento('CC', 'Cédula de ciudadanía'), elemento('NIT', 'NIT'), elemento('CE', 'Cédula de extranjería'), elemento('PAS', 'Pasaporte'),
    elemento('TI', 'Tarjeta de identidad'),
  ],
  tiposPersona: [elemento('natural', 'Persona natural'), elemento('juridica', 'Persona jurídica')],
  categorias: [elemento('general', 'General'), elemento('servicios', 'Servicios')],
  unidades: [elemento('unidad', 'Unidad'), elemento('par', 'Par'), elemento('caja', 'Caja'), elemento('metro', 'Metro')],
};

const PARAMETROS = {
  vigenciaCotizacion: 15,
  plazoCredito: 30,
  descuentoMaximo: 20,
  diasInactividad: 60,
  cortesCartera: [30, 60, 90],
  moneda: 'COP',
  formato: 'es-CO',
  prefijos: { factura: 'F', remision: 'R', cotizacion: 'C', devolucion: 'ND', anulacion: 'NA', orden: 'OC', traslado: 'TR' },
};

const semilla = {
  version: 12,
  productos: [
    // Producto genérico: servicios, reparaciones y artículos sin código. Su nombre y su valor se escriben en cada venta.
    {
      id: '99', referencia: 'GENERICO', nombre: 'Producto o servicio genérico', categoriaId: 'servicios', unidadId: 'unidad',
      costo: 0, precioSurtido: 0, precioMayor: 0, precioDetal: 0, iva: 19, stockMinimo: 0, existencias: 0, stock: {}, generico: true,
    },
  ],
  ventas: [],
  facturas: [],
  orden: [0, 1, 2, 3],
  devoluciones: [],
  documentos: [],
  actividades: [],
  proveedores: [],
  ordenesCompra: [],
  ajustesInventario: [],
  auditoria: [],
  ajustes: {
    tienda: { nombre: 'Mi negocio', nit: '', telefono: '', ciudad: '', direccion: '' },
    // Marca que se ve en el encabezado y el ingreso: nombre comercial, logo (imagen en data URL, vacío = el de Genérico) y color
    marca: { nombreComercial: 'Genérico', logo: '', acento: '#4553c9' },
    ventas: { permitirSinExistencias: false },
    recibo: { pie: 'Gracias por tu compra', mostrarDatosTienda: true, anchoTirilla: 80 },
    parametros: PARAMETROS,
    catalogos: CATALOGOS,
  },
  clientes: [
    // Cliente fijo de las ventas de mostrador: viene elegido en Registrar venta, no tiene crédito ni se elimina
    {
      id: 'C-000', tipoDocumento: 'CC', documento: '222222222222', tipoPersona: 'natural', nombre: 'Consumidor final', telefono: '', correo: '',
      direccion: '', etiquetas: [], autorizaDatos: false, limiteCredito: 0, plazoDias: 30, listaPrecio: '', generico: true, creadoEn: AHORA,
    },
  ],
  pagos: [],
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
  ],
  tiendas: [
    { id: 'T-01', nombre: 'Tienda principal', direccion: '', telefono: '', ciudad: '', bodegaId: 'B-01', listaPrecio: 'detal', activa: true },
  ],
  bodegas: [
    { id: 'B-01', nombre: 'Bodega principal', tiendaId: 'T-01', direccion: '', activa: true },
  ],
  traslados: [],
  empleados: [],
};

export { semilla };
