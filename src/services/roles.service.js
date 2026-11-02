// Reglas de negocio de Roles y permisos: roles, permisos por módulo y personas.
import { estado, guardarEstado } from '../core/store.js';
import { siguienteCodigo } from '../core/codigos.js';
import { ID_ROL_PROPIETARIO, MODULOS_PERMISOS } from '../config/permisos.js';
import { exigirPermiso } from '../core/autorizacion.js';
import { exigirCorreoDeTienda, exigirTexto, LIMITES } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';

const normalizar = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const buscarRol = (id) => estado.roles.find((rol) => rol.id === id);
export const miembrosDeRol = (rolId) => estado.usuarios.filter((usuario) => usuario.rolId === rolId).length;

function exigirEditable(rol) {
  if (!rol) throw new Error('El rol no existe');
  if (rol.protegido) throw new Error(`El rol ${rol.nombre} tiene acceso total y no se puede modificar`);
}

function exigirNombreLibre(nombre, idActual) {
  if (!nombre) throw new Error('Escribe el nombre del rol');
  const repetido = estado.roles.some((rol) => rol.id !== idActual && normalizar(rol.nombre) === normalizar(nombre));
  if (repetido) throw new Error(`Ya existe un rol llamado ${nombre}`);
}

export function crearRol({ nombre, descripcion }) {
  exigirPermiso('roles', 'crear', 'administrar roles y personas');
  const nombreLimpio = exigirTexto(nombre, 'el nombre del rol', { maximo: 60 });
  exigirNombreLibre(nombreLimpio, null);
  const base = normalizar(nombreLimpio).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'rol';
  let id = base;
  for (let numero = 2; buscarRol(id); numero++) id = `${base}-${numero}`;
  const rol = { id, nombre: nombreLimpio, descripcion: exigirTexto(descripcion, 'la descripción', { obligatorio: false, maximo: LIMITES.textoLargo }), protegido: false, permisos: { panel: ['ver'] } };
  estado.roles.push(rol);
  registrarAuditoria('roles', 'Rol creado', rol.nombre);
  guardarEstado();
  return rol;
}

export function actualizarRol(id, { nombre, descripcion }) {
  exigirPermiso('roles', 'editar', 'administrar roles y personas');
  const rol = buscarRol(id);
  exigirEditable(rol);
  const nombreLimpio = exigirTexto(nombre, 'el nombre del rol', { maximo: 60 });
  exigirNombreLibre(nombreLimpio, id);
  rol.nombre = nombreLimpio;
  rol.descripcion = exigirTexto(descripcion, 'la descripción', { obligatorio: false, maximo: LIMITES.textoLargo });
  registrarAuditoria('roles', 'Rol editado', rol.nombre);
  guardarEstado();
}

// Activar cualquier acción activa también "ver"; quitar "ver" quita todas las acciones del módulo
function aplicarPermiso(rol, moduloId, accion, activo) {
  const modulo = MODULOS_PERMISOS.find((candidato) => candidato.id === moduloId);
  if (!modulo || !modulo.acciones.includes(accion)) throw new Error('Ese módulo no admite esa acción');
  const marcadas = new Set(rol.permisos[moduloId] ?? []);
  if (activo) {
    marcadas.add(accion);
    marcadas.add('ver');
  } else if (accion === 'ver') {
    marcadas.clear();
  } else {
    marcadas.delete(accion);
  }
  const ordenadas = modulo.acciones.filter((candidata) => marcadas.has(candidata));
  if (ordenadas.length) rol.permisos[moduloId] = ordenadas;
  else delete rol.permisos[moduloId];
}

export function establecerPermiso(rolId, moduloId, accion, activo) {
  exigirPermiso('roles', 'editar', 'administrar roles y personas');
  const rol = buscarRol(rolId);
  exigirEditable(rol);
  aplicarPermiso(rol, moduloId, accion, activo);
  registrarAuditoria('roles', 'Permiso cambiado', `${rol.nombre} · ${moduloId} · ${accion} ${activo ? 'activado' : 'desactivado'}`);
  guardarEstado();
}

