import { buscar } from '../../core/dom.js';
import { aFecha } from '../../core/format.js';
import { cargarHtml, seccion, repetir } from '../../core/template.js';
import { registrosDeAuditoria } from '../../services/auditoria.service.js';
import { descargarCsv } from '../../services/csv.service.js';
import { cargarPlantillasCuadricula, montarCuadricula } from '../../components/cuadricula-datos/cuadricula-datos.js';
import { cargarPlantillasFicha, crearFicha } from '../../components/ficha-registro/ficha-registro.js';

let documento;
let plantillasCuadricula;
let plantillasFicha;

export async function dibujar() {
  documento = await cargarHtml(new URL('./auditoria.html', import.meta.url));
  [plantillasCuadricula, plantillasFicha] = await Promise.all([cargarPlantillasCuadricula(), cargarPlantillasFicha()]);
  return seccion(documento, 'principal');
}

export function montar(raiz, contexto) {
  const cuadricula = montarCuadricula(buscar('#cuadricula-auditoria', raiz), {
    plantillas: plantillasCuadricula,
    titulo: 'Registro de auditoría',
    vacio: 'Aún no hay registros de auditoría.',
    columnas: [
      { clave: 'id', titulo: 'N°', ancho: '84px' },
      { clave: 'fechaTexto', titulo: 'Fecha', ancho: '140px' },
      { clave: 'usuario', titulo: 'Persona', ancho: '140px' },
      { clave: 'modulo', titulo: 'Módulo', ancho: '110px' },
      { clave: 'accion', titulo: 'Acción', ancho: 'minmax(0, 1fr)' },
      { clave: 'detalle', titulo: 'Detalle', ancho: 'minmax(0, 2fr)' },
      { clave: 'acciones', titulo: 'Acciones', ancho: '90px', filtrable: false, html: (fila) => repetir(documento, 'accion-registro', [{ id: fila.id }]) },
    ],
    // Desde Roles se llega con ?modulo=roles para ver solo los cambios de roles y permisos
    filtrosIniciales: { modulo: new URLSearchParams(location.search).get('modulo') ?? '' },
    filas: registrosDeAuditoria().map((registro) => ({ ...registro, fechaTexto: aFecha(registro.fecha) })),
  });

  // Ficha del registro (solo consulta: la auditoría no se edita ni se borra)
  const ficha = crearFicha(buscar('#ficha-auditoria', raiz), plantillasFicha);
  buscar('#cuadricula-auditoria', raiz).addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-ficha]');
    if (!boton) return;
    ficha.abrir(boton.dataset.ficha, () => {
      const registro = registrosDeAuditoria().find((candidato) => candidato.id === boton.dataset.ficha);
      if (!registro) return null;
      return {
        etiqueta: 'Ficha del registro de auditoría',
        titulo: `${registro.id} · ${registro.accion}`,
        subtitulo: `${registro.modulo} · ${aFecha(registro.fecha)}`,
        datos: [
          { etiqueta: 'Persona', valor: registro.usuario },
          { etiqueta: 'Módulo', valor: registro.modulo },
          { etiqueta: 'Fecha', valor: aFecha(registro.fecha) },
          { etiqueta: 'Acción', valor: registro.accion },
          { etiqueta: 'Detalle', valor: registro.detalle ?? '', ancho: true },
        ],
      };
    });
  });

  buscar('#descargar-auditoria', raiz).onclick = () => {
    const registros = cuadricula.filtradas();
    if (!registros.length) return contexto.alerta('No hay registros para descargar');
    descargarCsv('auditoria.csv', ['N°', 'Fecha', 'Persona', 'Módulo', 'Acción', 'Detalle'],
      registros.map((registro) => [registro.id, registro.fechaTexto, registro.usuario, registro.modulo, registro.accion, registro.detalle]));
    contexto.aviso('Documento CSV descargado correctamente');
  };
}
