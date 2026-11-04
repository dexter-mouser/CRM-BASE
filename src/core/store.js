import { semilla } from '../data/seed.js';
import { registrarFallaDeAlmacenamiento } from './preferencias.js';

const CLAVE_DATOS = 'generico.tienda';

// Cada vista es una página distinta, así que los datos de prueba se guardan en el navegador entre páginas.
// Mientras la app no esté en producción no hay migraciones: lo guardado con otra versión se reemplaza por la semilla.
function cargar() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_DATOS));
    if (guardado?.version === semilla.version) return guardado;
  } catch (error) {
    registrarFallaDeAlmacenamiento(error);
  }
  return structuredClone(semilla);
}

export const estado = cargar();

// Si no se puede guardar (navegador sin espacio o bloqueado), quien hizo el cambio recibe el error y lo avisa
export function guardarEstado() {
  try {
    localStorage.setItem(CLAVE_DATOS, JSON.stringify(estado));
  } catch (error) {
    registrarFallaDeAlmacenamiento(error);
    throw new Error('No se pudieron guardar los cambios: el navegador no tiene espacio o bloquea el almacenamiento');
  }
}

// Al salir de la página ya no hay a quién avisar: el detalle quedó en la consola
function guardarAlSalir() {
  try {
    guardarEstado();
  } catch {
    // registrado en guardarEstado
  }
}

addEventListener('pagehide', guardarAlSalir);
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') guardarAlSalir();
});
