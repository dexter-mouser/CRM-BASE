// Autorización en el navegador: quién es la persona de la sesión y qué puede hacer según su rol.
// IMPORTANTE: esto solo oculta pantallas y evita errores. La autorización real debe repetirse en el servidor (docs/seguridad.md).
import { estado } from './store.js';
import { sesionActual, CLAVE_VER_COMO } from './sesion.js';
import { registrarFallaDeAlmacenamiento } from './preferencias.js';

// "Ver como este rol": el Propietario recorre la app con el menú y los permisos de otro rol sin cerrar sesión.
// Se guarda solo en esta pestaña (sessionStorage) y se quita con "Volver a mi rol" o al cerrar sesión.

export function usuarioActual() {
  const sesion = sesionActual();
  if (!sesion) return null;
  return estado.usuarios.find((usuario) => usuario.correo === sesion.correo && usuario.activo) ?? null;
}

export const nombreDeUsuario = () => usuarioActual()?.nombre ?? sesionActual()?.nombre ?? 'Sistema';

const rolPorId = (id) => estado.roles.find((rol) => rol.id === id) ?? null;
const rolPropio = () => rolPorId(usuarioActual()?.rolId);
// Si la persona de la sesión es Propietario, aunque esté viendo la app como otro rol
export const esPropietario = () => Boolean(rolPropio()?.protegido);

// Rol que el Propietario está viendo (null si ve con el suyo). Solo vale un rol que exista y no sea el protegido
export function rolVisto() {
  if (!rolPropio()?.protegido) return null;
  let id = null;
  try {
    id = sessionStorage.getItem(CLAVE_VER_COMO);
  } catch (error) {
    registrarFallaDeAlmacenamiento(error);
  }
  const rol = rolPorId(id);
  return rol && !rol.protegido ? rol : null;
}

// Rol con el que se decide el menú, los botones y los permisos: el visto o el propio
export const rolActual = () => rolVisto() ?? rolPropio();

export function verComoRol(rolId) {
  const rol = rolPorId(rolId);
  if (!rolPropio()?.protegido) throw new Error('Solo el Propietario puede ver la app como otro rol');
  if (!rol || rol.protegido) throw new Error('Elige un rol distinto al Propietario');
  try {
    sessionStorage.setItem(CLAVE_VER_COMO, rol.id);
  } catch (error) {
    registrarFallaDeAlmacenamiento(error);
    throw new Error('El navegador no permite guardar la vista del rol');
  }
}

export function volverAMiRol() {
  try {
    sessionStorage.removeItem(CLAVE_VER_COMO);
  } catch (error) {
    registrarFallaDeAlmacenamiento(error);
  }
}

// El rol protegido (Propietario) puede todo; los demás, solo lo que su rol marca
export function puede(moduloId, accion = 'ver') {
  const rol = rolActual();
  if (!rol) return false;
  return rol.protegido || (rol.permisos[moduloId] ?? []).includes(accion);
}

export function exigirPermiso(moduloId, accion, descripcion = 'realizar esta acción') {
  if (!puede(moduloId, accion)) throw new Error(`Tu rol no tiene permiso para ${descripcion}`);
}
