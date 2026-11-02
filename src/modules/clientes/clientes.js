import { buscar, buscarTodos } from '../../core/dom.js';
import { estado } from '../../core/store.js';
import { aPesos, aFecha, fechaDeHoy } from '../../core/format.js';
import { puede, usuarioActual } from '../../core/autorizacion.js';
import { cargarHtml, seccion, repetir, rellenar } from '../../core/template.js';
import { TIPOS_DOCUMENTO, TIPOS_PERSONA } from '../../core/validacion.js';
import { resumirItems, TIPOS_DOCUMENTO as TIPOS_DE_VENTA, ETIQUETA_NOTA } from '../../services/ventas.service.js';
import * as servicioClientes from '../../services/clientes.service.js';
import { LISTAS_PRECIO, etiquetaDeLista } from '../../services/inventario.service.js';
import * as servicioActividades from '../../services/actividades.service.js';
import { etapaDe, etiquetaDeEtapa } from '../../services/embudo.service.js';
import { cargarPlantillasCuadricula, montarCuadricula } from '../../components/cuadricula-datos/cuadricula-datos.js';
import { refrescarAlertas } from '../../components/header/header.js';
import { cargarPlantillasFormulario, montarFormulario } from '../../components/formulario/formulario.js';

let documento;
let plantillasCuadricula;
let plantillasFormulario;

export async function dibujar() {
  documento = await cargarHtml(new URL('./clientes.html', import.meta.url));
  [plantillasCuadricula, plantillasFormulario] = await Promise.all([cargarPlantillasCuadricula(), cargarPlantillasFormulario()]);
  return seccion(documento, 'principal');
}

