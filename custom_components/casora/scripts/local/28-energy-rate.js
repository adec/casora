// Electricity import prices: Octopus published rates, with an optional Glow current-rate source.
(function () {
  if (window._casoraRate) return;
  var P = window._casoraRate = {};
  var number = function (v) { return v === null || v === undefined || String(v).trim() === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null; };
  var attrs = function (s) { return s?.attributes || {}; };
  var tr = function (s) { return window.casoraTr ? window.casoraTr(s) : s; };
  P.pence = function (s, override) {
    var n = number(s?.state), u = override || attrs(s).unit_of_measurement;
    if (n === null) return null;
    if (/^(p|pence|GBp)\s*\/\s*kWh$/.test(u)) return n;
    if (/^(GBP|£)\s*\/\s*kWh$/i.test(u)) return n * 100;
    return null;
  };
  P.limits = function (v) {
    var a = number(v?.lowlimit) ?? 5, b = number(v?.mediumlimit) ?? 20, c = number(v?.highlimit) ?? 30;
    return a <= b && b <= c && a >= 0 ? [a, b, c] : [5, 20, 30];
  };
  // Cheapest-slot highlighting is a visual overlay, not a price category.
  P.category = function (n, v) {
    if (n === null || !Number.isFinite(n)) return null;
    var limits = P.limits(v);
    return n > limits[2] ? 'high' : n > limits[1] ? 'medium' : n > limits[0] ? 'low' : n <= 0 ? 'negative' : 'cheap';
  };
  // Same strict boundaries, zero handling, palette and cheapest-slot precedence as octopus-energy-rates-card.
  P.band = function (n, v, cheapest) {
    v = v || {};
    if (n === null) return { text: 'Preis nicht verfügbar', tone: 'muted', hue: 'var(--secondary-text-color)' };
    var best = v.cheapest !== false && v.cheapest !== 'false' && cheapest != null && Math.abs(n - cheapest) < 0.0000001;
    var k = best ? (n <= 0 ? 'cheapestblue' : 'cheapest') : P.category(n, v);
    var defaults = { high: 'Tomato', medium: 'orange', low: 'ForestGreen', cheap: 'MediumSeaGreen', negative: 'rgb(57,28,217)', cheapest: 'LightGreen', cheapestblue: 'LightBlue' };
    var custom = String(v['color_' + k] || '').trim();
    var hue = /^#[0-9a-f]{3,8}$/i.test(custom) || /^[a-z]+$/i.test(custom) || /^rgba?\([\d.,%\s]+\)$/.test(custom) ? custom : defaults[k];
    return { text: { high: 'Teuer', medium: 'Erhöhter Preis', low: 'Normal', cheap: 'Günstig', negative: 'Null oder negativer Strompreis', cheapest: 'Günstigster Preis', cheapestblue: 'Günstigster Preis' }[k],
      tone: k === 'high' ? 'bad' : k === 'medium' ? 'warn' : 'good', hue: hue.startsWith('#') ? hue : 'var(--casora-agile-custom-colour, ' + hue + ')' };
  };
  P.format = function (n, h) {
    return n === null ? '—' : n.toLocaleString(h?.locale?.language || 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' p/kWh';
  };
  // Match published rates by meter attributes, so renamed entities work and export meters stay isolated.
  P.resolve = function (S, h, v, id, now) {
    v = v || {}; now = now ?? Date.now();
    var main = v.current_rate_entity || id, oct = v.octopus_entity || main, a = attrs(S[oct]);
    var matched = function (eid) {
      var b = attrs(S[eid]);
      return b.is_export !== true && a.is_export !== true && !!a.mpan && b.mpan === a.mpan
        && (!a.serial_number || b.serial_number === a.serial_number)
        && (!(a.tariff || a.tariff_code) || !(b.tariff || b.tariff_code) || (a.tariff || a.tariff_code) === (b.tariff || b.tariff_code));
    };
    var rateIds = [v.today_rates, v.tomorrow_rates].filter(Boolean);
    if (!rateIds.length) rateIds = Object.keys(S).filter(function (eid) { return matched(eid) && Array.isArray(attrs(S[eid]).rates); });
    var rows = [], seen = new Set();
    rateIds.forEach(function (eid) {
      (Array.isArray(attrs(S[eid]).rates) ? attrs(S[eid]).rates : []).forEach(function (r) {
        var start = Date.parse(r.start), end = Date.parse(r.end), price = number(r.value_inc_vat);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || price === null || end <= now || start > now + 48 * 3600000 || seen.has(start)) return;
        seen.add(start); rows.push({ start: start, end: end, price: price * 100, adjusted: !!r.is_intelligent_adjusted });
      });
    });
    rows.sort(function (x, y) { return x.start - y.start; });
    var active = rows.find(function (r) { return r.start <= now && now < r.end; });
    var validCurrent = function (eid, unit) {
      var st = S[eid], b = attrs(st), start = b.start ? Date.parse(b.start) : null, end = b.end ? Date.parse(b.end) : null;
      if (b.is_export === true || (b.start && (!Number.isFinite(start) || start > now)) || (b.end && (!Number.isFinite(end) || end <= now))) return null;
      return P.pence(st, unit);
    };
    var price = validCurrent(main, v.rate_unit), source = main;
    if (price === null && active) { price = active.price; source = oct; }
    if (price === null && v.fallback_entity) { price = validCurrent(v.fallback_entity, v.fallback_unit); source = v.fallback_entity; }
    var next = rows.find(function (r) { return r.start > now; });
    var cheapest = rows.filter(function (r) { return r.start > now; }).reduce(function (best, r) { return !best || r.price < best.price ? r : best; }, null);
    var minimum = rows.length ? Math.min.apply(null, rows.map(function (r) { return r.price; })) : null;
    var standing = v.standing_charge_entity;
    if (!standing) standing = Object.keys(S).find(function (eid) { return matched(eid) && ((h?.entities?.[eid]?.translation_key === 'current_standing_charge') || /^(GBP|£|p|pence)\/day$/.test(attrs(S[eid]).unit_of_measurement || '')); });
    return { price: price, minimum: minimum, source: source, oct: oct, main: main, rows: rows, rateIds: rateIds, next: next, cheapest: cheapest, standing: standing,
      tariff: v.tariff_name || a.tariff || a.tariff_code || rateIds.map(function (eid) { return attrs(S[eid]).tariff_code; }).find(Boolean) || '—',
      adjusted: !!attrs(S[source]).is_intelligent_adjusted || !!active?.adjusted,
      end: active?.end || Date.parse(attrs(S[source]).end) || null,
      watch: Array.from(new Set([main, oct, standing, v.fallback_entity].concat(rateIds).filter(Boolean))) };
  };
  var hosts = new Set(), timer;
  var sweep = function () {
    clearTimeout(timer); timer = null;
    hosts.forEach(function (el) { if (!el.isConnected) hosts.delete(el); else if (!document.hidden) window.casoraKick?.(el); });
    if (hosts.size) { timer = setTimeout(sweep, 30000); timer.unref?.(); }
  };
  P.watch = function (host) { if (!host?.isConnected) return; hosts.add(host); if (!timer) { timer = setTimeout(sweep, 30000); timer.unref?.(); } };
  P.badge = function (S, h, v, id, host) {
    P.watch(host);
    var s = P.resolve(S, h, v, id), b = P.band(s.price, v, s.minimum), esc = window._casoraUI?.esc || function (s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
    return '<div class="badge-wrap"><div class="badge-title">' + esc(P.format(s.price, h)) + '</div><div class="badge-sub">' + esc(tr(b.text)) + '</div></div>';
  };
  var time = function (ts, h) { return new Date(ts).toLocaleString(h?.locale?.language || 'en-GB', { timeZone: h?.config?.time_zone || 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }); };
  // Only a continuous published sequence can establish when a category ends. Never bridge gaps.
  P.outlook = function (s, v, now) {
    now = now ?? Date.now();
    var category = P.category(s.price, v), rows = s.rows || [];
    var active = rows.find(function (r) { return r.start <= now && now < r.end; });
    if (!category || !active || P.category(active.price, v) !== category) return { category: category, known: false };
    var until = active.end;
    for (var r of rows) {
      if (r.end <= until) continue;
      if (r.start !== until) break;
      if (P.category(r.price, v) !== category) return { category: category, known: true, until: until, change: r };
      until = r.end;
    }
    return { category: category, known: true, until: until, change: null };
  };
  P.duration = function (ms) {
    var minutes = Math.max(1, Math.ceil(ms / 60000)), hours = Math.floor(minutes / 60);
    return hours ? hours + ' h' + (minutes % 60 ? ' ' + minutes % 60 + ' min' : '') : minutes + ' min';
  };
  P.timing = function (s, h, v, now) {
    now = now ?? Date.now();
    var o = P.outlook(s, v, now);
    if (!o.known) return s.price === null ? '' : tr('Dauer der Preisstufe nicht verfügbar');
    var text = tr(o.change ? 'Noch {duration} · bis {time}' : 'Mindestens weitere {duration} · Preise bis {time}');
    return text.replace('{duration}', P.duration(o.until - now)).replace('{time}', time(o.until, h));
  };
  P.sec = function (part, C, S, h, host) {
    P.watch(host);
    var UI = window._casoraUI, v = C.v, s = P.resolve(S, h, v, C.id), b = P.band(s.price, v, s.minimum);
    if (!UI) return '';
    if (part === 'hero') {
      var base = P.band(s.price, v), rest = [tr(base.text), P.timing(s, h, v)];
      if (b.text !== base.text) rest.push(tr(b.text));
      return UI.line(P.format(s.price, h), rest, { tone: base.tone });
    }
    if (part === 'details') {
      var detail = [{ label: 'Tarif', value: s.tariff }, { label: 'Aktueller Preis', value: P.format(s.price, h), valueTone: b.hue },
        { label: 'Preisquelle', value: attrs(S[s.source]).friendly_name || s.source || '—' }];
      if (s.price !== null && s.end) detail.push({ label: 'Gültig bis', value: time(s.end, h) });
      if (s.standing && number(S[s.standing]?.state) !== null) detail.push({ label: 'Grundgebühr', value: /^(GBP|£)$/.test(attrs(S[s.standing]).unit_of_measurement || '') ? (Number(S[s.standing].state) * 100).toLocaleString(h?.locale?.language || 'en-GB', { maximumFractionDigits: 2 }) + ' p/day' : S[s.standing].state + ' ' + (attrs(S[s.standing]).unit_of_measurement || '') });
      var outlook = P.outlook(s, v);
      if (outlook.change) detail.push({ label: 'Ende der aktuellen Preisstufe', value: time(outlook.until, h),
        sub: tr(P.band(outlook.change.price, v).text) + ' · ' + P.format(outlook.change.price, h) });
      if (s.next) detail.push({ label: 'Nächster Preis', value: P.format(s.next.price, h), sub: time(s.next.start, h) });
      if (s.cheapest) detail.push({ label: 'Günstigster kommender Zeitraum', value: P.format(s.cheapest.price, h), sub: time(s.cheapest.start, h) });
      return UI.more('agile-tariff-details', UI.group(detail, 'Tarifdetails') + UI.note('Preise inklusive Mehrwertsteuer. Die Grundgebühr kommt hinzu.')
        + (s.adjusted ? UI.note('Intelligent-Tarif: Der angepasste Preis kann vom Laden des Autos abhängen.') : '')
        + UI.note('Farben nach deinen Preisgrenzen, kein Vergleich mit dem Tagesdurchschnitt.'), { label: 'Tarifdetails' });
    }
    return '';
  };
  // Keep the shared popup symbol in the same current-rate colour as its badge.
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/\bcasora_badge_energy_rate\b/.test(key)) return null;
    var h = src?._hass || document.querySelector('home-assistant')?.hass;
    if (!h) return null;
    var v = src._variables || src._config?.variables || {}, id = src._stateObj?.entity_id || src._config?.entity;
    var s = P.resolve(h.states, h, v, id);
    return { hue: P.band(s.price, v, s.minimum).hue, off: false };
  });
  P.columns = function (width) { return width >= 720 ? 3 : width >= 440 ? 2 : 1; };
  P.cardConfig = function (s, S, v, width) {
    var pick = function (kind) { return s.rateIds.find(function (id) { return (attrs(S[id]).event_types || []).some(function (t) { return t.endsWith('_' + kind + '_day_rates'); }); }); };
    var limits = P.limits(v);
    return { type: 'custom:octopus-energy-rates-card', currentEntity: v.today_rates || pick('current'), futureEntity: v.tomorrow_rates || pick('next'),
      cols: P.columns(width), hour12: false, showday: true, showpast: false, title: '', unitstr: 'p', multiplier: 100,
      lowlimit: limits[0], mediumlimit: limits[1], highlimit: limits[2], cheapest: v.cheapest !== false && v.cheapest !== 'false', cardRefreshIntervalSeconds: 0 };
  };
  // The installed card stays unmodified inside this shadow root. Resize only changes its column count.
  if (typeof customElements !== 'undefined' && !customElements.get('casora-agile-rates')) {
    customElements.define('casora-agile-rates', class extends HTMLElement {
      constructor() { super(); this.attachShadow({ mode: 'open' }); this._width = 0; this._generation = 0; }
      setConfig(c) { this._cfg = c; this._key = null; this._sync(); }
      set hass(h) { this._h = h; this._sync(); }
      connectedCallback() {
        this.style.cssText = 'display:block;min-width:0;position:relative;z-index:1;';
        this._observer = new ResizeObserver(entries => { this._width = entries[0].contentRect.width; this._sync(); });
        this._observer.observe(this);
        this._clock = setInterval(() => { if (!document.hidden) this._sync(); }, 30000);
        this._clock.unref?.();
        var generation = ++this._generation;
        customElements.whenDefined('octopus-energy-rates-card').then(() => { if (this.isConnected && generation === this._generation) this._sync(); });
        this._sync();
      }
      disconnectedCallback() { this._generation++; this._observer?.disconnect(); clearInterval(this._clock); this._key = null; }
      _sync() {
        if (!this.isConnected || !this._h || !this._cfg) return;
        var v = this._cfg.variables || {}, S = this._h.states, s = P.resolve(S, this._h, v, this._cfg.entity);
        var config = P.cardConfig(s, S, v, this._width), UI = window._casoraUI;
        var message = !customElements.get('octopus-energy-rates-card') ? 'Octopus Energy Rates Card in HACS installieren und als Ressource laden.'
          : !s.rows.length || !(S[config.currentEntity] || S[config.futureEntity]) ? 'Keine kommenden Preise verfügbar' : null;
        if (message) {
          this._child = null; this._key = null;
          this.shadowRoot.innerHTML = UI ? tr(UI.note(message)) : tr(message);
          return;
        }
        var key = JSON.stringify([config, s.watch.map(id => S[id]?.last_updated), Math.floor(Date.now() / 30000), this._h.locale?.language]);
        if (key === this._key) return;
        this._key = key;
        var newConfig = JSON.stringify(config);
        if (!this._child || this._configKey !== newConfig) {
          this.shadowRoot.textContent = '';
          this._child = document.createElement('octopus-energy-rates-card');
          this._child.setConfig(config); this.shadowRoot.appendChild(this._child); this._configKey = newConfig;
          var style = document.createElement('style');
          var palette = { red: P.band(1000000, v).hue, orange: P.band((config.mediumlimit + config.highlimit) / 2, v).hue,
            lightgreen: P.band((config.lowlimit + config.mediumlimit) / 2, v).hue, green: P.band(Math.max(0.0001, config.lowlimit / 2), v).hue,
            blue: P.band(-1, v).hue, cheapest: P.band(1, v, 1).hue, cheapestblue: P.band(-1, v, -1).hue };
          style.textContent = ':host{max-height:55dvh;overflow:auto;overscroll-behavior:contain;} octopus-energy-rates-card{display:block;min-width:0;} ha-card{background:var(--casora-popup-row-fill);border-radius:var(--casora-r-row);box-shadow:none;border:0;} td{font-variant-numeric:tabular-nums;}td.rate{white-space:nowrap;} '
            + Object.keys(palette).map(k => 'td.' + k + '{background-color:' + palette[k] + '!important;border-color:' + palette[k] + '!important;color:var(--casora-agile-ink-' + k + ', ' + (['red','lightgreen','blue'].includes(k) ? 'white' : 'black') + ')!important;}td.time_' + k + '{border-bottom-color:' + palette[k] + '!important;}').join('');
          this.shadowRoot.appendChild(style); this.tabIndex = 0;
          this.setAttribute('role', 'region'); this.setAttribute('aria-label', tr('Kommende Preise'));
        }
        try { this._child.hass = this._h; }
        catch (err) { this._key = null; this.shadowRoot.innerHTML = UI ? tr(UI.note('Keine kommenden Preise verfügbar')) : tr('Keine kommenden Preise verfügbar'); this._child = null; }
      }
      getCardSize() { return 6; }
    });
  }
  P.popup = function (S, h, v, id) {
    var K = window._casoraSoftKit;
    if (!K) return { type: 'vertical-stack', cards: [] };
    var C = { v: v || {}, id: id }, watch = P.resolve(S, h, v, id).watch, fields = {};
    ['hero', 'details'].forEach(function (part) {
      fields[part] = { card: K.secCard(watch, 'return window._casoraRate.sec(' + JSON.stringify(part) + ',' + JSON.stringify(C) + ',states,hass,this);', S) };
    });
    fields.rates = { card: { type: 'custom:casora-agile-rates', entity: id, variables: v || {} } };
    return K.layout({ fields: fields, top: ['hero', 'rates'], left: ['details'], right: [] });
  };
})();
