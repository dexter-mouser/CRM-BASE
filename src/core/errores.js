// Mensaje de un error para mostrarlo en pantalla.
// Las reglas de negocio lanzan Error con un texto pensado para la persona: ese se muestra tal cual.
// Un error de programación (TypeError, ReferenceError…) nunca se muestra: la persona ve un aviso
// genérico y el detalle queda en la consola.
const ERRORES_DE_PROGRAMACION = [TypeError, ReferenceError, RangeError, SyntaxError, EvalError, URIError];
const AVISO_GENERICO = 'Algo salió mal. Intenta de nuevo; si sigue pasando, avisa al administrador.';

export function mensajeDeError(error) {
  const esDeProgramacion = !(error instanceof Error)
    || ERRORES_DE_PROGRAMACION.some((tipo) => error instanceof tipo);
  if (!esDeProgramacion) return error.message;
  console.error(error);
  return AVISO_GENERICO;
}
