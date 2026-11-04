// Importación validada por CSV: se revisan todas las filas antes de dar algo por hecho; si alguna falla no se importa
// ninguna y el mensaje dice en qué filas está el problema (la fila 1 del archivo es el encabezado).
import { estado, guardarEstado } from './store.js';

const MAXIMO_FILAS = 5000;
const PROBLEMAS_A_MOSTRAR = 3;
const filaDelArchivo = (posicion) => `Fila ${posicion + 2}`;

// validar(elemento) devuelve el elemento listo para aplicar o lanza un error con el motivo.
// etiqueta(elemento, posicion) nombra el elemento en el mensaje de error (por defecto, su fila del archivo)
export function validarFilas(elementos, validar, etiqueta = (elemento, posicion) => filaDelArchivo(posicion)) {
  if (!elementos.length) throw new Error('El archivo no tiene registros');
  if (elementos.length > MAXIMO_FILAS) throw new Error(`El archivo tiene demasiadas filas (máximo ${MAXIMO_FILAS})`);
  const problemas = [];
  const validos = elementos.map((elemento, posicion) => {
    try {
      return validar(elemento);
    } catch (error) {
      problemas.push(`${etiqueta(elemento, posicion)}: ${error.message}`);
      return null;
    }
  });
  if (problemas.length) {
    const resto = problemas.length > PROBLEMAS_A_MOSTRAR ? ` (y ${problemas.length - PROBLEMAS_A_MOSTRAR} más)` : '';
    throw new Error(`No se importó nada. ${problemas.slice(0, PROBLEMAS_A_MOSTRAR).join(' · ')}${resto}`);
  }
  return validos;
}

// Documentos (ventas, compras, traslados…): se registran uno por uno con las reglas de cada servicio, que mueven stock,
// caja y deuda. Si alguno falla, todos los datos vuelven a como estaban antes de importar
export function aplicarTodoONada(elementos, aplicar, etiqueta) {
  const respaldo = structuredClone(estado);
  try {
    return validarFilas(elementos, aplicar, etiqueta);
  } catch (error) {
    Object.keys(estado).forEach((clave) => { delete estado[clave]; });
    Object.assign(estado, respaldo);
    guardarEstado();
    throw error;
  }
}

// Una fila por producto: las filas con el mismo valor en la columna agrupadora forman un documento
export function agruparPorDocumento(filas, columna) {
  const grupos = new Map();
  filas.forEach((fila, posicion) => {
    const clave = String(fila[columna] ?? '').trim();
    if (!clave) throw new Error(`${filaDelArchivo(posicion)}: escribe el número del documento para agrupar sus productos`);
    if (!grupos.has(clave)) grupos.set(clave, { clave, filas: [], posiciones: [] });
    grupos.get(clave).filas.push(fila);
    grupos.get(clave).posiciones.push(posicion);
  });
  return [...grupos.values()];
}

// Nombre de un documento agrupado en los mensajes de error: «Documento V1 (filas 2 a 3)»
export const etiquetaDeGrupo = (grupo) => {
  const primera = grupo.posiciones[0] + 2;
  const ultima = grupo.posiciones.at(-1) + 2;
  return `Documento ${grupo.clave} (${primera === ultima ? `fila ${primera}` : `filas ${primera} a ${ultima}`})`;
};

// Solo las columnas que trajo el archivo: las demás conservan el valor del registro existente
export const columnasDefinidas = (fila) => Object.fromEntries(Object.entries(fila).filter(([, valor]) => valor !== undefined));

// Evita dos filas del mismo archivo con el mismo dato (nombre, documento…): las reglas del servicio solo comparan
// con lo ya guardado
export function exigirUnico(vistos, clave, mensaje) {
  if (!clave) return;
  if (vistos.has(clave)) throw new Error(mensaje);
  vistos.add(clave);
}
