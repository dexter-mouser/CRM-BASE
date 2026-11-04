// Script clásico que corre antes de dibujar la página: aplica el tema guardado y,
// en las páginas protegidas (<html data-protegida>), redirige al ingreso si no hay sesión vigente.
(function () {
  var raiz = document.documentElement;
  try {
    var tema = localStorage.getItem('generico.tema');
    if (tema !== 'claro' && tema !== 'oscuro') tema = matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
    raiz.dataset.tema = tema;
  } catch (error) {
    console.error('No se pudo leer el tema guardado', error);
  }

  // Color de marca de Ajustes antes de pintar (el mismo cálculo de aplicarMarca en tema.js)
  try {
    // Sin datos guardados (app recién instalada) se usa el color del diseño
    var guardado = localStorage.getItem('generico.tienda');
    var acento = guardado ? JSON.parse(guardado).ajustes.marca.acento : '';
    if (/^#[0-9a-f]{6}$/.test(acento) && acento !== '#4553c9') {
      var canales = [1, 3, 5].map(function (inicio) {
        var canal = parseInt(acento.slice(inicio, inicio + 2), 16) / 255;
        return canal <= 0.03928 ? canal / 12.92 : Math.pow((canal + 0.055) / 1.055, 2.4);
      });
      var luz = 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2];
      raiz.style.setProperty('--marca-claro', acento);
      raiz.style.setProperty('--marca-texto-claro', luz > 0.4 ? '#12142b' : '#ffffff');
      raiz.style.setProperty('--marca-suave-claro', 'color-mix(in srgb, ' + acento + ' 12%, #ffffff)');
      raiz.style.setProperty('--marca-oscuro', 'color-mix(in srgb, ' + acento + ' 55%, #ffffff)');
      raiz.style.setProperty('--marca-texto-oscuro', '#12142b');
      raiz.style.setProperty('--marca-suave-oscuro', 'color-mix(in srgb, ' + acento + ' 28%, #161615)');
    }
  } catch (error) {
    console.error('No se pudo leer el color de la marca', error);
  }

  if (!('protegida' in raiz.dataset)) return;

  function vigente(almacen) {
    try {
      var datos = JSON.parse(window[almacen].getItem('generico.sesion'));
      return !!datos && datos.expira > Date.now();
    } catch (error) {
      console.error('No se pudo leer la sesión guardada', error);
      return false;
    }
  }

  if (!vigente('sessionStorage') && !vigente('localStorage')) {
    raiz.hidden = true;
    // Las páginas protegidas viven en paginas/; el ingreso está en la raíz
    location.replace('../index.html?siguiente=' + encodeURIComponent(location.pathname.split('/').pop() || 'panel.html'));
  }
})();
