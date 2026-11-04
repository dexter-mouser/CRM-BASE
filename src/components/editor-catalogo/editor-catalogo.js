// Editor de un catálogo de Ajustes (medios de pago, categorías, etapas…): una tabla pequeña donde cada fila se ordena
// con flechas, se renombra escribiendo encima, cambia sus columnas extra, se activa o desactiva y, si nadie la usa, se
// elimina (con confirmación). Abajo, una fila para agregar. El componente solo dibuja: las reglas están en el servicio.
//
// montarEditorCatalogo(contenedor, opciones)
//   plantillas  resultado de cargarPlantillasEditor()
//   clave       código del catálogo (para los id)
//   titulo, ayuda, singular   textos
//   codigo      { etiqueta, tipo: 'entero' | 'sigla' } si la persona escribe el código (tarifa de IVA, sigla)
//   extras      [{ clave, etiqueta, tipo: 'seleccion' | 'casilla', opciones: [[valor, texto]] }]
//   sinAgregar  true si el catálogo es fijo (solo se renombra)
//   elementos() lista actual; usos(id) cuántos registros lo usan; esFijo(id) si solo se renombra
//   alAgregar(datos), alCambiar(id, cambios), alMover(id, direccion), alActivar(id, activo), alEliminar(id):
//               aplican el cambio y devuelven true si se pudo
// Devuelve { pintar() }
import { buscar } from '../../core/dom.js';
import { cargarHtml, rellenar } from '../../core/template.js';
import { activarCamposNumericos } from '../../core/numeros.js';

export const cargarPlantillasEditor = () => cargarHtml(new URL('./editor-catalogo.html', import.meta.url));

export function montarEditorCatalogo(contenedor, {
  plantillas, clave, titulo, ayuda = '', singular, codigo = null, extras = [], sinAgregar = false,
  elementos, usos, esFijo, alAgregar, alCambiar, alMover, alActivar, alEliminar,
}) {
  const plantilla = (id) => plantillas.querySelector(`#${id}`).innerHTML;
  let porConfirmar = null;

  const htmlSeleccion = (extra, nombre, valor, bloqueo = '') => rellenar(plantilla('editor-seleccion'), {
    clave: extra.clave, etiqueta: extra.etiqueta, nombre, bloqueo,
    opciones: [['', `Elige ${extra.etiqueta.toLowerCase()}`], ...extra.opciones].map(([opcion, texto]) => rellenar(plantilla('editor-opcion'), {
      valor: opcion, texto, seleccion: opcion === valor ? 'selected' : '',
    })).join(''),
  });

  const htmlExtras = (elemento) => extras.map((extra) => (extra.tipo === 'casilla'
    ? rellenar(plantilla('editor-casilla'), { clave: extra.clave, etiqueta: extra.etiqueta, marcada: elemento?.[extra.clave] ? 'checked' : '' })
    // El tipo de un medio de pago con registros ya no cambia: la lógica de las ventas guardadas depende de él
    : htmlSeleccion(extra, elemento?.nombre ?? `nuevo ${singular}`, elemento?.[extra.clave] ?? '', extra.fijoConUso && elemento && usos(elemento.id) ? 'disabled' : ''))).join('');

  const htmlAcciones = (elemento) => {
    if (esFijo(elemento.id)) return '';
    const activar = rellenar(plantilla('editor-boton-activar'), { valor: elemento.activo ? 'no' : 'si', texto: elemento.activo ? 'Desactivar' : 'Activar' });
    return activar + (usos(elemento.id) ? '' : plantilla('editor-boton-eliminar'));
  };

  const htmlFila = (elemento, posicion, lista) => {
    const cantidad = usos(elemento.id);
    return rellenar(plantilla('editor-fila'), {
      id: elemento.id,
      nombre: elemento.nombre,
      clase: elemento.activo ? '' : 'inactiva',
      sinSubir: posicion === 0 ? 'disabled' : '',
      sinBajar: posicion === lista.length - 1 ? 'disabled' : '',
      codigo: codigo ? rellenar(plantilla('editor-codigo'), { etiqueta: codigo.etiqueta, codigo: elemento.id }) : '',
      extras: htmlExtras(elemento),
      uso: cantidad ? `${cantidad} en uso` : 'Sin uso',
      estado: esFijo(elemento.id) ? 'Fijo' : (elemento.activo ? 'Activo' : 'Inactivo'),
      claseEstado: elemento.activo ? 'exito' : 'suave',
      acciones: htmlAcciones(elemento),
    });
  };

  contenedor.innerHTML = rellenar(plantilla('editor-estructura'), {
    id: `catalogo-${clave}`, titulo, ayuda,
    agregar: sinAgregar ? '' : rellenar(plantilla('editor-agregar'), {
      singular,
      codigo: codigo ? rellenar(plantilla('editor-codigo-nuevo'), { etiqueta: codigo.etiqueta, numerico: codigo.tipo === 'entero' ? 'inputmode="numeric" data-numero="entero"' : '' }) : '',
      extras: htmlExtras(null),
    }),
  });
  const raiz = contenedor.firstElementChild;
  const filas = buscar('[data-filas]', raiz);
  const formularioNuevo = buscar('[data-agregar]', raiz);
  activarCamposNumericos(raiz);

  function pintar() {
    porConfirmar = null;
    const lista = elementos();
    filas.innerHTML = lista.map(htmlFila).join('');
  }

  // Cambios en una fila: nombre (al salir del campo o con Enter) y columnas extra
  const idDeFila = (nodo) => nodo.closest('[data-id]')?.dataset.id;
  filas.addEventListener('change', (evento) => {
    const id = idDeFila(evento.target);
    if (!id) return;
    const { target } = evento;
    let cambios = null;
    if (target.matches('[data-nombre]')) cambios = { nombre: target.value };
    else if (target.matches('[data-extra]')) cambios = { [target.dataset.extra]: target.type === 'checkbox' ? target.checked : target.value };
    if (cambios) {
      alCambiar(id, cambios);
      pintar();
    }
  });
  filas.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' && evento.target.matches('[data-nombre]')) evento.target.blur();
  });

  filas.addEventListener('click', (evento) => {
    const boton = evento.target.closest('button');
    const id = boton && idDeFila(boton);
    if (!id) return;
    if (boton.dataset.mover) {
      if (alMover(id, Number(boton.dataset.mover))) pintar();
      buscar(`[data-id="${CSS.escape(id)}"] [data-mover="${boton.dataset.mover}"]`, filas)?.focus();
    } else if (boton.dataset.activar) {
      if (alActivar(id, boton.dataset.activar === 'si')) pintar();
    } else if (boton.hasAttribute('data-eliminar')) {
      // Primer toque pide confirmar; el segundo elimina
      if (porConfirmar !== id) {
        porConfirmar = id;
        boton.textContent = '¿Eliminar? Confirmar';
        return;
      }
      if (alEliminar(id)) pintar();
    }
  });

  formularioNuevo?.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const datos = { nombre: formularioNuevo.elements.nombre.value, codigo: formularioNuevo.elements.codigo?.value };
    formularioNuevo.querySelectorAll('[data-extra]').forEach((campo) => {
      datos[campo.dataset.extra] = campo.type === 'checkbox' ? campo.checked : campo.value;
    });
    if (!alAgregar(datos)) return;
    formularioNuevo.reset();
    pintar();
    formularioNuevo.elements[codigo ? 'codigo' : 'nombre'].focus();
  });

  pintar();
  return { pintar };
}
