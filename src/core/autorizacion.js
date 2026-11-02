// Autorización en el navegador: quién es la persona de la sesión y qué puede hacer según su rol.
// IMPORTANTE: esto solo oculta pantallas y evita errores. La autorización real debe repetirse en el servidor (docs/seguridad.md).
import { estado } from './store.js';
import { sesionActual } from './sesion.js';

export function usuarioActual() {
  const sesion = sesionActual();
  if (!sesion) return null;
  return estado.usuarios.find((usuario) => usuario.correo === sesion.correo && usuario.activo) ?? null;
}

export const nombreDeUsuario = () => usuarioActual()?.nombre ?? sesionActual()?.nombre ?? 'Sistema';

// El rol protegido (Propietario) puede todo; los demás, solo lo que su rol marca
export function puede(moduloId, accion = 'ver') {
  const usuario = usuarioActual();
  const rol = usuario && estado.roles.find((candidato) => candidato.id === usuario.rolId);
  if (!rol) return false;
  return rol.protegido || (rol.permisos[moduloId] ?? []).includes(accion);
}

export function exigirPermiso(moduloId, accion, descripcion = 'realizar esta acción') {
  if (!puede(moduloId, accion)) throw new Error(`Tu rol no tiene permiso para ${descripcion}`);
}
