// Reglas de negocio de Clientes. La deuda sale de las ventas con un medio de pago de tipo crédito menos las devoluciones
// y los abonos registrados en Pagos.
// Ventas, devoluciones y abonos se relacionan con el cliente por su ID (no por el nombre), así cambiar el nombre no afecta la deuda.
// Cada cliente tiene un cupo de crédito y un plazo en días; cada factura a crédito vence a ese plazo.
import { estado, guardarEstado } from '../core/store.js';
import { siguienteCodigo } from '../core/codigos.js';
import { exigirPermiso } from '../core/autorizacion.js';
import { validarCliente } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';
import { esCredito, exigirElemento, idPorNombre, rangosCartera, rangoPorDias } from './catalogos.service.js';
import { LISTAS_PRECIO } from './inventario.service.js';
import { columnasDefinidas, exigirUnico, validarFilas } from '../core/importacion.js';
import { leerLista, leerSiNo } from './csv.service.js';

const normalizar = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const aCredito = (registro) => esCredito(registro.metodoId);
const DIA_MS = 86_400_000;

export const buscarCliente = (id) => estado.clientes.find((cliente) => cliente.id === id);

// Cliente fijo de las ventas de mostrador (generico: true): viene elegido en Registrar venta
export const consumidorFinal = () => estado.clientes.find((cliente) => cliente.generico);

export const ventasDeCliente = (cliente) => estado.ventas.filter((venta) => venta.clienteId === cliente.id);

export function deudaDeCliente(cliente) {
  const credito = ventasDeCliente(cliente)
    .filter(aCredito)
    .reduce((acumulado, venta) => acumulado + venta.total, 0);
  const devuelto = estado.devoluciones
    .filter((devolucion) => aCredito(devolucion) && devolucion.clienteId === cliente.id)
    .reduce((acumulado, devolucion) => acumulado + devolucion.total, 0);
  const abonos = estado.pagos
    .filter((pago) => pago.tipo === 'abono' && pago.terceroId === cliente.id)
    .reduce((acumulado, pago) => acumulado + pago.valor, 0);
  return Math.max(0, credito - devuelto - abonos);
}

export const clientesConDeuda = () => estado.clientes.filter((cliente) => deudaDeCliente(cliente) > 0);

// Lo que aún puede comprar a crédito
export const cupoDisponible = (cliente) => Math.max(0, (cliente.limiteCredito ?? 0) - deudaDeCliente(cliente));

// --- Cartera -----------------------------------------------------------------------------------------------
// Fecha de vencimiento de una factura a crédito: su fecha más el plazo con que se vendió
export const vencimientoDe = (venta) => new Date(new Date(venta.fecha).getTime() + venta.plazoDias * DIA_MS).toISOString();

// Facturas a crédito con saldo de un cliente. Las devoluciones bajan su propia factura y los abonos se
// aplican primero a la factura más antigua (como se acostumbra al cobrar cartera).
export function facturasPendientes(cliente, ahora = Date.now()) {
  const facturas = ventasDeCliente(cliente)
    .filter(aCredito)
    .map((venta) => {
      const devuelto = estado.devoluciones.filter((nota) => nota.ventaId === venta.id).reduce((suma, nota) => suma + nota.total, 0);
      return { venta, saldo: venta.total - devuelto };
    })
    .sort((a, b) => new Date(a.venta.fecha) - new Date(b.venta.fecha));
  let abonos = estado.pagos.filter((pago) => pago.tipo === 'abono' && pago.terceroId === cliente.id).reduce((suma, pago) => suma + pago.valor, 0);
  for (const factura of facturas) {
    const aplicado = Math.min(abonos, factura.saldo);
    factura.saldo -= aplicado;
    abonos -= aplicado;
  }
  return facturas.filter((factura) => factura.saldo > 0).map(({ venta, saldo }) => {
    const vence = vencimientoDe(venta);
    const diasVencida = Math.floor((ahora - new Date(vence).getTime()) / DIA_MS);
    return { id: venta.id, fecha: venta.fecha, vence, diasVencida, rango: rangoPorDias(diasVencida), total: venta.total, saldo };
  });
}

// Cartera por antigüedad: una fila por cliente con deuda y el saldo repartido en cada rango
export function carteraPorEdades(ahora = Date.now()) {
  return estado.clientes.map((cliente) => {
    const fila = { id: cliente.id, nombre: cliente.nombre, total: 0, ...Object.fromEntries(rangosCartera().map((rango) => [rango.id, 0])) };
    facturasPendientes(cliente, ahora).forEach((factura) => {
      fila[factura.rango] += factura.saldo;
      fila.total += factura.saldo;
    });
    return fila;
  }).filter((fila) => fila.total > 0).sort((a, b) => b.total - a.total);
}

// --- Altas, cambios y bajas --------------------------------------------------------------------------------
// Limpia y valida los datos; ni el nombre ni el documento pueden repetirse entre clientes
function prepararDatos(datos, idActual) {
  const limpios = validarCliente(datos);
  // Los datos de catálogo deben estar activos; al editar se acepta el que ya tenía aunque se haya desactivado
  const actual = buscarCliente(idActual) ?? { etiquetas: [] };
  exigirElemento('tiposPersona', limpios.tipoPersona, 'Elige el tipo de persona', actual.tipoPersona);
  if (limpios.tipoDocumento) exigirElemento('tiposDocumento', limpios.tipoDocumento, 'Elige el tipo de documento', actual.tipoDocumento);
  limpios.etiquetas.forEach((etiqueta) => exigirElemento('etiquetasCliente', etiqueta, 'Una de las etiquetas ya no está disponible', actual.etiquetas.includes(etiqueta) ? etiqueta : ''));
  const otros = estado.clientes.filter((cliente) => cliente.id !== idActual);
  if (otros.some((cliente) => normalizar(cliente.nombre) === normalizar(limpios.nombre))) throw new Error(`Ya existe un cliente llamado ${limpios.nombre}`);
  if (limpios.documento && otros.some((cliente) => cliente.documento === limpios.documento && cliente.tipoDocumento === limpios.tipoDocumento)) {
    throw new Error(`Ya existe un cliente con el documento ${limpios.tipoDocumento} ${limpios.documento}`);
  }
  return limpios;
}

