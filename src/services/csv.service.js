// Documentos CSV: se abren y se importan directamente en cualquier hoja de cálculo. Hay un formato por cada dato
// maestro que se puede importar (productos, clientes, proveedores, empleados y catálogos): sus columnas, otros nombres
// que se aceptan al leer y cómo se escribe cada valor al descargar. Al leer, una columna que no trae el archivo queda
// sin definir (el registro existente conserva su valor) y las conversiones a códigos de catálogo las hace cada servicio,
// que valida todas las filas antes de cambiar nada.
import { LIMITES } from '../core/validacion.js';
import { estado } from '../core/store.js';
import { nombreDe } from './catalogos.service.js';
import { etiquetaDeLista } from './inventario.service.js';

const escapar = (valor) => {
  const texto = String(valor ?? '');
  return /[",;\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

const SI = 'Sí';
const siNo = (valor) => (valor ? SI : 'No');
const nombresDe = (clave, ids) => ids.map((id) => nombreDe(clave, id)).join(', ');

// columnas: [{ clave, titulo, alias (otros títulos aceptados, sin tildes ni mayúsculas), tipo ('entero'), de(registro) }]
export const FORMATOS = {
  productos: {
    archivo: 'inventario',
    obligatoria: 'nombre',
    columnas: [
      { clave: 'id', titulo: 'ID', alias: ['codigo'] },
      { clave: 'referencia', titulo: 'Referencia' },
      { clave: 'nombre', titulo: 'Producto', alias: ['nombre'] },
      { clave: 'categoria', titulo: 'Categoría', de: (producto) => nombreDe('categorias', producto.categoriaId) },
      { clave: 'unidad', titulo: 'Unidad', de: (producto) => nombreDe('unidades', producto.unidadId) },
      { clave: 'costo', titulo: 'Costo', tipo: 'entero' },
      { clave: 'precioSurtido', titulo: 'Precio 1', alias: ['precio surtido'], tipo: 'entero' },
      { clave: 'precioMayor', titulo: 'Precio 2', alias: ['precio por mayor', 'precio mayor'], tipo: 'entero' },
      { clave: 'precioDetal', titulo: 'Precio 3', alias: ['precio al detal', 'precio detal', 'precio', 'precio de venta'], tipo: 'entero' },
      { clave: 'iva', titulo: 'IVA', tipo: 'entero' },
      { clave: 'stockMinimo', titulo: 'Stock mínimo', alias: ['minimo'], tipo: 'entero' },
      { clave: 'existencias', titulo: 'Stock', alias: ['existencias'], tipo: 'entero' },
    ],
  },
  clientes: {
    archivo: 'clientes',
    obligatoria: 'nombre',
    columnas: [
      { clave: 'id', titulo: 'Código', alias: ['id'] },
      { clave: 'nombre', titulo: 'Nombre', alias: ['nombre o razon social', 'cliente'] },
      { clave: 'tipoPersona', titulo: 'Tipo de persona', de: (cliente) => nombreDe('tiposPersona', cliente.tipoPersona) },
      { clave: 'tipoDocumento', titulo: 'Tipo de documento' },
      { clave: 'documento', titulo: 'Documento', alias: ['numero de documento'] },
      { clave: 'telefono', titulo: 'Teléfono' },
      { clave: 'correo', titulo: 'Correo' },
      { clave: 'direccion', titulo: 'Dirección' },
      { clave: 'etiquetas', titulo: 'Etiquetas', de: (cliente) => nombresDe('etiquetasCliente', cliente.etiquetas) },
      { clave: 'limiteCredito', titulo: 'Cupo de crédito', tipo: 'entero' },
      { clave: 'plazoDias', titulo: 'Plazo (días)', alias: ['plazo', 'plazo de pago'], tipo: 'entero' },
      { clave: 'listaPrecio', titulo: 'Lista de precios', alias: ['lista'], de: (cliente) => etiquetaDeLista(cliente.listaPrecio) },
      { clave: 'autorizaDatos', titulo: 'Autoriza datos', de: (cliente) => siNo(cliente.autorizaDatos) },
    ],
  },
  proveedores: {
    archivo: 'proveedores',
    obligatoria: 'nombre',
    columnas: [
      { clave: 'id', titulo: 'Código', alias: ['id'] },
      { clave: 'nombre', titulo: 'Proveedor', alias: ['nombre'] },
      { clave: 'nit', titulo: 'NIT' },
      { clave: 'telefono', titulo: 'Teléfono' },
      { clave: 'correo', titulo: 'Correo' },
      { clave: 'contacto', titulo: 'Contacto' },
      { clave: 'plazoDias', titulo: 'Plazo (días)', alias: ['plazo', 'plazo de pago'], tipo: 'entero' },
    ],
  },
  empleados: {
    archivo: 'empleados',
    obligatoria: 'nombre',
    columnas: [
      { clave: 'id', titulo: 'Código', alias: ['id'] },
      { clave: 'nombre', titulo: 'Nombre', alias: ['nombre completo', 'empleado'] },
      { clave: 'tipoDocumento', titulo: 'Tipo de documento' },
      { clave: 'documento', titulo: 'Documento' },
      { clave: 'cargo', titulo: 'Cargo' },
      { clave: 'sucursal', titulo: 'Sucursal', alias: ['tienda'], de: (empleado) => estado.tiendas.find((tienda) => tienda.id === empleado.tiendaId)?.nombre ?? '' },
      { clave: 'telefono', titulo: 'Teléfono' },
      { clave: 'correo', titulo: 'Correo' },
      { clave: 'fechaIngreso', titulo: 'Fecha de ingreso', alias: ['ingreso'] },
      { clave: 'turno', titulo: 'Turno' },
      { clave: 'metaMensual', titulo: 'Meta mensual', alias: ['meta'], tipo: 'entero' },
      { clave: 'comision', titulo: 'Comisión (%)', alias: ['comision'] },
    ],
  },
  catalogos: {
    archivo: 'catalogos',
    obligatoria: 'catalogo',
    columnas: [
      { clave: 'catalogo', titulo: 'Catálogo' },
      { clave: 'id', titulo: 'Código', alias: ['id', 'sigla', 'tarifa'] },
      { clave: 'nombre', titulo: 'Nombre' },
      { clave: 'activo', titulo: 'Activo', de: (elemento) => siNo(elemento.activo) },
      { clave: 'tipo', titulo: 'Tipo (medios de pago)', alias: ['tipo'] },
      { clave: 'pideDetalle', titulo: 'Pide detalle (motivos)', alias: ['pide detalle'], de: (elemento) => (elemento.pideDetalle === undefined ? '' : siNo(elemento.pideDetalle)) },
    ],
  },
};

// "Sí", "si", "x", "1" o "true" son sí; vacío, "No" o "0" son no (el servicio decide qué hacer con lo desconocido)
export const leerSiNo = (texto) => (texto === undefined ? undefined : ['si', 'x', '1', 'true'].includes(sinTildes(texto)));

// Lista escrita "Frecuente, Mayorista" -> ['Frecuente', 'Mayorista']
export const leerLista = (texto) => (texto === undefined ? undefined : String(texto).split(/[,;|]/).map((parte) => parte.trim()).filter(Boolean));

function sinTildes(texto) {
  return String(texto).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Descarga cualquier tabla como CSV: columnas = ['Fecha', ...], filas = [[...], ...]
export function descargarCsv(nombreArchivo, columnas, filas) {
  const contenido = [columnas, ...filas].map((fila) => fila.map(escapar).join(',')).join('\r\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8' }));
  enlace.download = nombreArchivo;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

// Descarga los registros en el formato de importación: sirve de plantilla y de respaldo editable
export function descargarFormato(clave, registros) {
  const { archivo, columnas } = FORMATOS[clave];
  descargarCsv(`${archivo}.csv`, columnas.map((columna) => columna.titulo),
    registros.map((registro) => columnas.map((columna) => (columna.de ? columna.de(registro) : registro[columna.clave]) ?? '')));
}

function separarFilas(texto, delimitador) {
  const filas = [];
  let fila = [], campo = '', entreComillas = false;
  for (let posicion = 0; posicion < texto.length; posicion++) {
    const caracter = texto[posicion];
    if (entreComillas) {
      if (caracter === '"' && texto[posicion + 1] === '"') { campo += '"'; posicion++; }
      else if (caracter === '"') entreComillas = false;
      else campo += caracter;
    } else if (caracter === '"') {
      entreComillas = true;
    } else if (caracter === delimitador) {
      fila.push(campo);
      campo = '';
    } else if (caracter === '\n' || caracter === '\r') {
      if (caracter === '\r' && texto[posicion + 1] === '\n') posicion++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += caracter;
    }
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((candidata) => candidata.some((celda) => celda.trim() !== ''));
}

// Un valor que no es un entero se deja como NaN para que la validación avise en qué fila está el error
const aEntero = (texto) => {
  const limpio = texto.replace(/[\s$.%]/g, '');
  if (limpio === '') return 0;
  return /^-?\d+$/.test(limpio) ? Number(limpio) : NaN;
};

// Lee un archivo con el formato indicado; devuelve una lista de objetos con las claves de sus columnas
export async function leerFormato(clave, archivo) {
  if (archivo.size > LIMITES.archivoMaximoBytes) throw new Error('El archivo es demasiado grande (máximo 10 MB)');
  const { columnas, obligatoria } = FORMATOS[clave];
  const texto = (await archivo.text()).replace(/^﻿/, '');
  const primeraLinea = texto.split(/\r?\n/)[0] ?? '';
  const delimitador = (primeraLinea.match(/;/g) || []).length > (primeraLinea.match(/,/g) || []).length ? ';' : ',';
  const [encabezado = [], ...filas] = separarFilas(texto, delimitador);
  const titulos = encabezado.map(sinTildes);
  const posiciones = columnas.map((columna) => titulos.findIndex((titulo) => [columna.titulo, ...(columna.alias ?? [])].map(sinTildes).includes(titulo)));
  const requerida = columnas.findIndex((columna) => columna.clave === obligatoria);
  if (posiciones[requerida] < 0) throw new Error(`El archivo debe tener la columna ${columnas[requerida].titulo}`);
  return filas.map((fila) => Object.fromEntries(columnas.map((columna, indice) => {
    if (posiciones[indice] < 0) return [columna.clave, undefined];
    const valor = (fila[posiciones[indice]] ?? '').trim();
    return [columna.clave, columna.tipo === 'entero' ? aEntero(valor) : valor];
  })));
}

