const formatoPesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export const aPesos = (valor) => formatoPesos.format(valor);

// Acepta "2026-10-29" (solo fecha) o una fecha ISO completa
export function aFecha(valor) {
  const soloFecha = valor.length === 10;
  const fecha = new Date(soloFecha ? valor + 'T00:00:00' : valor);
  const opciones = soloFecha ? { dateStyle: 'medium' } : { dateStyle: 'short', timeStyle: 'short' };
  return new Intl.DateTimeFormat('es-CO', opciones).format(fecha);
}

// Fecha de hoy en hora local, con el formato de un campo <input type="date">
export const fechaDeHoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Fecha local con el formato de un campo <input type="date">, a partir de una fecha ISO completa
export const aFechaLocal = (iso) => {
  const fecha = new Date(iso);
  return new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
