import { estado } from './store.js';

// Moneda y formato regional salen de Ajustes; el formateador se rehace solo cuando cambian
let formatoPesos = null;
const formatoRegional = () => estado.ajustes.parametros.formato;
export const monedaActual = () => estado.ajustes.parametros.moneda;

export function aPesos(valor) {
  const clave = `${formatoRegional()}|${monedaActual()}`;
  if (formatoPesos?.clave !== clave) {
    formatoPesos = { clave, formato: new Intl.NumberFormat(formatoRegional(), { style: 'currency', currency: monedaActual(), maximumFractionDigits: 0 }) };
  }
  return formatoPesos.formato.format(valor);
}

// Etiqueta de un campo de dinero con la moneda: conMoneda('Valor') -> 'Valor (COP)'
export const conMoneda = (etiqueta) => `${etiqueta} (${monedaActual()})`;

// Fechas y horas con el formato regional de Ajustes
export const formatoFecha = (opciones) => new Intl.DateTimeFormat(formatoRegional(), opciones);

// Acepta "2026-10-29" (solo fecha) o una fecha ISO completa
export function aFecha(valor) {
  const soloFecha = valor.length === 10;
  const fecha = new Date(soloFecha ? valor + 'T00:00:00' : valor);
  const opciones = soloFecha ? { dateStyle: 'medium' } : { dateStyle: 'short', timeStyle: 'short' };
  return formatoFecha(opciones).format(fecha);
}

// Fecha de hoy en hora local, con el formato de un campo <input type="date">
export const fechaDeHoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Fecha local con el formato de un campo <input type="date">, a partir de una fecha ISO completa
export const aFechaLocal = (iso) => {
  const fecha = new Date(iso);
  return new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