// cambios: [{ moduloId, accion, activo }], aplicados en orden y guardados una sola vez
export function establecerPermisos(rolId, cambios) {
  exigirPermiso('roles', 'editar', 'administrar roles y personas');
  const rol = buscarRol(rolId);
  exigirEditable(rol);
  cambios.forEach(({ moduloId, accion, activo }) => aplicarPermiso(rol, moduloId, accion, activo));
  registrarAuditoria('roles', 'Permisos cambiados', `${rol.nombre} · ${cambios.length} cambio(s)`);
  guardarEstado();
}

export function eliminarRol(id) {
  exigirPermiso('roles', 'eliminar', 'administrar roles y personas');
  const rol = buscarRol(id);
  exigirEditable(rol);
  const miembros = miembrosDeRol(id);
  if (miembros) throw new Error(`Hay ${miembros} persona(s) con este rol: cámbialas de rol antes de eliminarlo`);
  estado.roles = estado.roles.filter((candidato) => candidato.id !== id);
  registrarAuditoria('roles', 'Rol eliminado', rol.nombre);
  guardarEstado();
}

const buscarUsuario = (id) => estado.usuarios.find((usuario) => usuario.id === id);

const quedaOtroPropietarioActivo = (usuarioId) =>
  estado.usuarios.some((usuario) => usuario.id !== usuarioId && usuario.activo && usuario.rolId === ID_ROL_PROPIETARIO);

export function agregarUsuario({ nombre, correo, rolId }) {
  exigirPermiso('roles', 'crear', 'administrar roles y personas');
  const nombreLimpio = exigirTexto(nombre, 'el nombre de la persona');
  const correoLimpio = exigirCorreoDeTienda(correo);
  if (estado.usuarios.some((usuario) => usuario.correo === correoLimpio)) throw new Error('Ese correo ya está registrado');
  if (!buscarRol(rolId)) throw new Error('Elige el rol de la persona');
  const usuario = {
    id: siguienteCodigo(estado.usuarios.map((existente) => existente.id), 'U', 3),
    nombre: nombreLimpio,
    correo: correoLimpio,
    rolId,
    activo: true,
  };
  estado.usuarios.push(usuario);
  registrarAuditoria('roles', 'Persona agregada', `${usuario.nombre} · ${usuario.correo}`);
  guardarEstado();
  return usuario;
}

export function cambiarRolUsuario(usuarioId, rolId) {
  exigirPermiso('roles', 'editar', 'administrar roles y personas');
  const usuario = buscarUsuario(usuarioId);
  if (!usuario || !buscarRol(rolId)) throw new Error('No se pudo cambiar el rol');
  const dejaDeSerPropietario = usuario.rolId === ID_ROL_PROPIETARIO && rolId !== ID_ROL_PROPIETARIO;
  if (dejaDeSerPropietario && usuario.activo && !quedaOtroPropietarioActivo(usuarioId)) {
    throw new Error('Debe quedar al menos un propietario activo');
  }
  usuario.rolId = rolId;
  registrarAuditoria('roles', 'Rol de una persona cambiado', `${usuario.nombre} → ${buscarRol(rolId).nombre}`);
  guardarEstado();
}

export function cambiarEstadoUsuario(usuarioId, activo) {
  exigirPermiso('roles', 'editar', 'administrar roles y personas');
  const usuario = buscarUsuario(usuarioId);
  if (!usuario) throw new Error('No se pudo cambiar el estado');
  if (!activo && usuario.rolId === ID_ROL_PROPIETARIO && !quedaOtroPropietarioActivo(usuarioId)) {
    throw new Error('Debe quedar al menos un propietario activo');
  }
  usuario.activo = Boolean(activo);
  registrarAuditoria('roles', activo ? 'Persona activada' : 'Persona desactivada', usuario.nombre);
  guardarEstado();
}
