// Auditoría: registro de quién hizo qué y cuándo. Solo se agregan registros; ninguna pantalla los edita ni los borra.
import { estado } from '../core/store.js';
import { siguienteCodigo } from '../core/codigos.js';
import { nombreDeUsuario } from '../core/autorizacion.js';

const MAXIMO_REGISTROS = 2000;

// No guarda el estado: quien llama lo guarda junto con el cambio auditado
export function registrarAuditoria(modulo, accion, detalle = '', usuario = nombreDeUsuario()) {
  estado.auditoria.push({
    id: siguienteCodigo(estado.auditoria.map((registro) => registro.id), 'A', 5),
    fecha: new Date().toISOString(),
    usuario,
    modulo,
    accion,
    detalle: String(detalle).slice(0, 400),
  });
  if (estado.auditoria.length > MAXIMO_REGISTROS) estado.auditoria.splice(0, estado.auditoria.length - MAXIMO_REGISTROS);
}

export const registrosDeAuditoria = () => estado.auditoria.slice().reverse();
