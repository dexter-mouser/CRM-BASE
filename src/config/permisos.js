// Permisos por módulo. Cada módulo del menú admite solo algunas acciones; el rol Propietario las tiene todas.
import { MENU } from './nav.js';

export const ID_ROL_PROPIETARIO = 'propietario';

export const ACCIONES = [
  { id: 'ver', etiqueta: 'Ver' },
  { id: 'crear', etiqueta: 'Crear' },
  { id: 'editar', etiqueta: 'Editar' },
  { id: 'eliminar', etiqueta: 'Eliminar' },
  { id: 'reabrir', etiqueta: 'Reabrir' },
];

// "Reabrir" es un permiso especial: solo lo admiten los módulos que lo declaran
const TODAS_LAS_ACCIONES = ['ver', 'crear', 'editar', 'eliminar'];

// Módulos que no admiten todas las acciones
const ACCIONES_POR_MODULO = {
  panel: ['ver'],
  'nueva-venta': ['ver', 'crear'],
  ventas: ['ver', 'eliminar'],
  auditoria: ['ver'],
  reportes: ['ver'],
  contabilidad: ['ver', 'crear', 'reabrir'],
  ajustes: ['ver', 'editar'],
  embudo: ['ver', 'editar'],
  tiendas: ['ver', 'crear', 'editar'],
  empleados: ['ver', 'crear', 'editar'],
};

export const MODULOS_PERMISOS = MENU.map((opcion) => ({
  id: opcion.id,
  etiqueta: opcion.etiqueta,
  acciones: ACCIONES_POR_MODULO[opcion.id] ?? TODAS_LAS_ACCIONES,
}));

export const permisosCompletos = () =>
  Object.fromEntries(MODULOS_PERMISOS.map((modulo) => [modulo.id, [...modulo.acciones]]));
