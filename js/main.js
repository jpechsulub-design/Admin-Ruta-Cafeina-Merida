/* Ruta Cafeína Mérida — comportamiento del sitio
   1. Arma el menú con cada <section data-menu="Nombre">.
      Para agregar una sección nueva basta con darle id y data-menu.
   2. Abre y cierra el menú en teléfono.
   3. Botón para copiar el teléfono.
   4. Año actual en el pie.
   5. Pantallas independientes por sección. */
(function () {
  var lista = document.getElementById('menu-lista');
  var secciones = document.querySelectorAll('section[data-menu]');
  if (lista) {
    lista.innerHTML = '';
    secciones.forEach(function (s) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + s.id;
      a.textContent = s.getAttribute('data-menu');
      li.appendChild(a);
      lista.appendChild(li);
    });
  }


  /* Pantallas: cada opción del menú abre una pantalla nueva y oculta las demás.
     Usa el hash de la dirección (#cafe, #origen…), así funcionan los botones de
     "atrás" y "adelante" y se pueden compartir enlaces a una sola pantalla.
     Para agregar una pantalla basta con una <section> dentro de <main>. */
  var pantallas = Array.prototype.slice.call(document.querySelectorAll('main > section'));
  var actual = null;
  function resolverPantalla() {
    var h = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    if (h) {
      for (var i = 0; i < pantallas.length; i++) if (pantallas[i].id === h) return pantallas[i];
      var base = h.split(/[\/?]/)[0];
      for (var j = 0; j < pantallas.length; j++) if (pantallas[j].id === base) return pantallas[j];
      if (base.indexOf('competencia') === 0) for (var k = 0; k < pantallas.length; k++) if (pantallas[k].id === 'competencia') return pantallas[k];
    }
    return pantallas[0] || null;
  }
  function mostrarPantalla(primera) {
    var s = resolverPantalla();
    if (!s || s === actual) return;
    pantallas.forEach(function (p) { p.hidden = p !== s; });
    actual = s;
    if (lista) Array.prototype.forEach.call(lista.querySelectorAll('a'), function (a) {
      if (a.getAttribute('href') === '#' + s.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (!primera) {
      try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, 0); }
      s.setAttribute('tabindex', '-1');
      try { s.focus({ preventScroll: true }); } catch (e) { /* sin foco */ }
    }
  }
  window.addEventListener('hashchange', function () { mostrarPantalla(false); });
  mostrarPantalla(true);

  var boton = document.getElementById('boton-menu');
  var menu = document.getElementById('menu');
  if (boton && menu) {
    boton.addEventListener('click', function () {
      var abierto = menu.classList.toggle('abierto');
      boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
      boton.textContent = abierto ? 'CERRAR' : 'MENÚ';
    });
    menu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A' && menu.classList.contains('abierto')) {
        menu.classList.remove('abierto');
        boton.setAttribute('aria-expanded', 'false');
        boton.textContent = 'MENÚ';
      }
    });
  }

  var copiar = document.getElementById('copiar-telefono');
  if (copiar) {
    copiar.addEventListener('click', function () {
      var tel = '999 259 8155';
      var listo = function () { copiar.textContent = 'Número copiado'; setTimeout(function () { copiar.textContent = 'Copiar número'; }, 2200); };
      try {
        navigator.clipboard.writeText(tel).then(listo, function () { seleccionar(); });
      } catch (e) { seleccionar(); }
      function seleccionar() {
        var t = document.querySelector('.telefono');
        var r = document.createRange(); r.selectNodeContents(t);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      }
    });
  }

  var anio = document.getElementById('anio');
  if (anio) anio.textContent = new Date().getFullYear();
})();
