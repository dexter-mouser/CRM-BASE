// Inventario <-> CSV. Es un documento de texto que abre y importa directamente cualquier hoja de cálculo del navegador.
// Columnas: ID, Referencia, Producto, Categoría, Costo, Precio 1 (surtido), Precio 2 (por mayor), Precio 3 (al detal), IVA,
// Stock mínimo, Stock (el stock admite negativos). Una columna "Precio" sola se toma como precio al detal.
// Al importar, las columnas que no traiga el archivo conservan el valor actual del producto.
import { LIMITES } from '../core/validacion.js';

const COLUMNAS = ['ID', 'Referencia', 'Producto', 'Categoría', 'Costo', 'Precio 1', 'Precio 2', 'Precio 3', 'IVA', 'Stock mínimo', 'Stock'];

const escapar = (valor) => {
  const texto = String(valor ?? '');
  return /[",;\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

export function descargarInventarioCsv(productos) {
  const filas = productos.map((producto) => [producto.id, producto.referencia, producto.nombre, producto.categoria ?? '', producto.costo,
    producto.precioSurtido ?? 0, producto.precioMayor ?? 0, producto.precioDetal ?? 0, producto.iva ?? 0, producto.stockMinimo ?? 0, producto.existencias]);
  const contenido = [COLUMNAS, ...filas].map((fila) => fila.map(escapar).join(',')).join('\r\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob(['\ufeff' + contenido], { type: 'text/csv;charset=utf-8' }));
  enlace.download = 'inventario.csv';
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
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

export async function leerInventarioCsv(archivo) {
  if (archivo.size > LIMITES.archivoMaximoBytes) throw new Error('El archivo es demasiado grande (máximo 10 MB)');
  const texto = (await archivo.text()).replace(/^\ufeff/, '');
  const primeraLinea = texto.split(/\r?\n/)[0] ?? '';
  const delimitador = (primeraLinea.match(/;/g) || []).length > (primeraLinea.match(/,/g) || []).length ? ';' : ',';
  const [encabezado = [], ...filas] = separarFilas(texto, delimitador);
  const sinTildes = (texto) => texto.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const columna = (...nombres) => encabezado.findIndex((titulo) => nombres.includes(sinTildes(titulo)));

  const posiciones = {
    id: columna('id'), referencia: columna('referencia'), nombre: columna('producto', 'nombre'), categoria: columna('categoria'),
    costo: columna('costo'), precioSurtido: columna('precio 1', 'precio surtido'), precioMayor: columna('precio 2', 'precio por mayor', 'precio mayor'),
    precioDetal: columna('precio 3', 'precio al detal', 'precio detal', 'precio', 'precio de venta'), iva: columna('iva'),
    stockMinimo: columna('stock minimo', 'minimo'), existencias: columna('stock', 'existencias'),
  };
  if (posiciones.nombre < 0) throw new Error('El archivo debe tener la columna Producto');

  // Una columna que no existe en el archivo queda sin definir para conservar el valor actual
  const leer = (fila, clave) => (posiciones[clave] >= 0 ? (fila[posiciones[clave]] ?? '').trim() : undefined);
  // Un valor que no es un entero se deja como NaN para que la validación avise en qué fila está el error
  const aEntero = (texto) => {
    if (texto === undefined) return undefined;
    const limpio = texto.replace(/[\s$.%]/g, '');
    if (limpio === '') return 0;
    return /^-?\d+$/.test(limpio) ? Number(limpio) : NaN;
  };
  return filas.map((fila) => ({
    id: leer(fila, 'id') ?? '',
    referencia: leer(fila, 'referencia'),
    nombre: leer(fila, 'nombre'),
    categoria: leer(fila, 'categoria'),
    costo: aEntero(leer(fila, 'costo')),
    precioSurtido: aEntero(leer(fila, 'precioSurtido')),
    precioMayor: aEntero(leer(fila, 'precioMayor')),
    precioDetal: aEntero(leer(fila, 'precioDetal')),
    iva: aEntero(leer(fila, 'iva')),
    stockMinimo: aEntero(leer(fila, 'stockMinimo')),
    existencias: aEntero(leer(fila, 'existencias')),
  }));
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