// Campos del cliente: lo que tiene un valor habitual se ve escrito al crear y se cambia si hace falta
const CAMPOS_CLIENTE = [
  { clave: 'nombre', etiqueta: 'Nombre o razón social', obligatorio: true },
  { clave: 'tipoPersona', etiqueta: 'Tipo de persona', tipo: 'seleccion', opciones: () => Object.entries(TIPOS_PERSONA), valor: 'natural' },
  { clave: 'tipoDocumento', etiqueta: 'Tipo de documento', tipo: 'seleccion', opciones: () => [['', 'Sin documento'], ...Object.entries(TIPOS_DOCUMENTO)], valor: 'CC' },
  { clave: 'documento', etiqueta: 'Número de documento', ejemplo: 'Sin puntos' },
  { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono' },
  { clave: 'correo', etiqueta: 'Correo', tipo: 'correo' },
  { clave: 'direccion', etiqueta: 'Dirección', ancho: 2 },
  {
    clave: 'etiquetas', etiqueta: 'Etiquetas', tipo: 'etiquetas', ayuda: 'Separadas por coma',
    opciones: () => [...new Set(estado.clientes.flatMap((cliente) => cliente.etiquetas ?? []))].sort(),
  },
  { clave: 'limiteCredito', etiqueta: 'Cupo de crédito (COP)', tipo: 'entero', valor: 0, ayuda: '0 = sin crédito' },
  { clave: 'plazoDias', etiqueta: 'Plazo de pago (días)', tipo: 'entero', valor: 30, obligatorio: true },
  {
    clave: 'listaPrecio', etiqueta: 'Lista de precio', tipo: 'seleccion', valor: '',
    opciones: () => [['', 'La de la sucursal donde compra'], ...LISTAS_PRECIO.map((lista) => [lista.id, lista.etiqueta])],
  },
  { clave: 'autorizaDatos', etiqueta: 'El cliente autoriza el tratamiento de sus datos personales (Ley 1581 de 2012)', tipo: 'casilla', ancho: 'completo' },
];

export function montar(raiz, contexto) {
  let clientePorEliminar = null;
  let clienteEnFicha = null;
  const etiquetasHtml = (lista = []) => repetir(documento, 'etiqueta-cliente', lista.map((texto) => ({ texto })));

  const ejecutar = (accion, mensaje) => {
    try {
      accion();
      contexto.aviso(mensaje);
      return true;
    } catch (error) {
      contexto.alerta(error.message);
      return false;
    }
  };

  const filasClientes = () => estado.clientes.map((cliente) => {
    const deuda = servicioClientes.deudaDeCliente(cliente);
    return {
      ...cliente,
      documentoTexto: cliente.documento ? `${cliente.tipoDocumento} ${cliente.documento}` : '',
      etiquetasTexto: (cliente.etiquetas ?? []).join(', '),
      deudaTexto: aPesos(deuda),
      deudaHtml: deuda > 0 ? rellenar(documento.querySelector('#deuda-con-saldo').innerHTML, { valor: aPesos(deuda) }) : aPesos(0),
      cupoTexto: cliente.limiteCredito ? aPesos(servicioClientes.cupoDisponible(cliente)) : 'Sin crédito',
    };
  });

  const cuadriculaClientes = montarCuadricula(buscar('#cuadricula-clientes', raiz), {
    plantillas: plantillasCuadricula,
    titulo: 'Clientes',
    vacio: 'Aún no hay clientes. Crea uno con "Nuevo cliente".',
    columnas: [
      { clave: 'id', titulo: 'Código', ancho: '76px' },
      { clave: 'nombre', titulo: 'Nombre', ancho: 'minmax(0, 1.3fr)' },
      { clave: 'documentoTexto', titulo: 'Documento', ancho: '150px' },
      { clave: 'telefono', titulo: 'Teléfono', ancho: '120px' },
      { clave: 'etiquetasTexto', titulo: 'Etiquetas', ancho: 'minmax(0, 1fr)', html: (fila) => etiquetasHtml(fila.etiquetas) },
      { clave: 'deudaTexto', titulo: 'Deuda', ancho: '104px', alinear: 'derecha', html: (fila) => fila.deudaHtml },
      { clave: 'cupoTexto', titulo: 'Cupo disponible', ancho: '120px', alinear: 'derecha' },
      { clave: 'acciones', titulo: 'Acciones', ancho: '260px', filtrable: false, html: (fila) => repetir(documento, 'acciones-cliente', [{ id: fila.id }]) },
    ],
    filas: filasClientes(),
  });
  const pintarLista = () => cuadriculaClientes.actualizar(filasClientes());

  // --- Formulario ------------------------------------------------------------------------------------------
  const formulario = montarFormulario(buscar('#formulario-cliente', raiz), {
    plantillas: plantillasFormulario,
    clave: 'cliente',
    titulo: 'Nuevo cliente',
    tituloEditar: (cliente) => `Editar a ${cliente.nombre}`,
    campos: CAMPOS_CLIENTE,
    textoGuardar: 'Guardar cliente',
    alError: contexto.alerta,
    alGuardar: (datos, cliente) => {
      const aplicado = ejecutar(
        () => (cliente ? servicioClientes.actualizarCliente(cliente.id, datos) : servicioClientes.agregarCliente(datos)),
        cliente ? 'Cliente actualizado correctamente' : 'Cliente agregado correctamente',
      );
      if (!aplicado) return false;
      pintarLista();
      if (clienteEnFicha) abrirFicha(clienteEnFicha);
      return true;
    },
  });
  const abrirFormulario = (cliente) => formulario.abrir(cliente);

  buscar('#nuevo-cliente', raiz).onclick = () => abrirFormulario(null);

  // --- Ficha completa del cliente --------------------------------------------------------------------------
  const cuadricula = (selector, opcionesCuadricula) => montarCuadricula(buscar(selector, raiz), { plantillas: plantillasCuadricula, ...opcionesCuadricula });

  const elegirSeccion = (nombre) => {
    buscarTodos('[data-seccion]', raiz).forEach((boton) => boton.setAttribute('aria-pressed', String(boton.dataset.seccion === nombre)));
    buscarTodos('[data-panel]', raiz).forEach((panel) => { panel.hidden = panel.dataset.panel !== nombre; });
  };
  buscarTodos('[data-seccion]', raiz).forEach((boton) => { boton.onclick = () => elegirSeccion(boton.dataset.seccion); });

  function pintarActividades(cliente) {
    cuadricula('#cuadricula-actividades', {
      titulo: 'Actividades y tareas',
      vacio: 'Aún no hay actividades con este cliente.',
      columnas: [
        { clave: 'fecha', titulo: 'Fecha', ancho: '130px' },
        { clave: 'tipo', titulo: 'Tipo', ancho: '96px' },
        { clave: 'descripcion', titulo: 'Descripción', ancho: 'minmax(0, 2fr)' },
        { clave: 'responsable', titulo: 'Responsable', ancho: '130px' },
        { clave: 'estado', titulo: 'Estado', ancho: '150px' },
        { clave: 'acciones', titulo: '', ancho: '130px', filtrable: false, html: (fila) => fila.acciones },
      ],
      filas: servicioActividades.actividadesDeCliente(cliente.id).slice().reverse().map((actividad) => ({
        fecha: aFecha(actividad.fecha),
        tipo: servicioActividades.TIPOS_ACTIVIDAD[actividad.tipo],
        descripcion: actividad.descripcion + (actividad.resultado ? ` · ${actividad.resultado}` : ''),
        responsable: actividad.responsable,
        estado: servicioActividades.esPendiente(actividad)
          ? `${servicioActividades.estaVencidaTarea(actividad) ? 'Vencida' : 'Pendiente'} · ${aFecha(actividad.vence.slice(0, 10))}`
          : (actividad.tipo === 'tarea' ? 'Hecha' : 'Registrada'),
        acciones: servicioActividades.esPendiente(actividad) && puede('seguimiento', 'editar') ? repetir(documento, 'accion-tarea', [{ id: actividad.id }]) : '',
      })),
    });
  }

  function abrirFicha(id) {
    const cliente = servicioClientes.buscarCliente(id);
    if (!cliente) return;
    clienteEnFicha = id;
    const ventas = servicioClientes.ventasDeCliente(cliente);
    const comprado = ventas.reduce((suma, venta) => suma + venta.total, 0);
    const deuda = servicioClientes.deudaDeCliente(cliente);
    const ultima = ventas.reduce((mayor, venta) => (venta.fecha > mayor ? venta.fecha : mayor), '');
    const pendientes = servicioClientes.facturasPendientes(cliente);
    const vencido = pendientes.filter((factura) => factura.diasVencida > 0).reduce((suma, factura) => suma + factura.saldo, 0);

    buscar('#titulo-ficha', raiz).textContent = `${cliente.nombre} · ${cliente.id}`;
    buscar('#subtitulo-ficha', raiz).textContent = [
      TIPOS_PERSONA[cliente.tipoPersona],
      cliente.documento ? `${cliente.tipoDocumento} ${cliente.documento}` : 'Sin documento',
      cliente.telefono, cliente.correo, cliente.direccion,
      cliente.listaPrecio ? etiquetaDeLista(cliente.listaPrecio) : '',
      cliente.autorizaDatos ? 'Autoriza tratamiento de datos' : 'Sin autorización de datos',
    ].filter(Boolean).join(' · ');
    buscar('#etiquetas-ficha', raiz).innerHTML = etiquetasHtml(cliente.etiquetas);
    buscar('#indicadores-ficha', raiz).innerHTML = repetir(documento, 'indicador', [
      { etiqueta: 'Total comprado', valor: aPesos(comprado), clase: '' },
      { etiqueta: 'Última compra', valor: ultima ? aFecha(ultima.slice(0, 10)) : '—', clase: '' },
      { etiqueta: 'Deuda', valor: aPesos(deuda), clase: deuda > 0 ? 'texto-negativo' : '' },
      { etiqueta: 'Vencido', valor: aPesos(vencido), clase: vencido > 0 ? 'texto-negativo' : '' },
      { etiqueta: `Cupo disponible (plazo ${cliente.plazoDias ?? 30} días)`, valor: cliente.limiteCredito ? aPesos(servicioClientes.cupoDisponible(cliente)) : 'Sin crédito', clase: '' },
    ]);

    buscar('#editar-ficha', raiz).hidden = !puede('clientes', 'editar');
    buscar('#nueva-actividad', raiz).hidden = !puede('seguimiento', 'crear');
    pintarActividades(cliente);

    cuadricula('#cuadricula-compras', {
      titulo: 'Facturas de venta', vacio: 'Este cliente aún no tiene facturas.',
      columnas: [
        { clave: 'id', titulo: 'N°', ancho: '76px' }, { clave: 'fecha', titulo: 'Fecha', ancho: '130px' },
        { clave: 'productos', titulo: 'Productos', ancho: 'minmax(0, 2fr)' }, { clave: 'metodo', titulo: 'Pago', ancho: '104px' },
        { clave: 'total', titulo: 'Total', ancho: '112px', alinear: 'derecha' },
      ],
      filas: ventas.slice().reverse().map((venta) => ({ id: venta.id, fecha: aFecha(venta.fecha), productos: resumirItems(venta), metodo: venta.metodo, total: aPesos(venta.total) })),
    });
    cuadricula('#cuadricula-cartera', {
      titulo: 'Facturas a crédito con saldo', vacio: 'No tiene facturas pendientes.',
      columnas: [
        { clave: 'id', titulo: 'N°', ancho: '76px' }, { clave: 'fecha', titulo: 'Fecha', ancho: '130px' }, { clave: 'vence', titulo: 'Vence', ancho: '120px' },
        { clave: 'estado', titulo: 'Estado', ancho: 'minmax(0, 1fr)' }, { clave: 'total', titulo: 'Total', ancho: '112px', alinear: 'derecha' },
        { clave: 'saldo', titulo: 'Saldo', ancho: '112px', alinear: 'derecha' },
      ],
      filas: pendientes.map((factura) => ({
        id: factura.id, fecha: aFecha(factura.fecha), vence: aFecha(factura.vence.slice(0, 10)),
        estado: factura.diasVencida > 0 ? `Vencida hace ${factura.diasVencida} día(s)` : `Vence en ${-factura.diasVencida} día(s)`,
        total: aPesos(factura.total), saldo: aPesos(factura.saldo),
      })),
    });
    cuadricula('#cuadricula-documentos-cliente', {
      titulo: 'Cotizaciones y remisiones', vacio: 'No tiene cotizaciones ni remisiones.',
      columnas: [
        { clave: 'id', titulo: 'N°', ancho: '76px' }, { clave: 'tipo', titulo: 'Documento', ancho: '110px' }, { clave: 'fecha', titulo: 'Fecha', ancho: '130px' },
        { clave: 'productos', titulo: 'Productos', ancho: 'minmax(0, 2fr)' }, { clave: 'estado', titulo: 'Estado', ancho: '150px' },
        { clave: 'total', titulo: 'Total', ancho: '112px', alinear: 'derecha' },
      ],
      filas: estado.documentos.filter((registro) => registro.clienteId === cliente.id).reverse().map((registro) => ({
        id: registro.id, tipo: TIPOS_DE_VENTA[registro.tipo].etiqueta, fecha: aFecha(registro.fecha), productos: resumirItems(registro),
        estado: registro.tipo === 'cotizacion' ? etiquetaDeEtapa(etapaDe(registro)) : (registro.anulado ? 'Anulada' : (registro.convertidoEn ? `Pasada a ${registro.convertidoEn}` : 'Pendiente')),
        total: aPesos(registro.total),
      })),
    });
    cuadricula('#cuadricula-abonos', {
      titulo: 'Abonos', vacio: 'No tiene abonos.',
      columnas: [
        { clave: 'id', titulo: 'N°', ancho: '90px' }, { clave: 'fecha', titulo: 'Fecha', ancho: '130px' },
        { clave: 'metodo', titulo: 'Medio de pago', ancho: 'minmax(0, 1fr)' }, { clave: 'valor', titulo: 'Valor', ancho: '112px', alinear: 'derecha' },
      ],
      filas: estado.pagos.filter((pago) => pago.tipo === 'abono' && pago.terceroId === cliente.id).reverse()
        .map((pago) => ({ id: pago.id, fecha: aFecha(pago.fecha), metodo: pago.metodo, valor: aPesos(pago.valor) })),
    });
    cuadricula('#cuadricula-devoluciones-cliente', {
      titulo: 'Devoluciones y anulaciones', vacio: 'No tiene devoluciones.',
      columnas: [
        { clave: 'id', titulo: 'N°', ancho: '76px' }, { clave: 'fecha', titulo: 'Fecha', ancho: '130px' }, { clave: 'tipo', titulo: 'Tipo', ancho: '150px' },
        { clave: 'ventaId', titulo: 'Factura', ancho: '84px' }, { clave: 'motivo', titulo: 'Motivo', ancho: 'minmax(0, 1fr)' },
        { clave: 'total', titulo: 'Total', ancho: '112px', alinear: 'derecha' },
      ],
      filas: estado.devoluciones.filter((nota) => nota.clienteId === cliente.id).reverse()
        .map((nota) => ({ id: nota.id, fecha: aFecha(nota.fecha), tipo: ETIQUETA_NOTA[nota.tipo], ventaId: nota.ventaId, motivo: nota.motivo, total: aPesos(nota.total) })),
    });

    const ficha = buscar('#ficha', raiz);
    ficha.hidden = false;
    ficha.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  buscar('#editar-ficha', raiz).onclick = () => {
    const cliente = servicioClientes.buscarCliente(clienteEnFicha);
    if (cliente) abrirFormulario(cliente);
  };
  buscar('#cerrar-ficha', raiz).onclick = () => {
    buscar('#ficha', raiz).hidden = true;
    clienteEnFicha = null;
  };

  // Registrar actividad o tarea desde la ficha: la fecha solo aplica a las tareas
  montarFormulario(buscar('#nueva-actividad', raiz), {
    plantillas: plantillasFormulario,
    clave: 'actividad',
    incrustado: true,
    textoGuardar: 'Registrar',
    alError: contexto.alerta,
    campos: [
      {
        clave: 'tipo', etiqueta: 'Tipo', tipo: 'seleccion', valor: 'llamada', opciones: () => Object.entries(servicioActividades.TIPOS_ACTIVIDAD),
        alCambiar: (tipo, actividad) => actividad.habilitar('vence', tipo === 'tarea'),
      },
      { clave: 'vence', etiqueta: 'Fecha de la tarea', tipo: 'fecha', valor: fechaDeHoy, obligatorio: true },
      {
        clave: 'responsableCorreo', etiqueta: 'Responsable', tipo: 'seleccion', valor: () => usuarioActual()?.correo ?? '',
        opciones: () => estado.usuarios.filter((usuario) => usuario.activo).map((usuario) => [usuario.correo, usuario.nombre]),
      },
      { clave: 'descripcion', etiqueta: 'Descripción', ancho: 'completo', maximo: 300, obligatorio: true, ejemplo: 'Qué se habló o qué hay que hacer' },
    ],
    alGuardar: (datos) => {
      const aplicado = ejecutar(() => servicioActividades.registrarActividad({ ...datos, clienteId: clienteEnFicha }),
        datos.tipo === 'tarea' ? 'Tarea creada correctamente' : 'Actividad registrada correctamente');
      if (!aplicado) return false;
      pintarActividades(servicioClientes.buscarCliente(clienteEnFicha));
      refrescarAlertas();
      return true;
    },
  });
  buscar('#cuadricula-actividades', raiz).addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-completar]');
    if (!boton) return;
    if (ejecutar(() => servicioActividades.completarTarea(boton.dataset.completar), 'Tarea marcada como hecha correctamente')) {
      pintarActividades(servicioClientes.buscarCliente(clienteEnFicha));
      refrescarAlertas();
    }
  });

  // --- Acciones de cada fila -------------------------------------------------------------------------------
  buscar('#cuadricula-clientes', raiz).addEventListener('click', (evento) => {
    const boton = evento.target.closest('button');
    if (!boton) return;
    const id = boton.dataset.editar ?? boton.dataset.eliminar ?? boton.dataset.ficha;
    const cliente = servicioClientes.buscarCliente(id);
    if (!cliente) return;
    if (boton.dataset.editar) abrirFormulario(cliente);
    else if (boton.dataset.eliminar) {
      clientePorEliminar = cliente.id;
      buscar('#texto-eliminar-cliente', raiz).textContent = `¿Eliminar a ${cliente.nombre}?`;
      buscar('#confirmar-eliminar-cliente', raiz).hidden = false;
      buscar('#eliminar-cliente-no', raiz).focus();
    } else {
      elegirSeccion('actividades');
      abrirFicha(cliente.id);
    }
  });

  buscar('#eliminar-cliente-no', raiz).onclick = () => { buscar('#confirmar-eliminar-cliente', raiz).hidden = true; };
  buscar('#eliminar-cliente-si', raiz).onclick = () => {
    ejecutar(() => servicioClientes.eliminarCliente(clientePorEliminar), 'Cliente eliminado correctamente');
    buscar('#confirmar-eliminar-cliente', raiz).hidden = true;
    pintarLista();
  };

  pintarLista();
  // Abre la ficha si llega desde otra pantalla: clientes.html?ficha=C-003
  const pedido = new URLSearchParams(location.search).get('ficha');
  if (pedido) abrirFicha(pedido);
  // Acceso "Nuevo cliente" del panel: clientes.html?nuevo=1
  else if (new URLSearchParams(location.search).get('nuevo') === '1' && puede('clientes', 'crear')) abrirFormulario(null);
}
