import { semilla } from '../data/seed.js';

const CLAVE_DATOS = 'generico.tienda';

// Cada vista es una página distinta, así que los datos de prueba se guardan en el navegador entre páginas.
// Mientras la app no esté en producción no hay migraciones: lo guardado con otra versión se reemplaza por la semilla.
function cargar() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_DATOS));
    if (guardado?.version === semilla.version) return guardado;
  } catch { /* datos ilegibles */ }
  return structuredClone(semilla);
}

export const estado = cargar();

export function guardarEstado() {
  try { localStorage.setItem(CLAVE_DATOS, JSON.stringify(estado)); } catch { /* sin almacenamiento */ }
}

addEventListener('pagehide', guardarEstado);
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') guardarEstado();
});
