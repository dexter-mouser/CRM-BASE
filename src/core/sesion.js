// Sesión del navegador. Si la persona elige "mantener la sesión", vive en localStorage; si no, en sessionStorage.
const CLAVE_SESION = 'generico.sesion';
// Rol que el Propietario está viendo en esta pestaña (lo usa autorizacion.js); se quita al cerrar sesión
export const CLAVE_VER_COMO = 'generico.ver-como';
const DURACION_MS = 8 * 60 * 60 * 1000;
// Las páginas protegidas viven en paginas/; el ingreso está en la raíz
const RUTA_INGRESO = '../index.html';

function leer(almacen) {
  try {
    const datos = JSON.parse(almacen.getItem(CLAVE_SESION));
    return datos && datos.expira > Date.now() ? datos : null;
  } catch { return null; }
}

export function sesionActual() {
  try { return leer(sessionStorage) || leer(localStorage); } catch { return null; }
}

export function iniciarSesion(usuario, recordar) {
  const datos = { usuario: usuario.usuario, nombre: usuario.nombre, correo: usuario.correo, expira: Date.now() + DURACION_MS };
  try {
    sessionStorage.removeItem(CLAVE_SESION);
    localStorage.removeItem(CLAVE_SESION);
    (recordar ? localStorage : sessionStorage).setItem(CLAVE_SESION, JSON.stringify(datos));
  } catch { /* sin almacenamiento */ }
}

export function cerrarSesion(motivo = '') {
  try {
    sessionStorage.removeItem(CLAVE_SESION);
    localStorage.removeItem(CLAVE_SESION);
    sessionStorage.removeItem(CLAVE_VER_COMO);
  } catch { /* sin almacenamiento */ }
  location.replace(motivo ? `${RUTA_INGRESO}?aviso=${motivo}` : RUTA_INGRESO);
}

// Cierra la sesión si la persona no toca la página durante los minutos indicados
const MINUTOS_INACTIVIDAD = 30;
export function vigilarInactividad(minutos = MINUTOS_INACTIVIDAD) {
  let temporizador;
  const reiniciar = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => cerrarSesion('inactividad'), minutos * 60000);
  };
  ['pointerdown', 'keydown', 'scroll'].forEach((evento) => addEventListener(evento, reiniciar, { passive: true }));
  reiniciar();
}

// Se llama al inicio de toda página protegida: devuelve la sesión o redirige al ingreso.
export function requerirSesion() {
  const sesion = sesionActual();
  if (!sesion) {
    const pagina = location.pathname.split('/').pop() || 'panel.html';
    location.replace(`${RUTA_INGRESO}?siguiente=` + encodeURIComponent(pagina));
    return null;
  }
  return sesion;
}
