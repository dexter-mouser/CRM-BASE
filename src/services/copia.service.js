// Copia de seguridad: exporta e importa todos los datos en un archivo JSON, con validación completa antes de restaurar.
// La huella (SHA-256) detecta archivos dañados o editados a mano; no es una firma, así que no protege contra alguien que la recalcule.
import { estado, guardarEstado } from '../core/store.js';
import { semilla } from '../data/seed.js';
import { exigirPermiso } from '../core/autorizacion.js';
import { fechaDeHoy } from '../core/format.js';
import { LIMITES, ESQUEMA_DATOS, validarDatos } from '../core/validacion.js';
import { registrarAuditoria } from './auditoria.service.js';

const FORMATO = 'generico-copia-1';
// Todo lo que se guarda y se restaura: las secciones validadas y los datos de configuración
const CLAVES = [...Object.keys(ESQUEMA_DATOS), 'ajustes', 'orden'];

async function calcularHuella(texto) {
  const resumen = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(resumen)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const datosActuales = () => Object.fromEntries(CLAVES.map((clave) => [clave, estado[clave]]));

export async function descargarCopia() {
  exigirPermiso('ajustes', 'editar', 'descargar la copia de seguridad');
  const datos = datosActuales();
  const copia = {
    formato: FORMATO,
    version: semilla.version,
    fecha: new Date().toISOString(),
    huella: await calcularHuella(JSON.stringify(datos)),
    datos,
  };
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([JSON.stringify(copia)], { type: 'application/json' }));
  enlace.download = `copia-generico-${fechaDeHoy()}.json`;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
  registrarAuditoria('ajustes', 'Copia de seguridad descargada', '');
  guardarEstado();
}

// Lee y valida el archivo sin cambiar nada; devuelve los datos y el conteo por sección
export async function leerCopia(archivo) {
  if (archivo.size > LIMITES.archivoMaximoBytes) throw new Error('El archivo es demasiado grande (máximo 10 MB)');
  let copia;
  try {
    copia = JSON.parse(await archivo.text());
  } catch {
    throw new Error('El archivo no es una copia de seguridad válida');
  }
  if (copia?.formato !== FORMATO) throw new Error('Ese archivo no es una copia de seguridad de Genérico');
  if (copia.version !== semilla.version) throw new Error('La copia es de una versión distinta de la aplicación y no se puede restaurar');
  if (await calcularHuella(JSON.stringify(copia.datos)) !== copia.huella) throw new Error('La copia está dañada o fue modificada: la huella no coincide');
  const conteo = validarDatos(copia.datos);
  return { datos: copia.datos, conteo, fecha: copia.fecha };
}

// Reemplaza los datos actuales. Solo se copian las claves conocidas, nunca otras que traiga el archivo
export function restaurarCopia(datos) {
  exigirPermiso('ajustes', 'editar', 'restaurar copias de seguridad');
  validarDatos(datos);
  CLAVES.forEach((clave) => { estado[clave] = structuredClone(datos[clave]); });
  registrarAuditoria('ajustes', 'Copia de seguridad restaurada', `${datos.productos.length} productos, ${datos.ventas.length} ventas`);
  guardarEstado();
}
