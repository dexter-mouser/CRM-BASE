// Botones de la cabecera para importar datos maestros por CSV (productos, clientes, proveedores, empleados):
//   [data-plantilla-csv]  descarga los registros en el formato de importación (sirve de plantilla y para editar)
//   [data-importar-csv]   campo de archivo (dentro de su <label class="boton archivo">) que importa el CSV elegido
// Solo se muestran si el rol tiene el permiso "Importar CSV" del módulo.
//
// conectarImportacion(raiz, contexto, { modulo, formato, registros, importar, alImportar })
//   formato     clave del formato en csv.service (productos, clientes…)
//   registros   función que da los registros que se descargan
//   importar    función (filas) del servicio; devuelve { agregados, actualizados }
//   alImportar  función tras importar (repintar la cuadrícula o redibujar)
import { buscar } from '../../core/dom.js';
import { puede } from '../../core/autorizacion.js';
import { descargarFormato, leerFormato } from '../../services/csv.service.js';

export function conectarImportacion(raiz, contexto, { modulo, formato, registros, importar, alImportar }) {
  const plantilla = buscar('[data-plantilla-csv]', raiz);
  const entrada = buscar('[data-importar-csv]', raiz);
  if (!puede(modulo, 'importar')) {
    plantilla.hidden = true;
    entrada.closest('label').hidden = true;
    return;
  }
  plantilla.onclick = () => {
    descargarFormato(formato, registros());
    contexto.aviso('Plantilla CSV descargada correctamente');
  };
  entrada.onchange = async (evento) => {
    const archivo = evento.target.files[0];
    evento.target.value = '';
    if (!archivo) return;
    try {
      const { agregados, actualizados } = importar(await leerFormato(formato, archivo));
      contexto.aviso(`CSV importado correctamente: ${agregados} nuevo(s) y ${actualizados} actualizado(s)`);
      alImportar();
    } catch (error) {
      contexto.alerta(error.message);
    }
  };
}
