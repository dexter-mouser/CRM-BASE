// Formulario declarativo (la misma idea de la cuadrícula y la ficha): los campos se describen en una lista y el
// componente arma el HTML, precarga los valores, los lee ya convertidos y avisa si falta un dato obligatorio.
// Lo que tiene un valor por defecto se ve escrito al abrir "Nuevo"; nada se rellena en silencio al guardar.
//
// const formulario = montarFormulario(contenedor, opciones)
//   plantillas    resultado de cargarPlantillasFormulario()
//   clave         prefijo de los id de los campos (cliente → #cliente-nombre)
//   titulo        título al crear; tituloEditar(registro) da el título al editar
//   columnas      2, 3 o 4 columnas en escritorio (en celular siempre una)
//   campos        [{ clave, etiqueta, tipo, opciones, valor, obligatorio, ancho, ayuda, ejemplo, maximo, alCambiar }]
//     tipo        texto (por defecto), entero, entero-negativo, decimal (admite coma), correo, telefono, fecha, clave, area, seleccion,
//                 lista (texto con sugerencias), etiquetas (texto separado por comas → lista), casilla, casillas,
//                 registro (selector filtrable de un cliente, proveedor, factura…: lleva columnas, registros, plural, vacio)
//     opciones    [[valor, texto]], [{ valor, texto }] o una función que las calcula al abrir
//     valor       valor por defecto al crear (o función que lo calcula al abrir); se ve escrito en el campo
//     obligatorio true para exigirlo al guardar
//     ancho       'completo' ocupa toda la fila; un número ocupa ese número de columnas
//     ayuda       texto corto debajo del campo; ejemplo: texto de muestra (placeholder) que nunca se guarda
//     alCambiar   función (valor, formulario) al cambiar el campo y al abrir (por ejemplo, habilitar otro)
//   incrustado    true: siempre visible y solo con el botón Guardar (formularios dentro de una ficha o de Ajustes)
//   valores       función que da el registro que muestra un formulario incrustado (al abrir y tras guardar);
//                 sin ella, tras guardar vuelve a los valores por defecto
//   textoGuardar  texto del botón Guardar
//   antes/despues HTML extra antes y después de los campos
//   alGuardar     función (datos, registro) que aplica el cambio; devuelve false si no se aplicó
//   alError       función (mensaje) para avisar un dato que falta (normalmente contexto.alerta)
//   alCancelar    función opcional al cancelar
// Devuelve { abrir(registro, titulo), cerrar(), leer(), escribir(valores), opciones(clave, lista), campo(clave),
//            enfocar(clave), habilitar(clave, si), mostrar(clave, si), etiquetar(clave, texto), registro(), abierto(), raiz }
import { buscar, buscarTodos, escaparHtml } from '../../core/dom.js';
import { cargarHtml, rellenar, repetir } from '../../core/template.js';
import { leerEntero, activarCamposNumericos } from '../../core/numeros.js';
import { cargarPlantillasSelector, montarSelectorRegistro } from '../selector-registro/selector-registro.js';

// Plantillas del formulario más las del selector de registros (campos tipo registro)
export async function cargarPlantillasFormulario() {
  const [propias, selector] = await Promise.all([cargarHtml(new URL('./formulario.html', import.meta.url)), cargarPlantillasSelector()]);
  propias.append(...selector.children);
  return propias;
}

const TIPOS_ENTRADA = {
  texto: 'text', lista: 'text', etiquetas: 'text', entero: 'text', 'entero-negativo': 'text', decimal: 'text',
  correo: 'email', telefono: 'tel', fecha: 'date', clave: 'password',
};
const CON_CAMBIO = new Set(['casilla', 'casillas', 'seleccion', 'fecha']);

const resolver = (valor) => (typeof valor === 'function' ? valor() : valor);

const normalizarOpciones = (lista) => (resolver(lista) ?? []).map((opcion) => {
  if (Array.isArray(opcion)) return { valor: opcion[0], texto: opcion[1] ?? opcion[0] };
  return typeof opcion === 'object' ? opcion : { valor: opcion, texto: opcion };
});

