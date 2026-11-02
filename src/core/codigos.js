// Número mayor que aparece en una lista de códigos: numeroMayor(['F3', 'R7', '12']) -> 12
export const numeroMayor = (codigos) => codigos
  .map((codigo) => parseInt(String(codigo).replace(/^\D+/, ''), 10) || 0)
  .reduce((acumulado, numero) => Math.max(acumulado, numero), 0);

// Siguiente número consecutivo: siguienteNumero(['F1', 'F7']) -> 8
export const siguienteNumero = (codigos) => numeroMayor(codigos) + 1;

// Siguiente código con prefijo y relleno: siguienteCodigo(['C-001', 'C-007'], 'C', 3) -> 'C-008'
export function siguienteCodigo(codigos, prefijo, ancho) {
  return `${prefijo}-${String(siguienteNumero(codigos)).padStart(ancho, '0')}`;
}
