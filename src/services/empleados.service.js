// Empleados: ficha, tienda, cargo, turno, meta mensual y comisión. Un empleado puede tener o no usuario del sistema;
// si lo tiene, su acceso por tienda (usuario.tiendas, vacío = todas) se gestiona desde su ficha.
import { estado, guardarEstado } from '../core/store.js';
import { siguienteCodigo } from '../core/codigos.js';
import { exigirPermiso } from '../core/autorizacion.js';
import { exigirCorreo, exigirEntero, exigirFecha, exigirTelefono, exigirTexto, TIPOS_DOCUMENTO } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';
import { aFechaLocal, fechaDeHoy } from '../core/format.js';

export const CARGOS = ['Gerente', 'Administrador de tienda', 'Asesor mayorista', 'Cajero', 'Cajera', 'Vendedor', 'Vendedora', 'Técnico de reparación', 'Auxiliar de bodega', 'Domiciliario', 'Contador'];

export const buscarEmpleado = (id) => estado.empleados.find((empleado) => empleado.id === id);
export const usuarioDeEmpleado = (empleado) => estado.usuarios.find((usuario) => usuario.id === empleado.usuarioId) ?? null;

// Desempeño del mes en curso: ventas netas registradas por su usuario, avance de la meta y comisión estimada
export function desempenoDelMes(empleado) {
  const usuario = usuarioDeEmpleado(empleado);
  const mes = fechaDeHoy().slice(0, 7);
  const ventas = usuario ? estado.ventas.filter((venta) => venta.usuario === usuario.nombre && aFechaLocal(venta.fecha).startsWith(mes)) : [];
  const idsVentas = new Set(ventas.map((venta) => venta.id));
  const devuelto = estado.devoluciones.filter((nota) => idsVentas.has(nota.ventaId)).reduce((suma, nota) => suma + nota.total, 0);
  const total = ventas.reduce((suma, venta) => suma + venta.total, 0) - devuelto;
  return {
    cantidad: ventas.length,
    total,
    avance: empleado.metaMensual ? Math.round((total / empleado.metaMensual) * 100) : null,
    comision: Math.round(total * (empleado.comision ?? 0) / 100),
    cajas: estado.cajas.filter((caja) => usuario && caja.usuario === usuario.nombre && aFechaLocal(caja.apertura).startsWith(mes)).length,
  };
}

function prepararDatos(datos, idActual) {
  const tipoDocumento = TIPOS_DOCUMENTO[datos.tipoDocumento] ? datos.tipoDocumento : 'CC';
  const documento = exigirTexto(datos.documento, 'el documento', { maximo: 20 });
  if (!/^[0-9A-Za-z.-]{3,20}$/.test(documento)) throw new Error('El documento solo puede tener números, letras, punto y guion');
  if (estado.empleados.some((empleado) => empleado.id !== idActual && empleado.documento === documento && empleado.tipoDocumento === tipoDocumento)) {
    throw new Error(`Ya existe un empleado con el documento ${tipoDocumento} ${documento}`);
  }
  const tienda = estado.tiendas.find((candidata) => candidata.id === datos.tiendaId);
  if (!tienda) throw new Error('Elige la sucursal donde trabaja');
  const usuarioId = datos.usuarioId || '';
  if (usuarioId && !estado.usuarios.some((usuario) => usuario.id === usuarioId)) throw new Error('El usuario elegido no existe');
  if (usuarioId && estado.empleados.some((empleado) => empleado.id !== idActual && empleado.usuarioId === usuarioId)) {
    throw new Error('Ese usuario ya está asignado a otro empleado');
  }
  const comision = Number(datos.comision ?? 0);
  if (!Number.isFinite(comision) || comision < 0 || comision > 50) throw new Error('La comisión debe estar entre 0 y 50 %');
  return {
    nombre: exigirTexto(datos.nombre, 'el nombre del empleado'),
    tipoDocumento,
    documento,
    cargo: exigirTexto(datos.cargo, 'el cargo', { maximo: 60 }),
    tiendaId: tienda.id,
    telefono: exigirTelefono(datos.telefono),
    correo: exigirCorreo(datos.correo, { obligatorio: false }),
    fechaIngreso: exigirFecha(datos.fechaIngreso, 'la fecha de ingreso'),
    turno: exigirTexto(datos.turno, 'el turno', { obligatorio: false, maximo: 120 }),
    metaMensual: exigirEntero(datos.metaMensual ?? 0, 'la meta mensual'),
    comision,
    usuarioId,
  };
}

// Acceso por tienda del usuario del empleado: lista de tiendas, o vacía si tiene todas. null = no se cambia.
function validarAcceso(datos) {
  if (!datos.usuarioId || !Array.isArray(datos.tiendasAcceso)) return null;
  const validas = datos.tiendasAcceso.filter((id) => estado.tiendas.some((tienda) => tienda.id === id));
  if (!validas.length) throw new Error('Elige al menos una sucursal a la que tenga acceso');
  return validas.length === estado.tiendas.length ? [] : validas;
}

function aplicarAcceso(empleado, acceso) {
  const usuario = usuarioDeEmpleado(empleado);
  if (usuario && acceso) usuario.tiendas = acceso;
}

export function agregarEmpleado(datos) {
  exigirPermiso('empleados', 'crear', 'registrar empleados');
  const limpios = prepararDatos(datos, null);
  const acceso = validarAcceso(datos);
  const empleado = { id: siguienteCodigo(estado.empleados.map((existente) => existente.id), 'E', 3), ...limpios, activo: true };
  estado.empleados.push(empleado);
  aplicarAcceso(empleado, acceso);
  registrarAuditoria('empleados', 'Empleado registrado', `${empleado.id} · ${empleado.nombre} · ${empleado.cargo}`);
  guardarEstado();
  return empleado;
}

export function actualizarEmpleado(id, datos) {
  exigirPermiso('empleados', 'editar', 'editar empleados');
  const empleado = buscarEmpleado(id);
  if (!empleado) throw new Error('El empleado no existe');
  const limpios = prepararDatos(datos, id);
  const acceso = validarAcceso(datos);
  Object.assign(empleado, limpios);
  aplicarAcceso(empleado, acceso);
  registrarAuditoria('empleados', 'Empleado editado', `${empleado.id} · ${empleado.nombre}`);
  guardarEstado();
}

// Al retirar un empleado su usuario (si tiene) también queda inactivo; debe quedar al menos un propietario activo
export function cambiarEstadoEmpleado(id, activo) {
  exigirPermiso('empleados', 'editar', 'retirar o reintegrar empleados');
  const empleado = buscarEmpleado(id);
  if (!empleado) throw new Error('El empleado no existe');
  const usuario = usuarioDeEmpleado(empleado);
  if (!activo && usuario?.activo) {
    const esPropietario = estado.roles.find((rol) => rol.id === usuario.rolId)?.protegido;
    const otroPropietario = estado.usuarios.some((otro) => otro.id !== usuario.id && otro.activo && estado.roles.find((rol) => rol.id === otro.rolId)?.protegido);
    if (esPropietario && !otroPropietario) throw new Error('Debe quedar al menos un propietario activo');
    usuario.activo = false;
  }
  empleado.activo = Boolean(activo);
  empleado.fechaRetiro = activo ? '' : fechaDeHoy();
  registrarAuditoria('empleados', activo ? 'Empleado reintegrado' : 'Empleado retirado', `${empleado.nombre}${!activo && usuario ? ' · usuario desactivado' : ''}`);
  guardarEstado();
}