export function montarFormulario(contenedor, {
  plantillas, clave, titulo = '', tituloEditar = null, columnas = 3, campos, incrustado = false, valores = null,
  textoGuardar = 'Guardar', antes = '', despues = '', alGuardar, alError = () => {}, alCancelar = null,
}) {
  const plantilla = (id) => plantillas.querySelector(`#${id}`).innerHTML;
  const idDe = (campo) => `${clave}-${campo.clave}`;
  const tipoDe = (campo) => campo.tipo ?? 'texto';
  let registroAbierto = null;
  let api;

  const htmlOpciones = (campo) => repetir(plantillas, tipoDe(campo) === 'casillas' ? 'opcion-casilla' : 'opcion', normalizarOpciones(campo.opciones));

  // Las opciones calculadas con una función se llenan al abrir (pueden depender del formulario ya montado)
  const opcionesIniciales = (campo) => (typeof campo.opciones === 'function' ? '' : htmlOpciones(campo));

  function htmlCampo(campo) {
    const tipo = tipoDe(campo);
    const atributos = [];
    if (tipo === 'entero' || tipo === 'entero-negativo') atributos.push(`data-numero="${tipo}"`, 'inputmode="numeric"');
    if (tipo === 'telefono') atributos.push('inputmode="tel"');
    if (tipo === 'decimal') atributos.push('inputmode="decimal"');
    if (campo.maximo) atributos.push(`maxlength="${campo.maximo}"`);
    if (campo.ejemplo) atributos.push(`placeholder="${escaparHtml(campo.ejemplo)}"`);
    const sugerencias = tipo === 'lista' || (tipo === 'etiquetas' && campo.opciones);
    if (sugerencias) atributos.push(`list="${idDe(campo)}-sugerencias"`);
    if (campo.obligatorio) atributos.push('aria-required="true"');
    const datos = {
      clave: campo.clave,
      id: idDe(campo),
      etiqueta: campo.etiqueta,
      clase: campo.ancho === 'completo' ? 'ancho-completo' : (campo.ancho ? `ancho-${campo.ancho}` : ''),
      marca: campo.obligatorio ? plantilla('marca-obligatorio') : '',
      ayuda: campo.ayuda ? rellenar(plantilla('ayuda'), { texto: campo.ayuda }) : '',
      atributos: atributos.join(' '),
      tipo: TIPOS_ENTRADA[tipo] ?? 'text',
      extra: sugerencias ? rellenar(plantilla('sugerencias'), { id: `${idDe(campo)}-sugerencias`, opciones: opcionesIniciales(campo) }) : '',
    };
    if (tipo === 'seleccion') return rellenar(plantilla('campo-seleccion'), { ...datos, opciones: opcionesIniciales(campo) });
    if (tipo === 'casillas') return rellenar(plantilla('campo-casillas'), { ...datos, opciones: opcionesIniciales(campo) });
    if (tipo === 'casilla') return rellenar(plantilla('campo-casilla'), datos);
    if (tipo === 'area') return rellenar(plantilla('campo-area'), datos);
    if (tipo === 'registro') return rellenar(plantilla('campo-registro'), { ...datos, clase: datos.clase || 'ancho-completo' });
    return rellenar(plantilla('campo-entrada'), datos);
  }

  contenedor.innerHTML = rellenar(plantilla(incrustado ? 'formulario-incrustado' : 'formulario-panel'), {
    clave, titulo, columnas, antes, despues, textoGuardar, campos: campos.map(htmlCampo).join(''),
  });
  const raiz = contenedor.firstElementChild;
  activarCamposNumericos(raiz);

  const elemento = (claveCampo) => buscar(`#${clave}-${claveCampo}`, raiz);
  const definicion = (claveCampo) => campos.find((campo) => campo.clave === claveCampo);
  const deshabilitado = (claveCampo) => elemento(claveCampo).disabled || elemento(claveCampo).dataset.deshabilitado === 'si';

  // Campos tipo registro: el selector filtrable (cliente, proveedor, factura…) con el elegido a la vista.
  // Además de lo común llevan columnas, registros (función), plural (texto de ayuda) y vacio
  const selectores = new Map(campos.filter((campo) => tipoDe(campo) === 'registro').map((campo) => [campo.clave, montarSelectorRegistro(elemento(campo.clave), {
    plantillas,
    clave: idDe(campo),
    etiqueta: campo.plural ?? 'registros',
    columnas: campo.columnas,
    registros: campo.registros,
    vacio: campo.vacio ?? `Elige ${campo.etiqueta.toLowerCase()}`,
    alElegir: () => avisarCambio(campo),
  })]));

  function escribirCampo(campo, valor) {
    const nodo = elemento(campo.clave);
    const tipo = tipoDe(campo);
    if (tipo === 'registro') selectores.get(campo.clave).elegir(valor, false);
    else if (tipo === 'casilla') nodo.checked = Boolean(valor);
    else if (tipo === 'casillas') {
      const elegidos = new Set((valor ?? []).map(String));
      buscarTodos('input', nodo).forEach((casilla) => { casilla.checked = elegidos.has(casilla.value); });
    } else if (Array.isArray(valor)) nodo.value = valor.join(', ');
    else nodo.value = valor ?? '';
  }

  function leerCampo(campo, exigir = true) {
    const nodo = elemento(campo.clave);
    const tipo = tipoDe(campo);
    if (tipo === 'casilla') return nodo.checked;
    if (tipo === 'casillas') return buscarTodos('input:checked', nodo).map((casilla) => casilla.value);
    const texto = tipo === 'registro' ? String(selectores.get(campo.clave).elegido()?.id ?? '') : nodo.value.trim();
    if (exigir && campo.obligatorio && !texto && !deshabilitado(campo.clave) && !buscar(`[data-campo="${campo.clave}"]`, raiz).hidden) {
      if (tipo === 'registro') selectores.get(campo.clave).enfocar();
      else nodo.focus();
      throw new Error(`${tipo === 'seleccion' || tipo === 'registro' ? 'Elige' : 'Completa'} «${campo.etiqueta}»`);
    }
    if (tipo === 'entero' || tipo === 'entero-negativo') return texto === '' ? 0 : leerEntero(texto);
    if (tipo === 'decimal') return texto === '' ? 0 : Number(texto.replace(',', '.'));
    if (tipo === 'etiquetas') return texto.split(',').map((parte) => parte.trim()).filter(Boolean);
    return texto;
  }

  // Valores escritos, ya convertidos (enteros como número, etiquetas como lista, casillas como booleano)
  const leer = () => Object.fromEntries(campos.map((campo) => [campo.clave, leerCampo(campo)]));

  const escribir = (nuevos) => campos.forEach((campo) => {
    if (campo.clave in nuevos) escribirCampo(campo, nuevos[campo.clave]);
  });

  // Cambia las opciones de un campo de selección, de casillas o de sugerencias (por ejemplo, al cambiar la tienda)
  function opciones(claveCampo, lista) {
    const campo = definicion(claveCampo);
    campo.opciones = lista;
    const nodo = elemento(claveCampo);
    if (tipoDe(campo) === 'lista' || tipoDe(campo) === 'etiquetas') {
      buscar(`#${idDe(campo)}-sugerencias`, raiz).innerHTML = htmlOpciones(campo);
      return;
    }
    const actual = tipoDe(campo) === 'casillas' ? leerCampo(campo, false) : nodo.value;
    nodo.innerHTML = htmlOpciones(campo);
    escribirCampo(campo, actual);
  }

  const avisarCambio = (campo) => campo.alCambiar?.(leerCampo(campo, false), api);

  // registro: el que se edita (null para crear). Cada campo muestra el valor del registro o su valor por defecto.
  function abrir(registro = null, tituloPropio = null) {
    registroAbierto = registro;
    campos.forEach((campo) => {
      if (typeof campo.opciones === 'function') opciones(campo.clave, campo.opciones);
      const propio = registro?.[campo.clave];
      escribirCampo(campo, propio !== undefined && propio !== null ? propio : resolver(campo.valor));
    });
    campos.forEach(avisarCambio);
    const nodoTitulo = buscar('[data-titulo-formulario]', raiz);
    if (nodoTitulo) nodoTitulo.textContent = tituloPropio ?? (registro && tituloEditar ? tituloEditar(registro) : titulo);
    if (incrustado) return;
    raiz.hidden = false;
    raiz.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const primero = campos.find((campo) => tipoDe(campo) !== 'casillas' && !deshabilitado(campo.clave));
    if (primero) api.enfocar(primero.clave);
  }

  function cerrar() {
    registroAbierto = null;
    if (!incrustado) raiz.hidden = true;
  }

  function guardar() {
    let datos;
    try {
      datos = leer();
    } catch (error) {
      alError(error.message);
      return;
    }
    if (alGuardar?.(datos, registroAbierto) === false) return;
    if (incrustado) abrir(resolver(valores) ?? null);
    else cerrar();
  }

  buscar('[data-guardar-formulario]', raiz).onclick = guardar;
  const cancelar = buscar('[data-cancelar-formulario]', raiz);
  if (cancelar) cancelar.onclick = () => { cerrar(); alCancelar?.(); };
  campos.filter((campo) => campo.alCambiar && tipoDe(campo) !== 'registro').forEach((campo) => {
    elemento(campo.clave).addEventListener(CON_CAMBIO.has(tipoDe(campo)) ? 'change' : 'input', () => avisarCambio(campo));
  });

  api = {
    abrir,
    cerrar,
    leer,
    escribir,
    opciones,
    campo: elemento,
    enfocar: (claveCampo) => (selectores.has(claveCampo) ? selectores.get(claveCampo).enfocar() : elemento(claveCampo)?.focus()),
    habilitar: (claveCampo, si) => {
      if (!selectores.has(claveCampo)) return void (elemento(claveCampo).disabled = !si);
      selectores.get(claveCampo).habilitar(si);
      elemento(claveCampo).dataset.deshabilitado = si ? 'no' : 'si';
    },
    mostrar: (claveCampo, si) => { buscar(`[data-campo="${claveCampo}"]`, raiz).hidden = !si; },
    etiquetar: (claveCampo, texto) => { buscar(`[data-campo="${claveCampo}"] label, [data-campo="${claveCampo}"] .etiqueta-campo`, raiz).firstChild.textContent = texto; },
    registro: () => registroAbierto,
    abierto: () => incrustado || !raiz.hidden,
    raiz,
  };
  if (incrustado) abrir(resolver(valores) ?? null);
  return api;
}
