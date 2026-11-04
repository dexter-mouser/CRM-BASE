// Botones para importar por CSV, en la cabecera (datos maestros) o en el pie de cada cuadrícula, junto a Exportar CSV:
//   plantilla  botón que descarga el formato de importación: con los registros actuales en los datos maestros y solo
//              con los títulos en los documentos (importar un documento lo registra de nuevo)
//   entrada    campo de archivo, dentro de su <label class="boton archivo"> o del enlace del pie
// Solo se muestran si el rol tiene el permiso "Importar CSV" del módulo.
//
// conectarImportacion({ plantilla, entrada, modulo, formato, registros, importar, alImportar })
//   formato     clave del formato en csv.service (productos, clientes, facturas…)
//   registros   función que da los registros de la plantilla
//   importar    función (filas) del servicio; devuelve { agregados, actualizados }
//   alImportar  función tras importar (repintar la cuadrícula o redibujar)
import { puede } from '../../core/autorizacion.js';
import { descargarFormato, leerFormato } from '../../services/csv.service.js';
import { mostrarAviso } from '../toast/toast.js';
import { mensajeDeError } from '../../core/errores.js';

export function conectarImportacion({ plantilla, entrada, modulo, formato, registros, importar, alImportar }) {
  if (!puede(modulo, 'importar')) {
    plantilla.hidden = true;
    entrada.closest('label').hidden = true;
    return;
  }
  plantilla.onclick = () => {
    descargarFormato(formato, registros());
    mostrarAviso('Plantilla CSV descargada correctamente');
  };
  entrada.onchange = async (evento) => {
    const archivo = evento.target.files[0];
    evento.target.value = '';
    if (!archivo) return;
    try {
      const { agregados, actualizados } = importar(await leerFormato(formato, archivo));
      mostrarAviso(`CSV importado correctamente: ${agregados} nuevo(s) y ${actualizados} actualizado(s)`);
      alImportar();
    } catch (error) {
      mostrarAviso(mensajeDeError(error), 'alerta');
    }
  };
}
