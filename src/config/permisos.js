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

// "Reabrir" e "Importar CSV" son permisos especiales: solo los admiten los módulos que los declaran.
// "Exportar CSV" lo tiene todo módulo con cuadrículas o tablas que se puedan descargar.
const TODAS_LAS_ACCIONES = ['ver', 'crear', 'editar', 'eliminar', 'exportar'];
const DATOS_MAESTROS = ['ver', 'crear', 'editar', 'eliminar', 'importar', 'exportar'];

// Módulos que no admiten todas las acciones
const ACCIONES_POR_MODULO = {
  panel: ['ver'],
  'nueva-venta': ['ver', 'crear'],
  ventas: ['ver', 'eliminar', 'exportar'],
  auditoria: ['ver', 'exportar'],
  reportes: ['ver', 'exportar'],
  contabilidad: ['ver', 'crear', 'reabrir', 'exportar'],
  ajustes: ['ver', 'editar', 'importar', 'exportar'],
  embudo: ['ver', 'editar'],
  tiendas: ['ver', 'crear', 'editar', 'exportar'],
  empleados: ['ver', 'crear', 'editar', 'importar', 'exportar'],
  clientes: DATOS_MAESTROS,
  inventario: DATOS_MAESTROS,
  proveedores: DATOS_MAESTROS,
};

export const MODULOS_PERMISOS = MENU.map((opcion) => ({
  id: opcion.id,
  etiqueta: opcion.etiqueta,
  acciones: ACCIONES_POR_MODULO[opcion.id] ?? TODAS_LAS_ACCIONES,
}));

export const permisosCompletos = () =>
  Object.fromEntries(MODULOS_PERMISOS.map((modulo) => [modulo.id, [...modulo.acciones]]));
