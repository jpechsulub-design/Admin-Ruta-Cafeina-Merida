/* Ruta Cafeína Mérida — inventario de café (módulo común para las dos webs privadas).
   No sabe dónde se guardan los datos: recibe un "almacén" con esta forma
     { suscribir(alCambiar, alFallar), guardar(reg) -> Promise, borrar(id) -> Promise,
       descargar(nombre, texto, tipo) -> Promise, respaldo: true|false }
   Uso:  RC_inventario.montar(elementoRaiz, almacen)
   Reutiliza las clases visuales de prospectos.css (pros-*). */
(function () {
  'use strict';

  var PRESENTACIONES = ['Grano', 'Molido'];
  var TIPOS_CAFE = ['Bourbon y Caturra', 'Otro'];
  var MAX_BLOQUE = 150;
  var COLUMNAS = [
    { k: 'nombre', t: 'Nombre del producto' },
    { k: 'presentacion', t: 'Presentación' },
    { k: 'tipoCafe', t: 'Tipo de café' },
    { k: 'peso', t: 'Peso', num: 'peso' },
    { k: 'cantInicial', t: 'Cantidad inicial', num: 'n' },
    { k: 'costoInicial', t: 'Costo unitario inicial', num: 'm' },
    { k: 'cantCompra', t: 'Cantidad compra', num: 'n' },
    { k: 'costoCompra', t: 'Costo unitario compra', num: 'm' },
    { k: 'precioParticular', t: 'Precio particular', num: 'm' },
    { k: 'precioCafeteria', t: 'Precio cafetería', num: 'm' },
    { k: 'precioNegocio', t: 'Precio negocio', num: 'm' }
  ];
  var CAMPOS_NUM = ['peso', 'cantInicial', 'costoInicial', 'cantCompra', 'costoCompra', 'precioParticular', 'precioCafeteria', 'precioNegocio'];
  var collator = (window.Intl && Intl.Collator) ? new Intl.Collator('es', { numeric: true, sensitivity: 'base' }) : null;
  var fNum = (window.Intl && Intl.NumberFormat) ? new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
  var fMon = (window.Intl && Intl.NumberFormat) ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function norm(t) {
    t = String(t == null ? '' : t).toLowerCase();
    try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* sin normalize */ }
    return t;
  }
  function dos(v) { var n = Number(String(v == null ? '' : v).replace(/,/g, '')); if (!isFinite(n) || n < 0) n = 0; return Math.round(n * 100) / 100; }
  function txtNum(n) { return fNum ? fNum.format(n) : n.toFixed(2); }
  function txtMon(n) { return fMon ? fMon.format(n) : '$' + n.toFixed(2); }
  function idNuevo() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function csvCelda(v) { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

  function limpiar(r) {
    var o = {
      id: r.id, orden: Number(r.orden) || 0,
      nombre: String(r.nombre || '').trim(),
      presentacion: PRESENTACIONES.indexOf(r.presentacion) >= 0 ? r.presentacion : 'Grano',
      tipoCafe: TIPOS_CAFE.indexOf(r.tipoCafe) >= 0 ? r.tipoCafe : 'Bourbon y Caturra',
      modificado: r.modificado || ''
    };
    CAMPOS_NUM.forEach(function (k) { o[k] = dos(r[k]); });
    return o;
  }
  function textoBusqueda(r) {
    return norm([r.nombre, r.presentacion, r.tipoCafe, r.peso, 'g'].join(' | '));
  }
  function valor(r, c) {
    if (c.num === 'peso') return txtNum(r.peso).replace(/\.00$/, '') + ' g';
    if (c.num === 'n') return txtNum(r[c.k]);
    if (c.num === 'm') return txtMon(r[c.k]);
    return r[c.k];
  }

  function montar(raiz, almacen) {
    var regs = [], listo = false, sel = null, q = '', fPres = '', fTipo = '';
    var orden = { k: 'orden', dir: 1 };
    var tokens = [], temporizador = null, avisoTimer = null;
    var modal = null, menuCtx = null, anterior = null;
    var inicio = 0, pila = [], mostrados = 0, altoPrevio = 0, totalLista = 0;

    raiz.innerHTML = '';
    var panel = el('div', 'pros-panel');
    var barra = el('div', 'pros-barra');
    var cuerpo = el('div', 'pros-scroll');
    cuerpo.tabIndex = 0; cuerpo.setAttribute('role', 'region'); cuerpo.setAttribute('aria-label', 'Tabla de inventario');
    var pager = el('div', 'pros-pager'); pager.setAttribute('role', 'navigation'); pager.setAttribute('aria-label', 'Bloques de registros');
    var pie = el('p', 'pros-pie');
    panel.appendChild(barra); panel.appendChild(cuerpo); panel.appendChild(pager);
    raiz.appendChild(panel); raiz.appendChild(pie);

    /* ----- Barra ----- */
    function boton(txt, cls, fn) { var b = el('button', 'pros-btn ' + (cls || ''), txt); b.type = 'button'; b.addEventListener('click', fn); return b; }
    var menu = el('div', 'pros-menu'); menu.setAttribute('role', 'toolbar'); menu.setAttribute('aria-label', 'Acciones sobre el inventario');
    var bAgregar = boton('+ Agregar', 'oro', function () { abrirForm(null); });
    var bEditar = boton('Editar', '', function () { if (sel) abrirForm(sel); });
    var bBorrar = boton('Borrar', 'peligro', function () { if (sel) abrirBorrar(sel); });
    menu.appendChild(bAgregar); menu.appendChild(bEditar); menu.appendChild(bBorrar);

    var buscarWrap = el('label', 'pros-buscar');
    buscarWrap.appendChild(el('span', 'pros-solo-lector', 'Buscar producto'));
    var inBuscar = el('input'); inBuscar.type = 'search'; inBuscar.placeholder = 'Buscar producto…'; inBuscar.autocomplete = 'off';
    inBuscar.setAttribute('aria-label', 'Buscar producto');
    buscarWrap.appendChild(inBuscar);

    function selectFiltro(etiqueta, opciones, fn) {
      var w = el('label', 'pros-filtro'); w.appendChild(el('span', null, etiqueta));
      var s = el('select'); var o0 = el('option', null, 'Todos'); o0.value = ''; s.appendChild(o0);
      opciones.forEach(function (o) { var x = el('option', null, o); x.value = o; s.appendChild(x); });
      s.addEventListener('change', function () { fn(s.value); reiniciar(); });
      w.appendChild(s); return { w: w, s: s };
    }
    var fP = selectFiltro('Presentación', PRESENTACIONES, function (v) { fPres = v; });
    var fT = selectFiltro('Tipo de café', TIPOS_CAFE, function (v) { fTipo = v; });
    var extras = el('div', 'pros-extras');
    extras.appendChild(boton('Exportar a Excel (CSV)', 'suave', exportarCsv));
    var archivo = null;
    if (almacen.respaldo) {
      extras.appendChild(boton('Respaldo', 'suave', exportarJson));
      extras.appendChild(boton('Restaurar', 'suave', function () { archivo.click(); }));
      archivo = el('input'); archivo.type = 'file'; archivo.accept = '.json,application/json'; archivo.hidden = true;
      archivo.addEventListener('change', restaurar); extras.appendChild(archivo);
    }
    var fila1 = el('div', 'pros-fila'); fila1.appendChild(menu); fila1.appendChild(buscarWrap);
    var fila2 = el('div', 'pros-fila pros-fila2'); fila2.appendChild(fP.w); fila2.appendChild(fT.w);
    var cuenta = el('p', 'pros-cuenta'); cuenta.setAttribute('aria-live', 'polite');
    fila2.appendChild(cuenta); fila2.appendChild(extras);
    var estado = el('p', 'pros-estado'); estado.setAttribute('role', 'status');
    barra.appendChild(fila1); barra.appendChild(fila2); barra.appendChild(estado);

    var bPrim = boton('« Primero', 'suave', function () { inicio = 0; pila = []; pintarFilas(); cuerpo.scrollTop = 0; });
    var bAnt = boton('‹ Anterior', '', function () { if (pila.length) { inicio = pila.pop(); pintarFilas(); cuerpo.scrollTop = 0; } });
    var rango = el('p', 'pros-rango'); rango.setAttribute('aria-live', 'polite');
    var bSig = boton('Siguiente ›', 'oro', function () { if (mostrados && inicio + mostrados < totalLista) { pila.push(inicio); inicio += mostrados; pintarFilas(); cuerpo.scrollTop = 0; } });
    pager.appendChild(bPrim); pager.appendChild(bAnt); pager.appendChild(rango); pager.appendChild(bSig);

    inBuscar.addEventListener('input', function () {
      clearTimeout(temporizador);
      temporizador = setTimeout(function () { q = inBuscar.value; tokens = norm(q).split(/\s+/).filter(Boolean); reiniciar(); }, 120);
    });
    inBuscar.addEventListener('keydown', function (e) { if (e.key === 'Escape' && inBuscar.value) { inBuscar.value = ''; q = ''; tokens = []; reiniciar(); } });
    function avisar(txt, malo) {
      estado.textContent = txt; estado.className = 'pros-estado' + (malo ? ' mal' : '');
      clearTimeout(avisoTimer);
      if (txt && !malo) avisoTimer = setTimeout(function () { estado.textContent = ''; }, 3500);
    }

    /* ----- Tabla ----- */
    var tabla = el('table', 'pros-tabla inv-tabla');
    var thead = el('thead'), trh = el('tr');
    COLUMNAS.forEach(function (c, i) {
      var th = el('th'); th.scope = 'col';
      if (i === 0) th.className = 'fija';
      if (c.num) th.classList.add('num');
      var b = el('button', 'pros-th', c.t); b.type = 'button';
      b.addEventListener('click', function () {
        if (orden.k === c.k) orden.dir = -orden.dir; else { orden.k = c.k; orden.dir = 1; }
        reiniciar();
      });
      th.appendChild(b); th.dataset.k = c.k; trh.appendChild(th);
    });
    thead.appendChild(trh); tabla.appendChild(thead);
    var tbody = el('tbody'); tabla.appendChild(tbody);
    cuerpo.appendChild(tabla);
    var vacio = el('p', 'pros-vacio'); vacio.hidden = true; cuerpo.appendChild(vacio);

    function comparar(a, b) {
      var x = a[orden.k], y = b[orden.k], c;
      if (typeof x === 'number' && typeof y === 'number') c = x - y;
      else c = collator ? collator.compare(String(x), String(y)) : String(x).localeCompare(String(y));
      if (c === 0) c = a.orden - b.orden;
      return c * orden.dir;
    }
    function visibles() {
      return regs.filter(function (r) {
        if (fPres && r.presentacion !== fPres) return false;
        if (fTipo && r.tipoCafe !== fTipo) return false;
        for (var i = 0; i < tokens.length; i++) if (r._b.indexOf(tokens[i]) < 0) return false;
        return true;
      }).sort(comparar);
    }
    function filaDe(r) {
      var tr = el('tr'); tr.dataset.id = r.id; tr.tabIndex = 0;
      if (r.id === sel) { tr.className = 'sel'; tr.setAttribute('aria-selected', 'true'); }
      COLUMNAS.forEach(function (c, i) {
        var td = el('td', i === 0 ? 'fija neg' : (c.num ? 'num' : null));
        var v = valor(r, c);
        if (i === 0 || !c.num) { var d = el('div', 'cl', v); d.title = v; td.appendChild(d); } else td.textContent = v;
        tr.appendChild(td);
      });
      return tr;
    }
    function dibujar(lista, desde) {
      tbody.innerHTML = '';
      var tope = Math.min(lista.length, desde + MAX_BLOQUE);
      for (var i = desde; i < tope; i++) tbody.appendChild(filaDe(lista[i]));
      var k = tbody.children.length;
      if (!k) return 0;
      var base = cuerpo.getBoundingClientRect().top, alto = cuerpo.clientHeight, cabe = 0;
      for (var j = 0; j < k; j++) {
        if (tbody.children[j].getBoundingClientRect().bottom - base <= alto + 0.5) cabe = j + 1; else break;
      }
      if (cabe < 1) cabe = 1;
      while (tbody.children.length > cabe) tbody.removeChild(tbody.lastChild);
      return cabe;
    }
    function reiniciar() { inicio = 0; pila = []; pintarFilas(); cuerpo.scrollTop = 0; }
    function irA(id) {
      var lista = visibles(), idx = -1;
      for (var i = 0; i < lista.length; i++) if (lista[i].id === id) { idx = i; break; }
      if (idx < 0 || (idx >= inicio && idx < inicio + mostrados)) return;
      inicio = 0; pila = [];
      for (var g = 0; g < 400; g++) {
        var n = dibujar(lista, inicio);
        if (!n || idx < inicio + n) break;
        pila.push(inicio); inicio += n;
      }
    }
    function pintarFilas() {
      ths();
      var lista = visibles();
      totalLista = lista.length;
      while (inicio >= lista.length && inicio > 0) { inicio = pila.length ? pila.pop() : 0; }
      mostrados = dibujar(lista, inicio);
      altoPrevio = cuerpo.clientHeight;
      var total = regs.length;
      cuenta.textContent = listo ? (lista.length === total ? total + (total === 1 ? ' producto' : ' productos') : lista.length + ' de ' + total + ' coinciden con los filtros') : '';
      rango.textContent = (listo && mostrados) ? 'Registros ' + (inicio + 1) + ' a ' + (inicio + mostrados) + ' de ' + lista.length : (listo ? 'Sin registros para mostrar' : '');
      bPrim.disabled = !(inicio > 0); bAnt.disabled = !pila.length;
      bSig.disabled = !(mostrados && inicio + mostrados < lista.length);
      vacio.hidden = !listo || lista.length > 0;
      vacio.textContent = total ? 'Ningún producto coincide con la búsqueda o los filtros.' : 'Todavía no hay productos. Usa «+ Agregar» para registrar el primero.';
      resumen(); botones();
    }
    function ths() {
      Array.prototype.forEach.call(trh.children, function (th) {
        var b = th.querySelector('button'); if (!b) return;
        var activo = th.dataset.k === orden.k;
        th.setAttribute('aria-sort', activo ? (orden.dir === 1 ? 'ascending' : 'descending') : 'none');
        th.classList.toggle('activo', activo);
        b.dataset.flecha = activo ? (orden.dir === 1 ? '▲' : '▼') : '';
      });
    }
    function resumen() {
      var existencia = 0, valorInv = 0;
      regs.forEach(function (r) {
        existencia += r.cantInicial + r.cantCompra;
        valorInv += r.cantInicial * r.costoInicial + r.cantCompra * r.costoCompra;
      });
      pie.textContent = 'Existencia total: ' + txtNum(existencia) + ' unidades  ·  Valor del inventario a costo: ' + txtMon(valorInv);
    }
    function botones() {
      var hay = !!(sel && buscar(sel));
      bEditar.disabled = !hay; bBorrar.disabled = !hay;
      bEditar.title = hay ? '' : 'Primero selecciona un producto de la lista'; bBorrar.title = bEditar.title;
    }
    function buscar(id) { for (var i = 0; i < regs.length; i++) if (regs[i].id === id) return regs[i]; return null; }
    function seleccionar(id) {
      sel = id;
      Array.prototype.forEach.call(tbody.children, function (tr) {
        var on = tr.dataset.id === id; tr.classList.toggle('sel', on);
        if (on) tr.setAttribute('aria-selected', 'true'); else tr.removeAttribute('aria-selected');
      });
      botones();
    }
    tbody.addEventListener('click', function (e) { var tr = e.target.closest('tr'); if (tr) seleccionar(tr.dataset.id); });
    tbody.addEventListener('dblclick', function (e) { var tr = e.target.closest('tr'); if (tr) { seleccionar(tr.dataset.id); abrirForm(tr.dataset.id); } });
    tbody.addEventListener('keydown', function (e) {
      var tr = e.target.closest && e.target.closest('tr'); if (!tr) return;
      if (e.key === 'Enter') { seleccionar(tr.dataset.id); abrirForm(tr.dataset.id); }
      else if (e.key === ' ') { e.preventDefault(); seleccionar(tr.dataset.id); }
      else if (e.key === 'ArrowDown' && tr.nextElementSibling) { e.preventDefault(); tr.nextElementSibling.focus(); seleccionar(tr.nextElementSibling.dataset.id); }
      else if (e.key === 'ArrowUp' && tr.previousElementSibling) { e.preventDefault(); tr.previousElementSibling.focus(); seleccionar(tr.previousElementSibling.dataset.id); }
    });

    var temporizadorTam = null;
    function alCambiarTamano() {
      clearTimeout(temporizadorTam);
      temporizadorTam = setTimeout(function () {
        if (!listo || cuerpo.clientHeight === altoPrevio) return;
        pila = []; pintarFilas();
      }, 150);
    }
    window.addEventListener('resize', alCambiarTamano);
    if (window.ResizeObserver) new ResizeObserver(alCambiarTamano).observe(cuerpo);

    /* ----- Menú de clic derecho ----- */
    function cerrarCtx() { if (menuCtx) { menuCtx.remove(); menuCtx = null; } }
    tbody.addEventListener('contextmenu', function (e) {
      var tr = e.target.closest('tr'); if (!tr) return;
      e.preventDefault(); seleccionar(tr.dataset.id); cerrarCtx();
      menuCtx = el('div', 'pros-ctx'); menuCtx.setAttribute('role', 'menu');
      [['Editar', function () { abrirForm(sel); }], ['Borrar', function () { abrirBorrar(sel); }], ['Agregar nuevo', function () { abrirForm(null); }]].forEach(function (a) {
        var b = el('button', null, a[0]); b.type = 'button'; b.setAttribute('role', 'menuitem');
        b.addEventListener('click', function () { cerrarCtx(); a[1](); }); menuCtx.appendChild(b);
      });
      document.body.appendChild(menuCtx);
      var w = menuCtx.offsetWidth, h = menuCtx.offsetHeight;
      menuCtx.style.left = Math.max(8, Math.min(e.clientX, window.innerWidth - w - 8)) + 'px';
      menuCtx.style.top = Math.max(8, Math.min(e.clientY, window.innerHeight - h - 8)) + 'px';
      menuCtx.firstChild.focus();
    });
    document.addEventListener('click', function (e) { if (menuCtx && !menuCtx.contains(e.target)) cerrarCtx(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarCtx(); });
    window.addEventListener('scroll', cerrarCtx, true);

    /* ----- Ventanas ----- */
    function cerrarModal() {
      if (modal) { modal.remove(); modal = null; document.body.classList.remove('pros-bloqueo'); if (anterior && anterior.focus) anterior.focus(); }
    }
    function nuevoModal(titulo, ancho) {
      cerrarModal(); anterior = document.activeElement;
      modal = el('div', 'pros-modal');
      var caja = el('div', 'pros-caja' + (ancho ? ' ' + ancho : '')); caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-modal', 'true');
      var h = el('h3', null, titulo); h.id = 'inv-titulo'; caja.setAttribute('aria-labelledby', 'inv-titulo');
      caja.appendChild(h); modal.appendChild(caja);
      modal.addEventListener('mousedown', function (e) { if (e.target === modal) cerrarModal(); });
      modal.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); cerrarModal(); return; }
        if (e.key !== 'Tab') return;
        var f = caja.querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea');
        if (!f.length) return;
        var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      });
      document.body.appendChild(modal); document.body.classList.add('pros-bloqueo');
      return caja;
    }
    function campo(caja, id, etiqueta, tipo, valorIni, extra) {
      var w = el('div', 'pros-campo' + (extra && extra.ancho ? ' ' + extra.ancho : ''));
      var l = el('label', null, etiqueta); l.htmlFor = 'if-' + id; w.appendChild(l);
      var i;
      if (tipo === 'select') {
        i = el('select');
        extra.opciones.forEach(function (o) { var x = el('option', null, o); x.value = o; i.appendChild(x); });
        i.value = valorIni;
      } else {
        i = el('input'); i.type = tipo; i.value = valorIni;
        if (tipo === 'number') { i.step = '0.01'; i.min = '0'; i.inputMode = 'decimal'; }
      }
      i.id = 'if-' + id; i.name = id;
      if (extra && extra.req) { i.required = true; l.textContent = etiqueta + ' *'; }
      w.appendChild(i); caja.appendChild(w); return i;
    }
    function abrirForm(id) {
      cerrarCtx();
      var r = id ? buscar(id) : null;
      if (id && !r) return;
      var base = r ? r : limpiar({ presentacion: 'Grano', tipoCafe: 'Bourbon y Caturra', peso: 500 });
      var caja = nuevoModal(r ? 'Editar producto' : 'Agregar producto', 'ancha');
      var form = el('form', 'pros-form'); form.noValidate = true; caja.appendChild(form);
      var f = {};
      function n2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
      f.nombre = campo(form, 'nombre', 'Nombre del producto', 'text', base.nombre, { req: true, ancho: 'c3' });
      f.presentacion = campo(form, 'presentacion', 'Tipo de presentación', 'select', base.presentacion, { opciones: PRESENTACIONES });
      f.tipoCafe = campo(form, 'tipoCafe', 'Tipo de café', 'select', base.tipoCafe, { opciones: TIPOS_CAFE });
      f.peso = campo(form, 'peso', 'Peso (gramos)', 'number', n2(base.peso));
      f.cantInicial = campo(form, 'cantInicial', 'Cantidad inicial', 'number', n2(base.cantInicial));
      f.costoInicial = campo(form, 'costoInicial', 'Costo unitario inicial ($)', 'number', n2(base.costoInicial));
      form.appendChild(el('div'));
      f.cantCompra = campo(form, 'cantCompra', 'Cantidad compra', 'number', n2(base.cantCompra));
      f.costoCompra = campo(form, 'costoCompra', 'Costo unitario compra ($)', 'number', n2(base.costoCompra));
      form.appendChild(el('div'));
      f.precioParticular = campo(form, 'precioParticular', 'Precio particular ($)', 'number', n2(base.precioParticular));
      f.precioCafeteria = campo(form, 'precioCafeteria', 'Precio cafetería ($)', 'number', n2(base.precioCafeteria));
      f.precioNegocio = campo(form, 'precioNegocio', 'Precio negocio ($)', 'number', n2(base.precioNegocio));
      var msg = el('p', 'pros-error'); msg.setAttribute('role', 'alert'); msg.hidden = true; form.appendChild(msg);
      var acc = el('div', 'pros-acciones');
      var bc = boton('Cancelar', '', cerrarModal);
      var bg = el('button', 'pros-btn oro', r ? 'Guardar cambios' : 'Guardar producto'); bg.type = 'submit';
      acc.appendChild(bc); acc.appendChild(bg); form.appendChild(acc);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!f.nombre.value.trim()) { msg.textContent = 'Escribe el nombre del producto.'; msg.hidden = false; f.nombre.focus(); return; }
        for (var i = 0; i < CAMPOS_NUM.length; i++) {
          var c = f[CAMPOS_NUM[i]], v = String(c.value).trim();
          if (v !== '' && (!isFinite(Number(v)) || Number(v) < 0)) { msg.textContent = 'Revisa los números: deben ser cero o mayores.'; msg.hidden = false; c.focus(); return; }
        }
        var nuevo = {
          id: r ? r.id : idNuevo(),
          orden: r ? r.orden : (regs.reduce(function (m, x) { return Math.max(m, x.orden); }, 0) + 1),
          nombre: f.nombre.value, presentacion: f.presentacion.value, tipoCafe: f.tipoCafe.value
        };
        CAMPOS_NUM.forEach(function (k) { nuevo[k] = f[k].value; });
        nuevo = limpiar(nuevo); nuevo.modificado = new Date().toISOString();
        bg.disabled = true; bg.textContent = 'Guardando…';
        Promise.resolve(almacen.guardar(nuevo)).then(function () {
          sel = nuevo.id; cerrarModal(); avisar('Guardado: ' + nuevo.nombre);
          var k = regs.findIndex(function (x) { return x.id === nuevo.id; });
          nuevo._b = textoBusqueda(nuevo); if (k >= 0) regs[k] = nuevo; else regs.push(nuevo);
          irA(nuevo.id); pintarFilas(); var tr = tbody.querySelector('tr.sel'); if (tr && tr.scrollIntoView) tr.scrollIntoView({ block: 'nearest' });
        }, function () {
          bg.disabled = false; bg.textContent = r ? 'Guardar cambios' : 'Guardar producto';
          msg.textContent = 'No se pudo guardar. Revisa la conexión e inténtalo otra vez.'; msg.hidden = false;
        });
      });
      f.nombre.focus();
    }
    function abrirBorrar(id) {
      cerrarCtx();
      var r = buscar(id); if (!r) return;
      var caja = nuevoModal('Borrar producto', 'angosta');
      var p = el('p', 'pros-conf'); p.appendChild(document.createTextNode('Se va a borrar '));
      p.appendChild(el('b', null, r.nombre)); p.appendChild(document.createTextNode(' del inventario. Esta acción no se puede deshacer.'));
      caja.appendChild(p);
      var msg = el('p', 'pros-error'); msg.setAttribute('role', 'alert'); msg.hidden = true; caja.appendChild(msg);
      var acc = el('div', 'pros-acciones');
      var bc = boton('Cancelar', '', cerrarModal);
      var bb = boton('Sí, borrar', 'peligro', function () {
        bb.disabled = true; bb.textContent = 'Borrando…';
        Promise.resolve(almacen.borrar(r.id)).then(function () {
          regs = regs.filter(function (x) { return x.id !== r.id; }); if (sel === r.id) sel = null;
          cerrarModal(); avisar('Borrado: ' + r.nombre); pintarFilas();
        }, function () { bb.disabled = false; bb.textContent = 'Sí, borrar'; msg.textContent = 'No se pudo borrar. Inténtalo otra vez.'; msg.hidden = false; });
      });
      acc.appendChild(bc); acc.appendChild(bb); caja.appendChild(acc);
      bc.focus();
    }

    /* ----- Exportar / respaldo ----- */
    function guardarArchivo(nombre, texto, tipo) {
      if (almacen.descargar) return almacen.descargar(nombre, texto, tipo);
      return Promise.reject(new Error('sin descarga'));
    }
    function exportarCsv() {
      var lista = visibles();
      var filas = [COLUMNAS.map(function (c) { return csvCelda(c.t + (c.num === 'peso' ? ' (g)' : '')); }).join(',')];
      lista.forEach(function (r) {
        filas.push(COLUMNAS.map(function (c) { return csvCelda(c.num ? r[c.k].toFixed(2) : r[c.k]); }).join(','));
      });
      guardarArchivo('inventario-' + hoy() + '.csv', '﻿' + filas.join('\r\n'), 'text/csv;charset=utf-8').then(
        function () { avisar('Archivo listo (' + lista.length + ' productos).'); },
        function (e) { if (!e || e.code !== 'declined') avisar('No se pudo generar el archivo en este navegador.', true); });
    }
    function exportarJson() {
      var datos = regs.map(function (r) { var o = JSON.parse(JSON.stringify(r)); delete o._b; return o; });
      guardarArchivo('respaldo-inventario-' + hoy() + '.json', JSON.stringify({ tipo: 'rc-inventario', version: 1, productos: datos }, null, 1), 'application/json').then(
        function () { avisar('Respaldo generado (' + datos.length + ' productos).'); },
        function () { avisar('No se pudo generar el respaldo.', true); });
    }
    function restaurar() {
      var a = archivo.files && archivo.files[0]; if (!a) return;
      var lector = new FileReader();
      lector.onload = function () {
        try {
          var j = JSON.parse(lector.result);
          var lista = j && j.tipo === 'rc-inventario' ? j.productos : null;
          if (!Array.isArray(lista)) throw new Error('formato');
          var tareas = lista.map(function (x) { var n = limpiar(x); n.id = x.id || idNuevo(); return Promise.resolve(almacen.guardar(n)); });
          Promise.all(tareas).then(function () { avisar('Restaurados ' + lista.length + ' productos.'); }, function () { avisar('No se pudo restaurar todo.', true); });
        } catch (e) { avisar('Ese archivo no es un respaldo de inventario válido.', true); }
        archivo.value = '';
      };
      lector.readAsText(a);
    }

    /* ----- Datos ----- */
    var lento = setTimeout(function () { if (!listo) { vacio.hidden = false; vacio.textContent = 'La información tarda en responder. Seguimos intentando…'; } }, 10000);
    vacio.hidden = false; vacio.textContent = 'Cargando inventario…';
    almacen.suscribir(function (lista) {
      clearTimeout(lento); listo = true;
      regs = lista.map(function (x) { var r = limpiar(x); r._b = textoBusqueda(r); return r; });
      if (sel && !buscar(sel)) sel = null;
      pintarFilas();
    }, function () {
      clearTimeout(lento);
      vacio.hidden = false; vacio.textContent = 'No se pudo leer el inventario. Recarga la página e inténtalo de nuevo.';
    });
    pintarFilas();
  }

  window.RC_inventario = { montar: montar, limpiar: limpiar };
})();
