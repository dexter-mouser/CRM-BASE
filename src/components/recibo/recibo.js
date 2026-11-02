// Comprobante imprimible: se muestra en una ventana de vista previa antes de imprimir.
// Sirve para ventas, devoluciones, abonos, pagos a proveedores y facturas de compra (ver comprobantes.js).
// Datos: { titulo, subtitulo, datos: [[etiqueta, valor]], lineas: [{ nombre, detalle, valor }],
//          totales: [{ etiqueta, valor, fuerte }], sello, notas: [texto], firmas: [texto] }
import { buscar, buscarTodos } from '../../core/dom.js';
import { estado } from '../../core/store.js';
import { cargarHtml, rellenar, repetir } from '../../core/template.js';

let plantillas;
let dialogo;
let formato = 'tirilla';
const estiloDePagina = document.createElement('style');

// El tamaño de papel de @page no se puede cambiar con una clase: se escribe al imprimir según el formato elegido
const PAGINAS = {
  tirilla: '@page { size: 80mm auto; margin: 4mm; }',
  carta: '@page { size: A4; margin: 15mm; }',
};

function elegirFormato(nuevo) {
  formato = nuevo;
  dialogo.classList.toggle('recibo-carta', nuevo === 'carta');
  buscarTodos('[data-formato]', dialogo).forEach((boton) => boton.setAttribute('aria-pressed', String(boton.dataset.formato === nuevo)));
}

async function prepararDialogo() {
  if (dialogo) return;
  plantillas = await cargarHtml(new URL('./recibo.html', import.meta.url));
  document.body.insertAdjacentHTML('beforeend', plantillas.querySelector('dialog').outerHTML);
  document.head.append(estiloDePagina);
  dialogo = buscar('#recibo');
  buscar('#cerrar-recibo', dialogo).onclick = () => dialogo.close();
  buscar('#imprimir-recibo', dialogo).onclick = () => window.print();
  buscarTodos('[data-formato]', dialogo).forEach((boton) => (boton.onclick = () => elegirFormato(boton.dataset.formato)));
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) dialogo.close(); // clic en el fondo oscuro
  });
  // Al imprimir con el comprobante abierto, el CSS oculta la aplicación y deja solo el comprobante
  addEventListener('beforeprint', () => {
    if (!dialogo.open) return;
    estiloDePagina.textContent = PAGINAS[formato];
    document.body.classList.add('imprimiendo-recibo');
  });
  addEventListener('afterprint', () => document.body.classList.remove('imprimiendo-recibo'));
}

// Líneas con los datos del negocio que se muestran bajo el nombre; las vacías no se muestran
function datosDeLaTienda() {
  const { tienda, recibo } = estado.ajustes;
  if (!recibo.mostrarDatosTienda) return [];
  const lugar = [tienda.direccion, tienda.ciudad].filter(Boolean).join(', ');
  return [
    tienda.nit && `NIT ${tienda.nit}`,
    lugar,
    tienda.telefono && `Tel. ${tienda.telefono}`,
  ].filter(Boolean);
}

const textos = (lista) => lista.map((texto) => ({ texto }));

export async function mostrarComprobante(comprobante) {
  await prepararDialogo();
  const { tienda } = estado.ajustes;
  buscar('#contenido-recibo', dialogo).innerHTML = rellenar(plantillas.querySelector('#recibo-cuerpo').innerHTML, {
    tienda: tienda.nombre,
    datosTienda: repetir(plantillas, 'recibo-dato-tienda', textos(datosDeLaTienda())),
    pie: comprobante.pie ?? estado.ajustes.recibo.pie,
    titulo: comprobante.titulo,
    subtitulo: comprobante.subtitulo,
    sello: comprobante.sello ? repetir(plantillas, 'recibo-sello', [{ texto: comprobante.sello }]) : '',
    datos: repetir(plantillas, 'recibo-dato', comprobante.datos.map(([etiqueta, valor]) => ({ etiqueta, valor }))),
    lineas: repetir(plantillas, 'recibo-linea', comprobante.lineas ?? []),
    totales: repetir(plantillas, 'recibo-total', comprobante.totales.map((total) => ({ ...total, clase: total.fuerte ? 'recibo-total-fuerte' : 'recibo-total-suave' }))),
    notas: repetir(plantillas, 'recibo-nota', textos(comprobante.notas ?? [])),
    firmas: repetir(plantillas, 'recibo-firma', textos(comprobante.firmas ?? [])),
  });
  elegirFormato(formato);
  dialogo.showModal();
  buscar('#imprimir-recibo', dialogo).focus();
}
