// Columnas y datos de cada tipo de registro que se elige con el selector (cliente, proveedor, producto, factura).
// Todos los selectores de la app salen de aquí: cambiar una columna la cambia en todas las pantallas.
import { estado } from '../../core/store.js';
import { aPesos, aFecha } from '../../core/format.js';
import { deudaDeCliente, cupoDisponible } from '../../services/clientes.service.js';
import { saldoConProveedor } from '../../services/proveedores.service.js';
import { etiquetaDeLista, existenciasVisibles } from '../../services/inventario.service.js';
import { listaDeTienda } from '../../services/ventas.service.js';
import { tiendaActivaId, TODAS_LAS_TIENDAS } from '../../core/tienda.js';
import { nombreDe } from '../../services/catalogos.service.js';

const documentoDe = (registro) => (registro.documento ? `${registro.tipoDocumento} ${registro.documento}` : '');

// --- Clientes ----------------------------------------------------------------------------------------------
export const COLUMNAS_CLIENTE = [
  { clave: 'id', titulo: 'Código', ancho: '70px' },
  { clave: 'documentoTexto', titulo: 'Identificación', ancho: '150px' },
  { clave: 'nombre', titulo: 'Nombre', ancho: 'minmax(0, 1.5fr)' },
  { clave: 'telefono', titulo: 'Teléfono', ancho: '120px' },
  { clave: 'listaTexto', titulo: 'Lista de precios', ancho: '110px' },
  { clave: 'deudaTexto', titulo: 'Saldo pendiente', ancho: '100px', alinear: 'derecha' },
  { clave: 'cupoTexto', titulo: 'Crédito disponible', ancho: '100px', alinear: 'derecha' },
];

// Sin lista propia el cliente compra con la de la sucursal activa; con "todas" no hay una que mostrar
const listaDeCliente = (cliente) => {
  if (cliente.listaPrecio) return cliente.listaPrecio;
  const tiendaId = tiendaActivaId();
  return tiendaId && tiendaId !== TODAS_LAS_TIENDAS ? listaDeTienda(tiendaId) : '';
};

// filtro: función opcional para dejar solo algunos (por ejemplo, sin el consumidor final o solo con deuda)
export const clientesParaElegir = (filtro = () => true) => estado.clientes.filter(filtro).map((cliente) => ({
  ...cliente,
  documentoTexto: documentoDe(cliente),
  listaTexto: etiquetaDeLista(listaDeCliente(cliente)),
  deudaTexto: aPesos(deudaDeCliente(cliente)),
  cupoTexto: cliente.limiteCredito ? aPesos(cupoDisponible(cliente)) : 'Sin crédito',
}));

// --- Proveedores -------------------------------------------------------------------------------------------
export const COLUMNAS_PROVEEDOR = [
  { clave: 'id', titulo: 'Código', ancho: '84px' },
  { clave: 'nit', titulo: 'NIT', ancho: '140px' },
  { clave: 'nombre', titulo: 'Proveedor', ancho: 'minmax(0, 1.5fr)' },
  { clave: 'telefono', titulo: 'Teléfono', ancho: '120px' },
  { clave: 'plazoTexto', titulo: 'Plazo', ancho: '90px' },
  { clave: 'saldoTexto', titulo: 'Por pagar', ancho: '110px', alinear: 'derecha' },
];

export const proveedoresParaElegir = (filtro = () => true) => estado.proveedores.filter(filtro).map((proveedor) => ({
  ...proveedor,
  plazoTexto: `${proveedor.plazoDias} días`,
  saldo: saldoConProveedor(proveedor.id),
  saldoTexto: aPesos(saldoConProveedor(proveedor.id)),
}));

// --- Productos ---------------------------------------------------------------------------------------------
export const COLUMNAS_PRODUCTO = [
  { clave: 'id', titulo: 'Código', ancho: '70px' },
  { clave: 'referencia', titulo: 'Referencia', ancho: '120px' },
  { clave: 'nombre', titulo: 'Producto', ancho: 'minmax(0, 1.6fr)' },
  { clave: 'categoriaTexto', titulo: 'Categoría', ancho: '130px' },
  { clave: 'stockTexto', titulo: 'Stock', ancho: '80px', alinear: 'derecha' },
];

export const productosParaElegir = (filtro = () => true) => estado.productos.filter(filtro).map((producto) => ({
  ...producto,
  categoriaTexto: nombreDe('categorias', producto.categoriaId),
  stockTexto: producto.generico ? '—' : String(existenciasVisibles(producto)),
}));

// --- Facturas de venta ---------------------------------------------------------------------------------------
export const COLUMNAS_FACTURA = [
  { clave: 'id', titulo: 'N°', ancho: '70px' },
  { clave: 'fechaTexto', titulo: 'Fecha', ancho: '120px' },
  { clave: 'cliente', titulo: 'Cliente', ancho: 'minmax(0, 1.5fr)' },
  { clave: 'metodo', titulo: 'Pago', ancho: '110px' },
  { clave: 'totalTexto', titulo: 'Total', ancho: '110px', alinear: 'derecha' },
];

export const facturasParaElegir = (lista) => lista.map((venta) => ({
  ...venta,
  fechaTexto: aFecha(venta.fecha),
  totalTexto: aPesos(venta.total),
}));
