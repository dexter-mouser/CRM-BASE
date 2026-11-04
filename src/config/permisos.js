// Permisos por módulo. Cada módulo del menú admite solo algunas acciones; el rol Propietario las tiene todas.
import { MENU } from './nav.js';

export const ID_ROL_PROPIETARIO = 'propietario';

export const ACCIONES = [
  { id: 'ver', etiqueta: 'Ver' },
  { id: 'crear', etiqueta: 'Crear' },
  { id: 'editar', etiqueta: 'Editar' },
  { id: 'eliminar', etiqueta: 'Eliminar' },
  { id: 'reabrir', etiqueta: 'Reabrir' },
  { id: 'importar', etiqueta: 'Importar CSV' },
  { id: 'exportar', etiqueta: 'Exportar CSV' },
];

// "Reabrir" es un permiso especial: solo lo admiten los módulos que lo declaran. "Importar CSV" y "Exportar CSV" los
// tienen los módulos con cuadrículas; auditoría, contabilidad y reportes solo exportan (sus datos se calculan o solo se agregan).
const TODAS_LAS_ACCIONES = ['ver', 'crear', 'editar', 'eliminar', 'importar', 'exportar'];

// Módulos que no admiten todas las acciones
const ACCIONES_POR_MODULO = {
  panel: ['ver'],
  'nueva-venta': ['ver', 'crear'],
  ventas: ['ver', 'eliminar', 'importar', 'exportar'],
  auditoria: ['ver', 'exportar'],
  reportes: ['ver', 'exportar'],
  contabilidad: ['ver', 'crear', 'reabrir', 'exportar'],
  ajustes: ['ver', 'editar', 'importar', 'exportar'],
  embudo: ['ver', 'editar'],
  tiendas: ['ver', 'crear', 'editar', 'importar', 'exportar'],
  empleados: ['ver', 'crear', 'editar', 'importar', 'exportar'],
};

export const MODULOS_PERMISOS = MENU.map((opcion) => ({
  id: opcion.id,
  etiqueta: opcion.etiqueta,
  acciones: ACCIONES_POR_MODULO[opcion.id] ?? TODAS_LAS_ACCIONES,
}));

export const permisosCompletos = () =>
  Object.fromEntries(MODULOS_PERMISOS.map((modulo) => [modulo.id, [...modulo.acciones]]));
