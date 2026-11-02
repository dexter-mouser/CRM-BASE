// Últimas búsquedas de productos, guardadas en el navegador. La columna indica dónde se escribió el texto.
import { preferencias } from './preferencias.js';

const CLAVE_BUSQUEDAS = 'generico.busquedas';
const MAXIMO_GUARDADAS = 8;

export const ETIQUETAS_BUSQUEDA = {
  id: 'ID',
  referencia: 'Referencia',
  nombre: 'Producto',
  costo: 'Costo',
  existencias: 'Stock',
  general: 'Búsqueda',
};

export function leerBusquedas() {
  try {
    const guardadas = JSON.parse(preferencias.leer(CLAVE_BUSQUEDAS));
    return Array.isArray(guardadas) ? guardadas : [];
  } catch { return []; }
}

// La búsqueda más reciente va primero; si ya existía, se mueve al inicio sin repetirse
export function registrarBusqueda(columna, texto) {
  const limpio = texto.trim();
  if (!limpio) return;
  const anteriores = leerBusquedas().filter((busqueda) =>
    !(busqueda.columna === columna && busqueda.texto.toLowerCase() === limpio.toLowerCase()));
  preferencias.guardar(CLAVE_BUSQUEDAS, JSON.stringify([{ columna, texto: limpio }, ...anteriores].slice(0, MAXIMO_GUARDADAS)));
}

export const borrarBusquedas = () => preferencias.guardar(CLAVE_BUSQUEDAS, '[]');