export function agregarCliente(datos) {
  exigirPermiso('clientes', 'crear', 'crear clientes');
  const limpios = prepararDatos(datos, null);
  const cliente = { id: siguienteCodigo(estado.clientes.map((existente) => existente.id), 'C', 3), ...limpios, creadoEn: new Date().toISOString() };
  estado.clientes.push(cliente);
  registrarAuditoria('clientes', 'Cliente creado', `${cliente.id} · ${cliente.nombre}`);
  guardarEstado();
  return cliente;
}

// Las ventas anteriores conservan el nombre con el que se hicieron; la deuda sigue al cliente por su ID
export function actualizarCliente(id, datos) {
  exigirPermiso('clientes', 'editar', 'editar clientes');
  const cliente = buscarCliente(id);
  if (!cliente) throw new Error('El cliente no existe');
  const limpios = prepararDatos(datos, id);
  if (cliente.generico && limpios.limiteCredito) throw new Error('El consumidor final no puede tener cupo de crédito');
  if (limpios.limiteCredito !== cliente.limiteCredito) {
    registrarAuditoria('clientes', 'Cupo de crédito cambiado', `${cliente.id} · $ ${cliente.limiteCredito ?? 0} → $ ${limpios.limiteCredito}`);
  }
  Object.assign(cliente, limpios);
  registrarAuditoria('clientes', 'Cliente editado', `${cliente.id} · ${cliente.nombre}`);
  guardarEstado();
}

export function eliminarCliente(id) {
  exigirPermiso('clientes', 'eliminar', 'eliminar clientes');
  const cliente = buscarCliente(id);
  if (!cliente) throw new Error('El cliente no existe');
  if (cliente.generico) throw new Error('El consumidor final no se elimina: es el cliente de las ventas de mostrador');
  const deuda = deudaDeCliente(cliente);
  if (deuda > 0) throw new Error(`${cliente.nombre} tiene una deuda pendiente: registra el abono antes de eliminarlo`);
  estado.clientes = estado.clientes.filter((candidato) => candidato.id !== id);
  registrarAuditoria('clientes', 'Cliente eliminado', `${cliente.id} · ${cliente.nombre}`);
  guardarEstado();
}

// --- Importación CSV ---------------------------------------------------------------------------------------
// Convierte lo escrito en el archivo a los códigos que se guardan: tipo de persona y etiquetas por su nombre del
// catálogo, lista de precios por su número (1, 2 o 3; vacío = la de la sucursal) y "Sí"/"No" de la autorización
function datosDeFila(fila) {
  const datos = { ...fila };
  if (fila.tipoPersona !== undefined) datos.tipoPersona = idPorNombre('tiposPersona', fila.tipoPersona, 'El tipo de persona');
  if (fila.tipoDocumento !== undefined) datos.tipoDocumento = fila.tipoDocumento.toUpperCase();
  if (fila.etiquetas !== undefined) datos.etiquetas = leerLista(fila.etiquetas).map((nombre) => idPorNombre('etiquetasCliente', nombre, 'La etiqueta'));
  if (fila.listaPrecio !== undefined) {
    const lista = LISTAS_PRECIO.find((candidata) => candidata.numero === fila.listaPrecio.trim());
    if (fila.listaPrecio.trim() && !lista) throw new Error('La lista de precios debe ser 1, 2, 3 o quedar vacía');
    datos.listaPrecio = lista?.id ?? '';
  }
  if (fila.autorizaDatos !== undefined) datos.autorizaDatos = leerSiNo(fila.autorizaDatos);
  delete datos.id;
  return columnasDefinidas(datos);
}

// Una fila con el código de un cliente existente lo actualiza; sin código, crea uno nuevo
export function importarClientes(filas) {
  exigirPermiso('clientes', 'importar', 'importar clientes');
  const nombres = new Set();
  const documentos = new Set();
  const validas = validarFilas(filas, (fila) => {
    const actual = fila.id ? buscarCliente(fila.id) : null;
    if (fila.id && !actual) throw new Error(`no existe el cliente ${fila.id}: deja el código vacío para crearlo`);
    const limpios = prepararDatos({ ...actual, ...datosDeFila(fila) }, actual?.id ?? null);
    if (actual?.generico && limpios.limiteCredito) throw new Error('el consumidor final no puede tener cupo de crédito');
    exigirUnico(nombres, normalizar(limpios.nombre), `${limpios.nombre} está dos veces en el archivo`);
    exigirUnico(documentos, limpios.documento && `${limpios.tipoDocumento} ${limpios.documento}`, `el documento ${limpios.documento} está dos veces en el archivo`);
    return { actual, limpios };
  });
  let agregados = 0;
  validas.forEach(({ actual, limpios }) => {
    if (actual) Object.assign(actual, limpios);
    else {
      estado.clientes.push({ id: siguienteCodigo(estado.clientes.map((existente) => existente.id), 'C', 3), ...limpios, creadoEn: new Date().toISOString() });
      agregados += 1;
    }
  });
  const actualizados = validas.length - agregados;
  registrarAuditoria('clientes', 'Clientes importados', `${agregados} nuevos, ${actualizados} actualizados`);
  guardarEstado();
  return { agregados, actualizados };
}
