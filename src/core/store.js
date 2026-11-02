import { semilla } from '../data/seed.js';

const CLAVE_DATOS = 'generico.tienda';

// Cada vista es una página distinta, así que los datos de prueba se guardan en el navegador entre páginas.
// Si lo guardado tiene otra estructura que la semilla, se parte de la semilla.
// Lo guardado antes de que existieran ajustes, roles o usuarios se completa con esas secciones de la semilla.
function completarConSemilla(guardado) {
  for (const clave of Object.keys(semilla)) guardado[clave] ??= structuredClone(semilla[clave]);
  return guardado;
}

// Cambios de estructura entre versiones: se aplican en orden a lo guardado para no perder los datos del negocio
const MIGRACIONES = {
  // 8: cliente fijo Consumidor final; las ventas guardadas sin cliente quedan a su nombre
  8: (datos) => {
    const consumidor = semilla.clientes.find((cliente) => cliente.generico);
    if (!datos.clientes.some((cliente) => cliente.generico)) datos.clientes.unshift(structuredClone(consumidor));
    [datos.ventas, datos.documentos, datos.devoluciones].forEach((lista = []) => lista.forEach((registro) => {
      if (!registro.clienteId && registro.cliente === 'Cliente sin nombre') registro.clienteId = consumidor.id;
    }));
  },
  // 9: nombres estándar de CRM; el rol de bodega de la semilla pasa a llamarse Bodeguero si no se le cambió el nombre
  9: (datos) => {
    const rol = (datos.roles ?? []).find((candidato) => candidato.id === 'bodega' && candidato.nombre === 'Bodega');
    if (rol) rol.nombre = 'Bodeguero';
  },
};
const VERSION_MINIMA_MIGRABLE = 7;

function migrar(guardado) {
  for (let version = guardado.version + 1; version <= semilla.version; version += 1) MIGRACIONES[version]?.(guardado);
  guardado.version = semilla.version;
  return guardado;
}

function cargar() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_DATOS));
    if (guardado?.version === semilla.version) return completarConSemilla(guardado);
    if (guardado?.version >= VERSION_MINIMA_MIGRABLE && guardado.version < semilla.version) return completarConSemilla(migrar(guardado));
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
