/**
 * KreuzfahrtParkplatz.de – prototype behaviour
 * ---------------------------------------------------------------------------
 * Plain JavaScript (no build step, no dependencies). Everything is wrapped in
 * one IIFE and split into small init functions – each one only runs when the
 * markup it needs is present on the current page.
 *
 *   1. Helpers            DOM shortcuts, session storage, toast, navigation
 *   2. Shared UI          header nav, wishlist hearts, [data-toast] links
 *   3. Search state       dates / port / cruise line shared across pages
 *   4. Search form        #search  (home, Kiel hub, SEO pages)
 *   5. Kiel results list  filters, sorting, pager  (#list)
 *   6. Detail booking box price + hand-over to the order flow  (#bk)
 *   7. Application forms  affiliate / provider  (#xform)
 *   8. Order flow         booking form (#bform), summary fields, payment (#pform)
 *
 * No real backend: state lives in sessionStorage under "search" and "order".
 */
(function () {
  'use strict';

  /* ======================================================================
     1. Helpers
     ====================================================================== */

  const $  = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  /** Absolute URL of the site root – lets pages at any depth navigate safely. */
  const SITE_ROOT = new URL('../', document.currentScript.src).href;
  const PAGES = {
    kiel: 'kiel/index.html',
    payment: 'zahlung.html',
    confirmation: 'bestaetigung.html',
    bookingValet: 'buchung-valet.html',
  };
  const goTo = (page) => { window.location.href = SITE_ROOT + PAGES[page]; };

  /** sessionStorage with JSON (de)serialisation. get: store('k')  set: store('k', value) */
  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(sessionStorage.getItem(key));
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage blocked (private mode) – the prototype still works per page */ }
    return null;
  }

  let toastTimer;
  function toast(message) {
    let el = $('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
  }

  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;   // local date, not UTC
  const toDE  = (iso) => (iso ? iso.split('-').reverse().join('.') : '—');
  const daysBetween = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 864e5));
  const euro = (v) => v.toFixed(2).replace('.', ',') + ' €';

  /* ======================================================================
     2. Shared UI
     ====================================================================== */

  function initNavigation() {
    const burger = $('.burger');
    const nav = $('.nav');
    if (burger && nav) {
      burger.addEventListener('click', () => {
        nav.classList.toggle('open');
        burger.setAttribute('aria-expanded', nav.classList.contains('open'));
      });
    }

    // Dropdown groups: one open at a time, closed by any outside click.
    const closeDropdowns = () => $$('.nav > div.open').forEach((group) => group.classList.remove('open'));
    $$('.nav > div > button').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const group = button.parentNode;
        const wasOpen = group.classList.contains('open');
        closeDropdowns();
        if (!wasOpen) group.classList.add('open');
      });
    });
    document.addEventListener('click', closeDropdowns);
  }

  /** Wishlist: heart buttons toggle, the header pill shows the count. */
  function initWishlist() {
    const pill = $('.pill[data-toast^="Deine Merkliste"]');
    let count = store('wishlist') || 0;

    const render = () => {
      if (pill) pill.lastChild.textContent = ` Merkliste (${count})`;
    };
    render();

    $$('.heart').forEach((heart) => {
      heart.addEventListener('click', () => {
        heart.classList.toggle('on');
        const active = heart.classList.contains('on');
        heart.innerHTML = heart.getAttribute(active ? 'data-on' : 'data-off');
        count = Math.max(0, count + (active ? 1 : -1));
        store('wishlist', count);
        render();
        toast(active ? 'Zur Merkliste hinzugefügt' : 'Von der Merkliste entfernt');
      });
    });

    if (pill) {
      pill.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        toast(count ? `${count} Parkplatz${count === 1 ? '' : 'plätze'} auf deiner Merkliste (Prototyp)` : 'Deine Merkliste ist leer');
      }, true);
    }
  }

  /** Placeholder links (legal pages, other ports …) explain themselves via data-toast. */
  function initToastLinks() {
    $$('[data-toast]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        toast(el.getAttribute('data-toast'));
      });
    });
  }

  /* ======================================================================
     3. Search state (shared between pages via sessionStorage)
     ====================================================================== */

  function loadSearchState() {
    let state = store('search');
    if (!state) {
      const arrival = new Date();
      arrival.setDate(arrival.getDate() + 30);
      const departure = new Date(arrival);
      departure.setDate(departure.getDate() + 7);
      state = { hafen: 'Kiel', schiff: '', an: toISO(arrival), ab: toISO(departure) };
      store('search', state);
    }
    return state;
  }

  const search = loadSearchState();
  const tripDays = daysBetween(search.an, search.ab);

  /** Fill every [data-an] / [data-ab] / [data-n] with the chosen trip dates. */
  function renderTripDates() {
    $$('[data-an]').forEach((el) => { el.textContent = toDE(search.an); });
    $$('[data-ab]').forEach((el) => { el.textContent = toDE(search.ab); });
    $$('[data-n]').forEach((el) => { el.textContent = tripDays; });
    $$('[data-ard]').forEach((el) => { el.textContent = toDE(search.an); });
    $$('[data-abd]').forEach((el) => { el.textContent = toDE(search.ab) + ', ca. 06:30 Uhr'; });
  }

  /* ======================================================================
     4. Search form  (#search)
     ====================================================================== */

  function initSearchForm() {
    const form = $('#search');
    if (!form) return;

    // restore previous selection, default dates, no past arrival dates
    ['hafen', 'schiff', 'an', 'ab'].forEach((name) => {
      if (search[name] && form.elements[name]) form.elements[name].value = search[name];
    });
    form.elements.an.min = toISO(new Date());
    if (!form.elements.an.value) form.elements.an.value = search.an;
    if (!form.elements.ab.value) form.elements.ab.value = search.ab;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = {
        hafen: form.elements.hafen.value,
        schiff: form.elements.schiff.value,
        an: form.elements.an.value,
        ab: form.elements.ab.value,
      };

      $$('.fld', form).forEach((field) => field.classList.remove('err'));
      const invalid = [];
      if (!data.hafen) invalid.push(form.elements.hafen);
      if (!data.an) invalid.push(form.elements.an);
      if (!data.ab || data.ab <= data.an) invalid.push(form.elements.ab);
      if (invalid.length) {
        invalid.forEach((el) => el.closest('.fld').classList.add('err'));
        toast('Bitte Hafen, An- und Abreisedatum prüfen');
        return;
      }

      // Only Kiel is part of the first release – other ports follow separately.
      if (data.hafen !== 'Kiel') {
        toast(`${data.hafen} folgt in Kürze – aktuell sind Parkplätze in Kiel verfügbar`);
        return;
      }
      store('search', data);
      goTo('kiel');
    });
  }

  /* ======================================================================
     5. Kiel results list  (#list)
     ====================================================================== */

  /** Which provider "distance" buckets satisfy a selected distance filter. */
  const DISTANCE_MATCH = { direkt: ['direkt'], 2: ['direkt', '2'], 5: ['direkt', '2', '5'], 6: ['6'] };
  const TOTAL_RESULTS = 73;   // number shown by the unfiltered portal
  const TOTAL_PAGES = 15;
  const MAX_PRICE = 300;

  function initResultsList() {
    const list = $('#list');
    if (!list) return;

    const cards = $$('.pc', list);
    const pager = $('#pager');
    const counter = $('#cnt');
    let currentPage = 1;

    // small screens: start with collapsed filter groups
    if (window.innerWidth < 900) $$('.fg').forEach((group) => group.removeAttribute('open'));

    /** Values of all checked boxes in a filter group, ignoring the "all" box. */
    const checked = (name) => $$(`input[name=${name}]:checked`).map((input) => input.value).filter((v) => v !== 'all');

    // "Alle anzeigen" behaves like a radio for its group
    $$('.fg[data-g]').forEach((group) => {
      const allBox = $('input[value=all]', group);
      const others = $$('input', group).filter((input) => input !== allBox);
      allBox.addEventListener('change', () => {
        if (allBox.checked) others.forEach((input) => { input.checked = false; });
        else allBox.checked = true;
      });
      others.forEach((input) => input.addEventListener('change', () => {
        allBox.checked = !others.some((o) => o.checked);
      }));
    });

    function matches(card, f) {
      const { typ, dist, ext, rate, price } = card.dataset;
      if (f.types.length && !f.types.includes(typ)) return false;
      if (f.distances.length && !f.distances.some((v) => (DISTANCE_MATCH[v] || []).includes(dist))) return false;
      const features = (ext || '').split(',');
      if (!f.features.every((feature) => features.includes(feature))) return false;
      if (f.ratings.length && +rate < Math.min(...f.ratings.map(Number))) return false;
      return +price <= f.maxPrice;
    }

    const SORTERS = {
      preis: (a, b) => a.dataset.price - b.dataset.price,
      bew: (a, b) => b.dataset.rate - a.dataset.rate,
      dist: (a, b) => a.dataset.ord - b.dataset.ord,
      empf: (a, b) => a.dataset.ord - b.dataset.ord,
    };

    function renderPager(filtersActive, visibleCount) {
      pager.innerHTML = '';
      if (!visibleCount) {
        pager.innerHTML = '<em class="pager__note">Keine Treffer – bitte Filter anpassen</em>';
        return;
      }
      const note = document.createElement('em');
      if (filtersActive) {
        note.textContent = `${visibleCount} Ergebnisse`;
        pager.appendChild(note);
        return;
      }
      const button = (label, page, active, ariaLabel) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.textContent = label;
        el.setAttribute('aria-label', ariaLabel || `Seite ${label}`);
        if (active) el.className = 'on';
        el.addEventListener('click', () => {
          currentPage = page;
          update();
          toast(`Seite ${page} von ${TOTAL_PAGES} – in diesem Prototyp werden dieselben Beispielangebote gezeigt`);
        });
        pager.appendChild(el);
      };
      button('‹', Math.max(1, currentPage - 1), false, 'Zurück');
      [1, 2, 3, 4, 5].forEach((n) => button(n, n, n === currentPage));
      const dots = document.createElement('span');
      dots.textContent = '…';
      pager.appendChild(dots);
      button(TOTAL_PAGES, TOTAL_PAGES, currentPage === TOTAL_PAGES);
      button('›', Math.min(TOTAL_PAGES, currentPage + 1), false, 'Weiter');
      note.textContent = `${TOTAL_RESULTS} Ergebnisse`;
      pager.appendChild(note);
    }

    function update() {
      const filters = {
        types: checked('typ'),
        distances: checked('dist'),
        features: checked('ext'),
        ratings: checked('rate'),
        maxPrice: +$('#maxp').value,
      };
      const filtersActive = Boolean(filters.types.length || filters.distances.length || filters.features.length
        || filters.ratings.length || filters.maxPrice < MAX_PRICE);
      $('#maxv').textContent = `${filters.maxPrice} €`;

      const visible = cards.filter((card) => matches(card, filters)).sort(SORTERS[$('#sort').value] || SORTERS.empf);
      cards.forEach((card) => { card.style.display = 'none'; });
      visible.forEach((card) => { list.appendChild(card); card.style.display = ''; });

      counter.textContent = `${filtersActive ? visible.length : TOTAL_RESULTS} Parkplätze in Kiel`;
      renderPager(filtersActive, visible.length);
    }

    $$('.flt input, #sort').forEach((control) => control.addEventListener('input', update));
    $('#reset').addEventListener('click', () => {
      $$('.flt input[type=checkbox]').forEach((box) => { box.checked = box.value === 'all'; });
      $('#maxp').value = MAX_PRICE;
      $('#sort').value = 'empf';
      update();
    });
    update();
  }

  /* ======================================================================
     6. Detail booking box  (#bk)  – price for the chosen trip length
     ====================================================================== */

  function initBookingBox() {
    const box = $('#bk');
    if (!box) return;

    const pricePer7Days = +box.dataset.p7;
    const total = Math.round((pricePer7Days * tripDays / 7) * 100) / 100;

    $('#bl').textContent = euro(total);
    $('#bt').textContent = euro(total);
    const mobileTotal = $('#mb');
    if (mobileTotal) mobileTotal.textContent = euro(total);

    // remember the choice for the order flow
    const ctas = $$('a.btn.y', box).concat($$('#mbl'));
    ctas.forEach((cta) => cta.addEventListener('click', () => {
      store('order', { prod: box.dataset.prod, total, days: tripDays });
    }));
  }

  /* ======================================================================
     7. Application forms – affiliate / provider  (#xform)
     ====================================================================== */

  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

  function initApplicationForm() {
    const form = $('#xform');
    if (!form) return;

    // file picker + drag & drop
    const fileInput = $('#bilder');
    const dropZone = $('.drop', form);
    if (fileInput && dropZone) {
      fileInput.addEventListener('change', () => {
        $('#files').textContent = Array.from(fileInput.files).map((f) => f.name).join(', ');
      });
      ['dragover', 'dragenter'].forEach((type) => dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        dropZone.classList.add('over');
      }));
      ['dragleave', 'drop'].forEach((type) => dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        dropZone.classList.remove('over');
        if (type === 'drop') {
          fileInput.files = event.dataTransfer.files;
          fileInput.dispatchEvent(new Event('change'));
        }
      }));
    }

    function validateField(el) {
      const value = (el.value || '').trim();
      let valid = !(el.required && !value);
      if (el.type === 'email' && value && !EMAIL_RE.test(value)) valid = false;
      const wrapper = el.closest('.f');
      if (wrapper) wrapper.classList.toggle('bad', !valid);
      return valid;
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      let firstInvalid = null;
      const flag = (el) => { firstInvalid = firstInvalid || el; };

      $$('input:not([type=checkbox]):not([type=file]), select, textarea', form).forEach((el) => {
        if (!validateField(el)) flag(el);
      });
      $$('fieldset.cg', form).forEach((group) => {
        const required = group.dataset.req === '1';
        const missing = required && !$$('input:checked', group).length;
        group.classList.toggle('bad', missing);
        if (missing) flag(group);
      });
      const consent = $('#dsgvo');
      const consentBox = $('input', consent);
      consent.classList.toggle('bad', !consentBox.checked);
      if (!consentBox.checked) flag(consentBox);

      if (firstInvalid) {
        toast('Bitte fülle alle Pflichtfelder korrekt aus');
        firstInvalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      // Prototype: no request is sent – just show the success state.
      const success = $('.okmsg', form);
      success.hidden = false;
      success.scrollIntoView({ block: 'center', behavior: 'smooth' });
      form.reset();
    });
  }

  /* ======================================================================
     8. Order flow – booking form → payment → confirmation
     ====================================================================== */

  const DEFAULT_PRICE_7_DAYS = { parken: 139, valet: 179 };
  const DEFAULT_SHIP = 'Mein Schiff 7';
  const SHIPS = {
    'AIDA Cruises': ['AIDAprima', 'AIDAnova', 'AIDAcosma'],
    'Mein Schiff': ['Mein Schiff 7', 'Mein Schiff 1', 'Mein Schiff Relax'],
    'MSC Cruises': ['MSC Euribia', 'MSC Preziosa'],
    'Costa': ['Costa Toscana', 'Costa Diadema'],
  };
  const PAYMENT_LABELS = {
    paypal: 'PayPal', card: 'Kredit-/Debitkarte', apple: 'Apple Pay', google: 'Google Pay', sepa: 'SEPA-Lastschrift',
  };

  const order = store('order') || {};
  const product = order.prod || 'parken';

  /** Total for a product: the price from the detail page if it matches, else the default offer. */
  function orderTotal(prod) {
    if (order.total && order.prod === prod) return order.total;
    return Math.round((DEFAULT_PRICE_7_DAYS[prod || 'parken'] * tripDays / 7) * 100) / 100;
  }

  function initBookingForm() {
    const form = $('#bform');
    if (!form) return;
    const prod = form.dataset.prod;

    // ship list depends on the cruise line
    const lineSelect = form.reederei;
    const shipSelect = form.schiff;
    lineSelect.addEventListener('change', () => {
      const ships = SHIPS[lineSelect.value] || [];
      shipSelect.innerHTML = '<option value="">Bitte auswählen</option>' + ships.map((s) => `<option>${s}</option>`).join('');
      $('#retship').textContent = DEFAULT_SHIP;
    });
    shipSelect.addEventListener('change', () => { $('#retship').textContent = shipSelect.value || DEFAULT_SHIP; });

    function validateField(el) {
      const value = (el.value || '').trim();
      let valid = !(el.required && !value);
      if (el.name === 'email' && value && !EMAIL_RE.test(value)) valid = false;
      if (el.name === 'plz' && value && !/^\d{5}$/.test(value)) valid = false;
      if (el.name === 'tel' && value && !/^[+\d][\d\s/-]{6,}$/.test(value)) valid = false;
      const wrapper = el.closest('.f');
      if (wrapper) wrapper.classList.toggle('bad', !valid);
      return valid;
    }
    const namedFields = () => $$('input, select, textarea', form).filter((el) => el.name && el.type !== 'checkbox');

    namedFields().forEach((el) => {
      el.addEventListener('blur', () => validateField(el));
      el.addEventListener('input', () => { if (el.closest('.bad')) validateField(el); });
    });

    // number steppers (− / +)
    $$('.stp', form).forEach((stepper) => {
      const input = $('input', stepper);
      const [minus, plus] = $$('button', stepper);
      minus.addEventListener('click', () => { input.value = Math.max(+input.min, +input.value - 1); });
      plus.addEventListener('click', () => { input.value = Math.min(+input.max, +input.value + 1); });
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const invalid = namedFields().filter((el) => !validateField(el));
      if (invalid.length) {
        toast('Bitte fülle alle Pflichtfelder korrekt aus');
        invalid[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
        invalid[0].focus();
        return;
      }
      const data = {};
      $$('input, select, textarea', form).forEach((el) => {
        if (el.name) data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      Object.assign(order, { form: data, prod, total: orderTotal(prod), days: tripDays });
      store('order', order);
      goTo('payment');
    });
  }

  /** Fill summary placeholders ([data-f="…"]) on payment + confirmation pages. */
  function renderOrderSummary() {
    const f = order.form || {};
    const values = {
      total: euro(orderTotal(product)),
      'anrede-name': f.vorname ? `${f.anrede ? f.anrede + ' ' : ''}${f.vorname} ${f.nachname}` : null,
      strasse: f.strasse,
      plzort: f.plz ? `${f.plz} ${f.ort}` : null,
      email: f.email,
      vorname: f.vorname,
      kz: f.kennzeichen,
      marke: f.marke,
      farbe: f.farbe,
      pers: f.pers ? `${f.pers} ${+f.pers === 1 ? 'Person' : 'Personen'}` : null,
      schiff: f.schiff,
      nr: order.nr,
      paylabel: PAYMENT_LABELS[order.pay],
    };
    $$('[data-f]').forEach((el) => {
      const value = values[el.dataset.f];
      if (value) el.textContent = value;
    });
    $$('[data-zeit]').forEach((el) => { if (f.zeit) el.textContent = f.zeit; });

    // valet bookings swap the parking copy for the valet copy
    if (product === 'valet') {
      const parking = $('.sum-parking');
      const valet = $('.sum-valet');
      if (parking && valet) { parking.hidden = true; valet.hidden = false; }
      const back = $('#backl');
      if (back) back.href = SITE_ROOT + PAGES.bookingValet;
    }
  }

  function initPaymentForm() {
    const form = $('#pform');
    if (!form) return;

    const methods = $$('.pm', form);
    const highlightSelected = () => methods.forEach((m) => {
      m.classList.toggle('on', $('input[type=radio]', m).checked);
    });
    methods.forEach((m) => m.addEventListener('change', highlightSelected));
    highlightSelected();

    // card number: digits only, grouped by 4
    const cardNumber = $('#cc');
    cardNumber.addEventListener('input', () => {
      cardNumber.value = cardNumber.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
    });

    const CARD_RULES = {
      cc: (v) => v.replace(/\s/g, '').length >= 15,
      exp: (v) => /^\d{2}\s*\/\s*\d{2}$/.test(v),
      cvc: (v) => /^\d{3,4}$/.test(v),
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const method = form.pay.value;
      let hasError = false;

      if (method === 'card') {
        Object.keys(CARD_RULES).forEach((id) => {
          const input = document.getElementById(id);
          const valid = CARD_RULES[id](input.value.trim());
          input.closest('.f').classList.toggle('bad', !valid);
          if (!valid) hasError = true;
        });
      }
      ['agb', 'agb2'].forEach((id) => {
        const box = document.getElementById(id);
        box.closest('.chk').classList.toggle('bad', !box.checked);
        if (!box.checked) hasError = true;
      });
      if (hasError) { toast('Bitte prüfe deine Angaben'); return; }

      // simulated payment: spinner → confirmation
      $('.spin').classList.add('on');
      order.pay = method;
      order.nr = `KP-${new Date().getFullYear()}-${Math.floor(Math.random() * 900000) + 100000}`;
      store('order', order);
      setTimeout(() => goTo('confirmation'), 1600);
    });
  }

  /* ======================================================================
     Boot
     ====================================================================== */

  initNavigation();
  initWishlist();
  initToastLinks();
  renderTripDates();
  initSearchForm();
  initResultsList();
  initBookingBox();
  initApplicationForm();
  initBookingForm();
  renderOrderSummary();
  initPaymentForm();
})();
