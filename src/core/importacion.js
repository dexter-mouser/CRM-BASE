// Importación validada de datos maestros (CSV): se revisan todas las filas antes de cambiar nada; si alguna falla no
// se importa ninguna y el mensaje dice en qué filas está el problema (la fila 1 del archivo es el encabezado).
const MAXIMO_FILAS = 5000;
const PROBLEMAS_A_MOSTRAR = 3;

// validar(fila) devuelve la fila lista para aplicar o lanza un error con el motivo
export function validarFilas(filas, validar) {
  if (!filas.length) throw new Error('El archivo no tiene registros');
  if (filas.length > MAXIMO_FILAS) throw new Error(`El archivo tiene demasiadas filas (máximo ${MAXIMO_FILAS})`);
  const problemas = [];
  const validas = filas.map((fila, posicion) => {
    try {
      return validar(fila);
    } catch (error) {
      problemas.push(`Fila ${posicion + 2}: ${error.message}`);
      return null;
    }
  });
  if (problemas.length) {
    const resto = problemas.length > PROBLEMAS_A_MOSTRAR ? ` (y ${problemas.length - PROBLEMAS_A_MOSTRAR} más)` : '';
    throw new Error(`No se importó nada. ${problemas.slice(0, PROBLEMAS_A_MOSTRAR).join(' · ')}${resto}`);
  }
  return validas;
}

// Solo las columnas que trajo el archivo: las demás conservan el valor del registro existente
export const columnasDefinidas = (fila) => Object.fromEntries(Object.entries(fila).filter(([, valor]) => valor !== undefined));

// Evita dos filas del mismo archivo con el mismo dato (nombre, documento…): las reglas del servicio solo comparan
// con lo ya guardado
export function exigirUnico(vistos, clave, mensaje) {
  if (!clave) return;
  if (vistos.has(clave)) throw new Error(mensaje);
  vistos.add(clave);
}
