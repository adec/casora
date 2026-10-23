// UniFi Protect community card. All access goes through Home Assistant's existing integration.
(function () {
  if (window._casoraProtect) return;
  var P = window._casoraProtect = {};
  var ROOT = 'media-source://unifiprotect';
  var bad = function (s) { return !s || /^(unknown|unavailable)$/.test(s); };
  var tr = function (s) { return window.casoraTr ? window.casoraTr(s) : s; };
  var currentHass = function () { return document.querySelector('home-assistant')?.hass; };
  var label = { ring: 'Geklingelt', person: 'Person', vehicle: 'Fahrzeug', animal: 'Tier', package: 'Paket', motion: 'Bewegung', smart: 'Erkennung', sound: 'Geräusch' };
  var icon = { ring: 'mdi:doorbell', person: 'mdi:walk', vehicle: 'mdi:car', animal: 'mdi:paw', package: 'mdi:package-variant-closed', motion: 'mdi:motion-sensor', sound: 'mdi:volume-high' };
  var kick = function (el) { if (el && el.isConnected !== false) { if (window.casoraKick) window.casoraKick(el); else el.requestUpdate?.('_config', undefined); } };
  P.is = function (h, id) { return !!(id?.startsWith('camera.') && h?.entities?.[id]?.platform === 'unifiprotect'); };
  // No entity-name guessing: renamed entities and different HA languages use the same registry keys.
  P.find = function (h, id) {
    var R = h?.entities || {}, S = h?.states || {}, me = R[id], d = h?.devices?.[me?.device_id] || {};
    var c = { cam: id, package: null, ring: null, lastRing: null, motion: null, det: {}, events: {}, sw: {}, select: {}, text: null, mic: null, url: d.configuration_url || null };
    if (!P.is(h, id) || !me.device_id) return c;
    Object.keys(R).forEach(function (eid) {
      var e = R[eid], st = S[eid], k = e.translation_key, dom = eid.split('.')[0];
      if (e.device_id !== me.device_id || e.platform !== 'unifiprotect' || e.disabled_by || e.hidden || !st) return;
      var a = st.attributes || {};
      if (dom === 'camera' && Number(a.channel_id) === 3 && eid !== id) c.package = eid;
      if (dom === 'event') {
        var kind = { doorbell: 'ring', package: 'package', vehicle: 'vehicle', motion_detection: 'motion', smart_detection: 'smart', sound_detection: 'sound' }[k];
        if (kind) c.events[kind] = eid;
      }
      if (dom === 'binary_sensor') {
        if (k === 'doorbell') c.ring = eid;
        else if (k === 'person_detected') c.det.person = eid;
        else if (k === 'vehicle_detected') c.det.vehicle = eid;
        else if (k === 'animal_detected') c.det.animal = eid;
        else if (k === 'package_detected') c.det.package = eid;
        else if (!k && a.device_class === 'motion') c.motion = eid;
      }
      if (dom === 'sensor' && k === 'last_doorbell_ring') c.lastRing = eid;
      if (dom === 'switch' && ['privacy_mode', 'status_light', 'system_sounds', 'motion', 'detections_person', 'detections_vehicle', 'detections_package', 'detections_animal'].includes(k)) c.sw[k] = eid;
      if (dom === 'select' && ['recording_mode', 'infrared_mode', 'doorbell_text'].includes(k)) c.select[k] = eid;
      if (dom === 'text' && k === 'doorbell') c.text = eid;
      if (dom === 'number' && k === 'microphone_level') c.mic = eid;
    });
    return c;
  };
  P.watch = function (c) { return [...new Set([c.cam, c.package, c.ring, c.lastRing, c.motion, c.text, c.mic].concat(Object.values(c.det), Object.values(c.events), Object.values(c.sw), Object.values(c.select)).filter(Boolean))]; };
  P.status = function (c, S, now) {
    S = S || {}; now = now || Date.now();
    var st = S[c.cam], ring = Math.max(Date.parse(S[c.events.ring]?.state) || 0, Date.parse(S[c.lastRing]?.state) || 0,
      S[c.ring]?.state === 'on' ? Date.parse(S[c.ring].last_changed) || now : 0);
    var privacy = S[c.sw.privacy_mode]?.state === 'on';
    return { dead: !st || bad(st.state), off: st?.state === 'off', privacy: privacy,
      ring: ring > 0 && ring <= now && now - ring < 600000 ? ring : null,
      live: Object.keys(c.det).filter(function (k) { return S[c.det[k]]?.state === 'on'; }),
      motion: S[c.motion]?.state === 'on' };
  };
  P.tileText = function (s) {
    if (s.privacy) return 'Privatsphäre an';
    if (s.dead) return 'Offline';
    if (s.off) return 'Aus';
    if (s.ring) return 'Hat geklingelt';
    if (s.live.length) return (label[s.live[0]] || 'Objekt') + ' erkannt';
    if (s.motion) return 'Bewegung erkannt';
    return null;
  };
  P.tile = function (entity, h, S, host) {
    if (!P.is(h, entity?.entity_id)) return bad(entity?.state) ? 'Offline' : 'Bereit';
    var s = P.status(P.find(h, entity.entity_id), S), text = P.tileText(s);
    if (text) return text;
    if (P.tilePlaying(host)) return 'Live';
    if (host?._hcPic === false) return 'Kein Bild';
    if (host?._hcAt && window.casoraCamAge) return window.casoraCamAge(Date.now() - host._hcAt, window.casoraCamRefresh?.(host._config?.variables) || 10);
    return 'Bereit';
  };

  // Muted tile streams exist only while visible and foregrounded. The inherited snapshot stays beneath.
  var liveTiles = new Map(), liveTimer = null, warmingPlayer = false;
  var videoIn = function (root, depth) {
    if (!root || depth > 12) return null;
    var usable = function (video) { return video && (!video.getClientRects || video.getClientRects().length); };
    var playing = function (video) { return usable(video) && !video.paused && !video.error && video.readyState >= 2; };
    var best = root.querySelector?.('video');
    if (!usable(best)) best = null;
    if (playing(best)) return best;
    var nested = root.shadowRoot && videoIn(root.shadowRoot, depth + 1);
    if (playing(nested)) return nested;
    if (!best) best = nested;
    for (var child of (root.querySelectorAll?.('*') || [])) {
      var found = child.shadowRoot && videoIn(child.shadowRoot, depth + 1);
      if (playing(found)) return found;
      if (!best) best = found;
    }
    return best;
  };
  var dropLive = function (host, st) {
    var was = st.playing;
    var video = st.player && videoIn(st.player, 0);
    video?.pause();
    st.layer?.remove();
    st.layer = st.player = null; st.playing = false;
    if (was) kick(host);
  };
  var removeTile = function (host, st) {
    dropLive(host, st); st.observer?.disconnect(); liveTiles.delete(host);
  };
  var syncLive = function (host, st) {
    var state = st.hass?.states?.[st.id], status = P.status(P.find(st.hass, st.id), st.hass.states);
    var eligible = host.isConnected && st.visible && !document.hidden && !status.dead && !status.off && !status.privacy
      && !!(Number(state?.attributes?.supported_features) & 2) && !(st.failed && Date.now() - st.failed < 300000);
    if (!eligible) { dropLive(host, st); return; }
    if (!customElements.get('ha-hls-player')) {
      // Loading picture-entity imports HA's native stream component on a fresh dashboard session.
      if (!warmingPlayer && window.loadCardHelpers) {
        warmingPlayer = true;
        window.loadCardHelpers().then(function (helpers) {
          return helpers.createCardElement({ type: 'picture-entity', entity: st.id, camera_view: 'live' });
        }).catch(function () {}).finally(function () { warmingPlayer = false; });
      }
      return;
    }
    if (!st.layer) {
      var card = host.shadowRoot?.querySelector('ha-card');
      if (!card) return;
      var layer = document.createElement('div'), player = document.createElement('ha-hls-player');
      layer.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;border-radius:inherit;opacity:0;';
      player.muted = true; player.controls = false; player.autoPlay = true; player.playsInline = true; player.allowExoPlayer = false; player.fitMode = 'cover';
      player.setAttribute('muted', '');
      player.style.cssText = 'display:block;width:100%;height:100%;--video-max-height:100%;';
      player.hass = st.hass;
      layer.appendChild(player);
      var shade = document.createElement('div');
      shade.style.cssText = 'position:absolute;inset:0;background:linear-gradient(transparent,rgba(0,0,0,.55));';
      layer.appendChild(shade); card.insertBefore(layer, card.firstChild);
      st.layer = layer; st.player = player; st.started = Date.now(); st.lastFrame = null; st.frameTime = null;
      // Request HA's live HLS endpoint explicitly: native camera auto-selection may fall back to stills.
      st.hass.callWS({ type: 'camera/stream', entity_id: st.id, format: 'hls' }).then(function (result) {
        if (st.layer !== layer || !host.isConnected) return;
        if (!result.url) throw new Error('No live stream');
        player.url = st.hass.hassUrl ? st.hass.hassUrl(result.url) : result.url;
      }).catch(function () {
        if (st.layer === layer) { st.failed = Date.now(); dropLive(host, st); }
      });
    }
    st.player.hass = st.hass;
    var video = videoIn(st.player, 0);
    if (video) {
      video.muted = true;
      video.style.objectFit = 'cover';
      if (!video.paused && !video.error && video.readyState >= 2 && st.frameTime !== video.currentTime) {
        st.frameTime = video.currentTime; st.lastFrame = Date.now();
        if (!st.playing) { st.playing = true; st.layer.style.opacity = '1'; kick(host); }
      }
    }
    if (video?.error || Date.now() - (st.lastFrame || st.started) > 20000) {
      st.failed = Date.now(); dropLive(host, st);
    }
  };
  P.sweepTiles = function () {
    clearTimeout(liveTimer); liveTimer = null;
    liveTiles.forEach(function (st, host) {
      if (!host.isConnected) removeTile(host, st);
      else syncLive(host, st);
    });
    if (liveTiles.size && !document.hidden) {
      liveTimer = setTimeout(P.sweepTiles, 1000); liveTimer.unref?.();
    }
  };
  P.tileWatch = function (host, entity, h, variables) {
    if (!host || !entity?.entity_id || !h) return;
    var st = liveTiles.get(host), wanted = variables?.live_tile === true || variables?.live_tile === 'true';
    if (st && (st.id !== entity.entity_id || !wanted || !P.is(h, entity.entity_id))) { removeTile(host, st); st = null; }
    if (!wanted || !P.is(h, entity.entity_id)) return;
    if (!st) {
      st = { id: entity.entity_id, hass: h, visible: false, playing: false };
      liveTiles.set(host, st);
      if (typeof IntersectionObserver === 'function') {
        st.observer = new IntersectionObserver(function (entries) {
          st.visible = entries.some(function (entry) { return entry.isIntersecting; });
          P.sweepTiles();
        });
        st.observer.observe(host);
      }
    }
    st.hass = h; syncLive(host, st);
    if (!liveTimer && !document.hidden) { liveTimer = setTimeout(P.sweepTiles, 1000); liveTimer.unref?.(); }
  };
  P.tilePlaying = function (host) { return !!liveTiles.get(host)?.playing; };
  document.addEventListener?.('visibilitychange', P.sweepTiles);
  window.addEventListener?.('pagehide', function () {
    clearTimeout(liveTimer); liveTimer = null;
    liveTiles.forEach(function (st, host) { removeTile(host, st); });
  });
  P.popupStyle = function () {
    return '--popup-min-width:min(1360px,94vw);--popup-max-width:min(1360px,94vw);'
      + (window.innerWidth <= 760 ? '--casora-sheet-height:calc(100dvh - env(safe-area-inset-top,0px) - 44px);' : '');
  };

  // Media browsing is lazy (popup only). At most one request per camera; responses cannot overwrite newer navigation.
  var libraries = new Map();
  P.forget = function (id) { libraries.delete(id); };
  P.library = function (id) {
    if (!libraries.has(id)) libraries.set(id, { path: null, parents: [], rows: null, busy: false, err: false, wait: new Set(), limit: 12, at: 0 });
    return libraries.get(id);
  };
  P.validMedia = function (id) { return typeof id === 'string' && (id === ROOT || id.startsWith(ROOT + '/')); };
  var browse = function (h, path) { return h.callWS({ type: 'media_source/browse_media', media_content_id: path }); };
  P.load = async function (h, c, path, el, reset) {
    if (path && !P.validMedia(path)) return;
    var lib = P.library(c.cam);
    lib.wait.forEach(function (w) { if (!w.isConnected) lib.wait.delete(w); });
    if (el) lib.wait.add(el);
    if (lib.busy || !h?.callWS) return;
    if (!reset && path == null && lib.at && Date.now() - lib.at < 60000) return;
    lib.busy = true; lib.err = false; lib.at = Date.now();
    var job = {}; lib.job = job;
    try {
      var target = path || lib.path || ROOT, data = await browse(h, target);
      if (path == null && !lib.path) {
        // Protect's device URL carries its camera ID; its media library uses the same ID.
        var camId = /\/protect\/devices\/([^/?#]+)/.exec(c.url || '')?.[1];
        if (camId) {
          var camera = (data.children || []).find(function (x) { return x.media_content_id?.endsWith(':browse:' + camId); });
          // With several NVRs the root contains consoles rather than cameras.
          if (!camera) for (var node of (data.children || []).slice(0, 8)) {
            if (!/:browse$/.test(node.media_content_id || '')) continue;
            var consoleData = await browse(h, node.media_content_id);
            camera = (consoleData.children || []).find(function (x) { return x.media_content_id?.endsWith(':browse:' + camId); });
            if (camera) break;
          }
          if (camera) { target = camera.media_content_id + ':all:recent:1'; data = await browse(h, target); lib.scope = camera.media_content_id; }
        }
      }
      if (lib.job !== job || libraries.get(c.cam) !== lib) return;
      lib.path = target; lib.rows = (data.children || []).filter(function (x) { return P.validMedia(x.media_content_id); });
      lib.title = data.title; lib.limit = 12; lib.at = Date.now(); lib.notShown = data.not_shown || 0;
    } catch (e) { if (lib.job === job) lib.err = true; }
    finally { if (lib.job === job) { lib.busy = false; lib.wait.forEach(kick); } }
  };
  P.mediaAction = function (action, cam, path) { return 'protect:' + action + ':' + encodeURIComponent(cam) + ':' + encodeURIComponent(path || ''); };
  var mediaRow = function (c, row) { return { icon: row.can_play ? 'mdi:play-circle-outline' : 'mdi:folder-outline', label: row.title,
    labelLit: true, entity: P.mediaAction(row.can_play ? 'play' : 'browse', c.cam, row.media_content_id) }; };
  var relativeFormats = new Map(), eventRefreshes = new WeakMap();
  P.eventAge = function (time, now, locale) {
    now = now == null ? Date.now() : now;
    if (!Number.isFinite(time) || time > now) return '';
    var minutes = Math.floor((now - time) / 60000);
    if (minutes < 1) return tr('gerade eben');
    var date = new Date(time), today = new Date(now);
    // Compare calendar dates without daylight-saving changes turning a day into 23 or 25 hours.
    var days = Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
      - Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000);
    var unit = minutes < 60 ? 'minute' : days < 1 ? 'hour' : days < 7 ? 'day' : days < 30 ? 'week' : days < 365 ? 'month' : 'year';
    var count = unit === 'minute' ? minutes : unit === 'hour' ? Math.floor(minutes / 60)
      : unit === 'day' ? days : unit === 'week' ? Math.floor(days / 7) : unit === 'month' ? Math.floor(days / 30) : Math.floor(days / 365);
    locale = locale || window.casoraLocale?.() || 'de';
    if (!relativeFormats.has(locale)) relativeFormats.set(locale, new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }));
    return relativeFormats.get(locale).format(-count, unit);
  };
  var refreshEvents = function (el) {
    if (!el?.isConnected || eventRefreshes.has(el)) return;
    var timer = setTimeout(function () {
      eventRefreshes.delete(el);
      if (!el.isConnected) return;
      if (!document.hidden) kick(el);
      refreshEvents(el);
    }, 30000);
    timer.unref?.(); eventRefreshes.set(el, timer);
  };
  P.sec = function (part, c, S, h, el) {
    var UI = window._casoraUI;
    if (!UI) return '';
    S = S || {};
    if (part === 'hero') return UI.line(P.tileText(P.status(c, S)) || 'Bereit', ['UniFi Protect']);
    if (part === 'events') {
      refreshEvents(el);
      var now = Date.now();
      var rows = Object.keys(c.events).map(function (kind) {
        var st = S[c.events[kind]], time = Date.parse(st?.state);
        return Number.isFinite(time) && time <= now ? { icon: icon[kind] || 'mdi:eye-outline', label: label[kind], value: P.eventAge(time, now, window.casoraLocale?.() || h?.locale?.language || h?.language), valueLit: true, entity: c.events[kind] } : null;
      }).filter(Boolean);
      return rows.length ? UI.group(rows, 'Letzte Ereignisse') : '';
    }
    if (part === 'media' || part === 'media-nav') {
      var lib = P.library(c.cam);
      P.load(h, c, null, el);
      var rows = [];
      if (lib.parents.length) rows.push({ icon: 'mdi:arrow-left', label: 'Zurück', entity: P.mediaAction('back', c.cam) });
      if (lib.scope) {
        rows.push({ icon: 'mdi:calendar-today', label: 'Letzte 24 Stunden', entity: P.mediaAction('browse', c.cam, lib.scope + ':all:recent:1') });
        rows.push({ icon: 'mdi:calendar-week', label: 'Letzte 7 Tage', entity: P.mediaAction('browse', c.cam, lib.scope + ':all:recent:7') });
        if (c.events.ring || c.ring) rows.push({ icon: 'mdi:doorbell', label: 'Klingeldrücke', entity: P.mediaAction('browse', c.cam, lib.scope + ':ring:recent:7') });
      }
      if (lib.err) rows.push({ icon: 'mdi:information-outline', label: 'Aufnahmen nicht abrufbar', sub: 'UniFi Protect benötigt Vollzugriff für Ereignisclips' });
      else if (!lib.rows) rows.push({ label: 'Wird geladen …' });
      else if (!lib.rows.length) rows.push({ label: 'Keine Ereignisclips in diesem Zeitraum' });
      else if (part === 'media') rows = rows.concat(lib.rows.slice(0, lib.limit).map(function (r) { return mediaRow(c, r); }));
      if (part === 'media' && lib.rows?.length > lib.limit) rows.push({ label: 'Mehr anzeigen', entity: P.mediaAction('more', c.cam) });
      rows.push({ icon: 'mdi:refresh', label: 'Aktualisieren', entity: P.mediaAction('refresh', c.cam) });
      if (lib.scope) rows.push({ icon: 'mdi:folder-outline', label: 'Alle Zeiträume', entity: P.mediaAction('browse', c.cam, lib.scope) });
      if (lib.notShown) rows.push({ label: 'Weitere Ereignisse verfügbar', sub: 'Einen kürzeren Zeitraum wählen' });
      return UI.group(rows, 'Ereignisclips');
    }
    if (part === 'controls') {
      var rows = Object.keys(c.sw).map(function (key) {
        var id = c.sw[key], st = S[id];
        if (!st || bad(st.state)) return null;
        var on = st.state === 'on', name = { privacy_mode: 'Privatsphäre', status_light: 'Statuslicht', system_sounds: 'Systemtöne', motion: 'Bewegungserkennung', detections_person: 'Personenerkennung', detections_vehicle: 'Fahrzeugerkennung', detections_package: 'Paketerkennung', detections_animal: 'Tiererkennung' }[key];
        return { label: name, icon: 'mdi:cog-outline', value: on ? 'An' : 'Aus',
          svc: { domain: 'switch', service: on ? 'turn_off' : 'turn_on', target: { entity_id: id } },
          confirm: key === 'privacy_mode' || (on && key !== 'status_light' && key !== 'system_sounds') ? 'Einstellung ändern?' : null };
      }).filter(Boolean);
      var out = rows.length ? UI.group(rows, 'Einstellungen') : '';
      Object.keys(c.select).forEach(function (key) {
        var id = c.select[key], st = S[id];
        if (!st || bad(st.state) || !Array.isArray(st.attributes.options)) return;
        var options = st.attributes.options.map(function (value) {
          return { label: value, labelLit: true, value: st.state === value ? 'Aktiv' : '',
            svc: { domain: 'select', service: 'select_option', data: { option: value }, target: { entity_id: id } },
            confirm: key === 'recording_mode' && value === 'never' ? 'Aufnahme ausschalten?' : null };
        });
        var group = UI.group(options, { doorbell_text: 'Türklingel-Display', recording_mode: 'Aufnahmemodus', infrared_mode: 'Nachtsicht' }[key]);
        out += window._casoraSelRows ? window._casoraSelRows(group, st.state) : group;
      });
      return out ? UI.more('protect-settings-' + c.cam, out, { label: 'Einstellungen', less: 'Einstellungen' }) : '';
    }
    return '';
  };
  P.popup = function (entity, S, h, variables) {
    var K = window._casoraSoftKit, id = entity?.entity_id;
    if (!K || !P.is(h, id)) return { type: 'vertical-stack', cards: [] };
    var c = P.find(h, id), watch = P.watch(c), v = variables || {};
    var section = function (part) { return { card: K.secCard(watch,
      'return window._casoraProtect?.sec(' + JSON.stringify(part) + ',' + JSON.stringify(c) + ',states,hass,this) || "";', S) }; };
    var second = /^camera\.[a-z0-9_]+$/.test(v.camera2 || '') && v.camera2 !== id ? v.camera2 : c.package;
    var fields = { hero: section('hero'), live: { card: { type: 'custom:casora-protect-viewer', entity: id,
      privacy: c.sw.privacy_mode, talk: false, big: true, cam2: second, cam2Name: second === c.package ? tr('Paketkamera') : h.states[second]?.attributes?.friendly_name } },
      media: { card: { type: 'custom:casora-protect-media', entity: id, event_view: v.event_view || 'list' } }, events: section('events'), controls: section('controls') };
    if (window.innerWidth <= 760) {
      fields.live.card.compact = true; fields.media.card.compact = true; fields.media.card.shared_scroll = true;
      return K.layout({ fields: { hero: fields.hero, phone: { card: { type: 'custom:casora-protect-phone',
        viewer: fields.live.card, events: fields.events.card, media: fields.media.card, controls: fields.controls.card } } },
        top: ['hero', 'phone'], left: [], right: [] });
    }
    return K.layout({ fields: fields, top: ['hero'], left: ['live', 'events'], right: ['media', 'controls'], narrowOrder: ['live', 'events', 'media', 'controls'] });
  };
  // Keep the phone viewer fixed above one shared scroller for all remaining popup content.
  if (typeof customElements !== 'undefined' && !customElements.get('casora-protect-phone')) {
    customElements.define('casora-protect-phone', class extends HTMLElement {
      constructor() { super(); this.attachShadow({ mode: 'open' }); this._seq = 0; this._cards = []; }
      setConfig(cfg) { this._cfg = cfg; if (this.isConnected) this._build(); }
      set hass(h) { this._h = h; this._cards.forEach(function (card) { card.hass = h; }); }
      connectedCallback() { this._build(); }
      disconnectedCallback() { this._seq++; this._resize?.disconnect(); this._cards = []; this.shadowRoot.textContent = ''; }
      async _build() {
        if (!this._cfg || !window.loadCardHelpers) return;
        var seq = ++this._seq;
        this._resize?.disconnect(); this._cards = []; this.shadowRoot.textContent = '';
        var helpers = await window.loadCardHelpers();
        if (!this.isConnected || seq !== this._seq) return;
        this.style.cssText = 'display:block;min-width:0;';
        var style = document.createElement('style');
        style.textContent = ':host{--casora-protect-feed-height:clamp(90px,22dvh,200px)}'
          + '.panes{height:var(--casora-protect-phone-height,65dvh);display:grid;grid-template-rows:auto minmax(0,1fr);gap:var(--casora-space-3);min-height:0;}'
          + '.details{min-height:0;min-width:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}'
          + '.details>*{display:block;margin-bottom:var(--casora-space-3);}';
        this.shadowRoot.appendChild(style);
        var panes = document.createElement('div'); panes.className = 'panes'; this.shadowRoot.appendChild(panes);
        for (var part of ['viewer', 'details']) {
          var pane = document.createElement('div'); pane.className = part;
          if (part !== 'viewer') { pane.setAttribute('role', 'region'); pane.setAttribute('aria-label', tr('Letzte Ereignisse') + ' / ' + tr('Ereignisclips')); pane.tabIndex = 0; }
          panes.appendChild(pane);
          var configs = part === 'details' ? [this._cfg.events, this._cfg.media, this._cfg.controls] : [this._cfg.viewer];
          for (var config of configs) {
            var card = await helpers.createCardElement(config);
            if (!this.isConnected || seq !== this._seq) return;
            if (config === this._cfg.media) card.scrollRoot = pane;
            card.hass = this._h; pane.appendChild(card); this._cards.push(card);
          }
        }
        // Observe the actual shared popup body: header size, safe areas and rotation vary by device.
        var node = this;
        while (node && !node.classList?.contains('content')) node = node.parentElement || node.getRootNode?.().host;
        this._content = node;
        this._fit = () => {
          if (!this.isConnected || !this._content) return;
          var body = this._content.getBoundingClientRect(), own = this.getBoundingClientRect(), bottom = 16;
          var ancestor = this.parentElement || this.getRootNode?.().host;
          while (ancestor && ancestor !== this._content) {
            var css = window.getComputedStyle?.(ancestor);
            bottom += (parseFloat(css?.paddingBottom) || 0) + (parseFloat(css?.borderBottomWidth) || 0);
            ancestor = ancestor.parentElement || ancestor.getRootNode?.().host;
          }
          this.style.setProperty('--casora-protect-phone-height', Math.max(0, body.bottom - own.top - bottom) + 'px');
        };
        if (typeof ResizeObserver === 'function') {
          this._resize = new ResizeObserver(this._fit);
          if (node) this._resize.observe(node);
          this._resize.observe(this);
        }
        this._fit();
      }
      getCardSize() { return 8; }
    });
  }
  // Each open popup owns its viewer; selecting a clip never rebuilds the popup or its event list.
  var viewers = new Map();
  P.play = function (h, c, media) {
    if (!P.validMedia(media)) return false;
    var title = P.library(c.cam).rows?.find(function (row) { return row.media_content_id === media; })?.title || tr('Ereignisclip');
    var played = false;
    viewers.get(c.cam)?.forEach(function (viewer) {
      if (viewer.isConnected) { viewer.play(media, title); played = true; }
    });
    return played;
  };
  if (typeof customElements !== 'undefined' && !customElements.get('casora-protect-viewer')) {
    customElements.define('casora-protect-viewer', class extends HTMLElement {
      constructor() { super(); this.attachShadow({ mode: 'open' }); }
      setConfig(cfg) {
        this._unregister(); this._cfg = cfg; this._media = null;
        if (this.isConnected) { this._register(); this._render(); }
      }
      set hass(h) { this._h = h; if (this._child) this._child.hass = h; else if (this.isConnected) this._render(); }
      connectedCallback() {
        this.style.cssText = 'display:block;position:relative;z-index:1;min-width:0;width:100%;';
        this._register(); this._render();
      }
      disconnectedCallback() { this._unregister(); this._drop(); this._media = null; }
      _register() {
        var cam = this._cfg?.entity;
        if (!cam) return;
        if (!viewers.has(cam)) viewers.set(cam, new Set());
        viewers.get(cam).add(this); this._registered = cam;
      }
      _unregister() {
        var set = viewers.get(this._registered);
        set?.delete(this);
        if (set && !set.size) viewers.delete(this._registered);
        this._registered = null;
      }
      _drop() { this._child?.remove(); this._child = null; this.shadowRoot.textContent = ''; }
      play(media, title) {
        if (!P.validMedia(media) || !this.isConnected) return;
        this._media = media; this._title = title || tr('Ereignisclip'); this._render();
      }
      live() { this._media = null; this._render(); }
      _render() {
        if (!this.isConnected || !this._cfg || !this._h) return;
        this._drop();
        if (this._media) {
          var bar = document.createElement('div'), back = document.createElement('button'), title = document.createElement('span');
          bar.style.cssText = 'display:flex;align-items:center;flex-wrap:' + (this._cfg.compact ? 'nowrap' : 'wrap') + ';gap:var(--casora-space-3);margin-bottom:var(--casora-space-3);';
          back.type = 'button'; back.textContent = tr('Zurück zur Live-Ansicht');
          back.style.cssText = 'flex-shrink:0;min-height:44px;padding:var(--casora-space-3) var(--casora-space-4);border:0;border-radius:var(--casora-r-pill);background:var(--casora-soft-control-fill);color:var(--primary-text-color);font:inherit;cursor:pointer;';
          back.onclick = () => this.live();
          title.textContent = this._title;
          title.style.cssText = (this._cfg.compact ? 'white-space:nowrap;text-overflow:ellipsis;overflow:hidden;' : '') + 'min-width:0;overflow-wrap:anywhere;font-size:var(--casora-fs-sub);color:var(--secondary-text-color);';
          bar.appendChild(back); bar.appendChild(title); this.shadowRoot.appendChild(bar);
        }
        var child = document.createElement(this._media ? 'casora-protect-clip' : 'casora-klingel-live');
        child.setConfig(this._media ? { media: this._media, autoplay: true, compact: !!this._cfg.compact } : Object.assign({}, this._cfg, { type: 'custom:casora-klingel-live' }));
        child.hass = this._h; this._child = child; this.shadowRoot.appendChild(child);
        if (this._cfg.compact && !this._media && child.shadowRoot) {
          // Scope the feed height to this embedded live player; its full-screen stage stays unconstrained.
          var compactStyle = document.createElement('style');
          compactStyle.textContent = '.st:not(.big) .fr{height:var(--casora-protect-feed-height,22dvh);aspect-ratio:auto;}';
          child.shadowRoot.appendChild(compactStyle);
        }
      }
      getCardSize() { return 5; }
    });
  }
  P.mediaClick = function (mid) {
    var m = /^protect:([^:]+):([^:]*):(.*)$/.exec(String(mid));
    if (!m) return false;
    var cam, path;
    try { cam = decodeURIComponent(m[2]); path = decodeURIComponent(m[3]); } catch (e) { return true; }
    var h = currentHass();
    if (!P.is(h, cam)) return true;
    var c = P.find(h, cam), lib = P.library(cam);
    if (m[1] === 'play') { P.play(h, c, path); return true; }
    if (lib.busy) return true;
    if (m[1] === 'more') lib.limit += 12;
    else if (m[1] === 'refresh') P.load(h, c, lib.path, null, true);
    else if (m[1] === 'back') { var parent = lib.parents.pop(); if (parent) P.load(h, c, parent, null, true); }
    else if (m[1] === 'browse' && P.validMedia(path)) { if (lib.path) lib.parents.push(lib.path); P.load(h, c, path, null, true); }
    lib.wait.forEach(kick);
    return true;
  };
  (window._casoraMiHooks = window._casoraMiHooks || []).push(P.mediaClick);
  // Gallery rendering and thumbnail requests are incremental; HA returns the selected period's metadata in one response.
  P.thumbnailMedia = function (row) {
    return row?.can_play && P.validMedia(row.media_content_id) && /:event:[^:]+$/.test(row.media_content_id)
      ? row.media_content_id.replace(/:event:([^:]+)$/, ':eventthumb:$1') : null;
  };
  if (typeof customElements !== 'undefined' && !customElements.get('casora-protect-media')) {
    customElements.define('casora-protect-media', class extends HTMLElement {
      constructor() {
        super(); this.attachShadow({ mode: 'open' }); this._generation = 0; this._active = 0; this._queue = []; this._thumbCache = new Map();
        this.shadowRoot.addEventListener('click', (event) => {
          var row = event.target.closest?.('[data-casora-mi]');
          if (!row) return;
          event.stopPropagation(); P.mediaClick(row.getAttribute('data-casora-mi'));
        });
        this.shadowRoot.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          var row = event.target.closest?.('[data-casora-mi]');
          if (!row) return;
          event.preventDefault(); event.stopPropagation(); P.mediaClick(row.getAttribute('data-casora-mi'));
        });
      }
      setConfig(cfg) { this._detach(); this._cfg = cfg; this._view = cfg.event_view === 'gallery' ? 'gallery' : 'list'; this._key = null; this._sync(); }
      set hass(h) { this._h = h; this._sync(); }
      connectedCallback() { this.style.cssText = 'display:block;position:relative;z-index:1;min-width:0;'; this._sync(); }
      disconnectedCallback() { this._detach(); this._thumbCache.clear(); }
      _detach() {
        this._generation++; this._thumbObserver?.disconnect(); this._moreObserver?.disconnect(); this._queue = [];
        if (this._cfg) P.library(this._cfg.entity).wait.delete(this);
      }
      requestUpdate() { this._sync(); }
      _sync() {
        if (!this.isConnected || !this._h || !this._cfg) return;
        var c = P.find(this._h, this._cfg.entity), lib = P.library(c.cam);
        P.load(this._h, c, null, this);
        var key = [lib.path, lib.at, lib.busy, lib.err, lib.limit, lib.rows?.length, this._view].join('|');
        if (key === this._key) return;
        this._key = key; this._render(c, lib);
      }
      _render(c, lib) {
        var samePath = this._path === lib.path, position = samePath ? (this.scrollRoot || this._pane)?.scrollTop || 0 : 0;
        var keep = samePath ? this._shown || 12 : 12;
        this._generation++; this._queue = []; this._thumbObserver?.disconnect(); this._moreObserver?.disconnect();
        this._path = lib.path; this.shadowRoot.textContent = '';
        if (this._cfg.compact && !this._cfg.shared_scroll) {
          var style = document.createElement('style');
          style.textContent = ':host{height:100%;display:flex!important;flex-direction:column;min-height:0;}'
            + '.nav{min-height:0;overflow-y:auto;overscroll-behavior:contain;}'
            + '.gallery-nav{flex:none;max-height:50%;}.gallery-pane{flex:1;min-height:0;max-height:none!important;}'
            + '.gallery-nav>label,.gallery-nav>.hui-lbl{display:none;}';
          this.shadowRoot.appendChild(style);
        }
        var tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;gap:var(--casora-space-2);margin-bottom:var(--casora-space-3);';
        ['list', 'gallery'].forEach((view) => {
          var button = document.createElement('button'); button.type = 'button';
          button.textContent = tr(view === 'gallery' ? 'Galerie' : 'Liste');
          button.setAttribute('aria-pressed', String(this._view === view));
          button.style.cssText = 'min-height:44px;padding:var(--casora-space-3) var(--casora-space-4);border:0;border-radius:var(--casora-r-pill);font:inherit;cursor:pointer;'
            + 'background:var(' + (this._view === view ? '--casora-soft-seg-on' : '--casora-soft-control-fill') + ');color:var(--primary-text-color);';
          button.onclick = () => { this._view = view; this._sync(); };
          tabs.appendChild(button);
        });
        this.shadowRoot.appendChild(tabs);
        var nav = document.createElement('div'); nav.className = this._view === 'gallery' ? 'nav gallery-nav' : 'nav'; nav.tabIndex = 0;
        nav.innerHTML = window.casoraTr ? window.casoraTr(P.sec(this._view === 'gallery' ? 'media-nav' : 'media', c, this._h.states, this._h, this)) : P.sec(this._view === 'gallery' ? 'media-nav' : 'media', c, this._h.states, this._h, this);
        if (this._view === 'gallery' && !lib.err && lib.rows?.length) this._galleryNav(c, lib, nav);
        this.shadowRoot.appendChild(nav);
        this._pane = this._grid = null;
        if (this._view !== 'gallery' || lib.err || !lib.rows?.length) return;
        var pane = this._pane = document.createElement('div'), grid = this._grid = document.createElement('div');
        pane.className = 'gallery-pane';
        pane.style.cssText = this._cfg.shared_scroll ? 'position:relative;overflow:visible;'
          : 'max-height:60vh;overflow-y:auto;overscroll-behavior:contain;position:relative;';
        pane.setAttribute('role', 'region'); pane.setAttribute('aria-label', tr('Ereignisgalerie')); pane.tabIndex = 0;
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(min(150px,100%),1fr));gap:var(--casora-space-3);';
        var more = this._more = document.createElement('button'); more.type = 'button'; more.textContent = tr('Mehr anzeigen');
        more.style.cssText = 'display:block;width:100%;min-height:44px;margin-top:var(--casora-space-3);padding:var(--casora-space-3);border:0;border-radius:var(--casora-r-pill);background:var(--casora-soft-control-fill);color:var(--primary-text-color);font:inherit;cursor:pointer;';
        more.onclick = () => this._append(lib);
        pane.appendChild(grid); pane.appendChild(more); this.shadowRoot.appendChild(pane);
        var generation = this._generation;
        if (typeof IntersectionObserver === 'function') {
          this._thumbObserver = new IntersectionObserver((entries) => {
            if (!this.isConnected || generation !== this._generation) return;
            entries.forEach((entry) => {
              if (!entry.isIntersecting || !entry.target._protectThumb) return;
              this._thumbObserver.unobserve(entry.target);
              this._enqueue(entry.target, entry.target._protectThumb);
            });
          }, { root: this.scrollRoot || pane, rootMargin: '120px' });
          this._moreObserver = new IntersectionObserver((entries) => {
            if (!this.isConnected || generation !== this._generation) return;
            if (entries.some((entry) => entry.isIntersecting)) this._append(lib);
          }, { root: this.scrollRoot || pane });
        }
        this._shown = 0; this._append(lib, keep);
        if (!this.scrollRoot || samePath) (this.scrollRoot || pane).scrollTop = position;
      }
      _galleryNav(c, lib, nav) {
        nav.innerHTML = this._cfg.compact && !this._cfg.shared_scroll ? '' : window._casoraUI.label?.(tr('Ereignisclips')) || '';
        var controls = document.createElement('div');
        controls.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:var(--casora-space-2);margin-bottom:var(--casora-space-3);';
        var controlStyle = 'min-height:44px;padding:var(--casora-space-3);border:0;border-radius:var(--casora-r-pill);background:var(--casora-soft-control-fill);color:var(--primary-text-color);font:inherit;cursor:pointer;';
        if (lib.scope) {
          var select = document.createElement('select'); select.setAttribute('aria-label', tr('Zeitraum'));
          select.style.cssText = controlStyle + 'min-width:0;max-width:100%;';
          var periods = [[lib.scope + ':all:recent:1', 'Letzte 24 Stunden'], [lib.scope + ':all:recent:7', 'Letzte 7 Tage']];
          if (c.events.ring || c.ring) periods.push([lib.scope + ':ring:recent:7', 'Klingeldrücke']);
          periods.push([lib.scope, 'Alle Zeiträume']);
          if (!periods.some(function (period) { return period[0] === lib.path; })) periods.push([lib.path, lib.title || tr('Zeitraum')]);
          periods.forEach(function (period) {
            var option = document.createElement('option'); option.value = period[0]; option.textContent = tr(period[1]); select.appendChild(option);
          });
          select.value = lib.path;
          select.onchange = () => P.mediaClick(P.mediaAction('browse', c.cam, select.value));
          controls.appendChild(select);
        }
        var button = (text, action) => {
          var el = document.createElement('button'); el.type = 'button'; el.textContent = tr(text); el.style.cssText = controlStyle;
          el.onclick = () => P.mediaClick(P.mediaAction(action, c.cam)); controls.appendChild(el);
        };
        if (lib.parents.length) button('Zurück', 'back');
        button('Aktualisieren', 'refresh'); nav.appendChild(controls);
        if (lib.notShown) {
          var note = document.createElement('p'); note.textContent = tr('Weitere Ereignisse verfügbar') + ' · ' + tr('Einen kürzeren Zeitraum wählen'); nav.appendChild(note);
        }
      }
      _append(lib, amount) {
        if (!this.isConnected || !this._grid || this._path !== lib.path) return;
        this._moreObserver?.unobserve(this._more);
        var end = Math.min(lib.rows.length, this._shown + (amount || 12));
        for (; this._shown < end; this._shown++) {
          var row = lib.rows[this._shown], button = document.createElement('button');
          button.type = 'button'; button.setAttribute('aria-label', row.title || tr('Ereignisclip'));
          button.style.cssText = 'display:flex;flex-direction:column;min-width:0;padding:0;border:0;border-radius:var(--casora-r-element);overflow:hidden;background:var(--casora-popup-row-fill);color:var(--primary-text-color);font:inherit;text-align:start;cursor:pointer;';
          var picture = document.createElement('div'), placeholder = document.createElement('span'), caption = document.createElement('span');
          picture.style.cssText = 'position:relative;width:100%;aspect-ratio:16/9;display:grid;place-items:center;background:var(--casora-soft-control-fill);';
          placeholder.textContent = tr(row.can_play ? 'Vorschaubild' : 'Ordner');
          placeholder.style.cssText = 'font-size:var(--casora-fs-sub);color:var(--secondary-text-color);padding:var(--casora-space-2);';
          picture.appendChild(placeholder);
          caption.textContent = row.title || tr('Ereignisclip');
          caption.style.cssText = 'padding:var(--casora-space-3);font-size:var(--casora-fs-sub);overflow-wrap:anywhere;';
          button.appendChild(picture); button.appendChild(caption);
          button.onclick = ((selected) => () => P.mediaClick(P.mediaAction(selected.can_play ? 'play' : 'browse', this._cfg.entity, selected.media_content_id)))(row);
          this._grid.appendChild(button);
          var media = P.thumbnailMedia(row);
          if (media) {
            button._protectThumb = { media: media, picture: picture, placeholder: placeholder };
            if (this._thumbObserver) this._thumbObserver.observe(button);
            else this._enqueue(button, button._protectThumb);
          }
        }
        this._more.hidden = this._shown >= lib.rows.length;
        if (!this._more.hidden) this._moreObserver?.observe(this._more);
      }
      _enqueue(button, info) {
        this._queue.push({ button: button, info: info, generation: this._generation }); this._drain();
      }
      _drain() {
        while (this.isConnected && this._active < 4 && this._queue.length) {
          var job = this._queue.shift(); this._active++; this._thumbnail(job);
        }
      }
      async _thumbnail(job) {
        var info = job.info;
        try {
          var cached = this._thumbCache.get(info.media), url;
          if (cached && cached.until > Date.now()) url = cached.url;
          else {
            var result = await this._h.callWS({ type: 'media_source/resolve_media', media_content_id: info.media });
            var parsed = new URL(result.url, window.location.origin);
            if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== window.location.origin) throw new Error('Unexpected thumbnail origin');
            url = parsed.href;
            if (!this.isConnected || job.generation !== this._generation) return;
            this._thumbCache.set(info.media, { url: url, until: Date.now() + 240000 });
            if (this._thumbCache.size > 128) this._thumbCache.delete(this._thumbCache.keys().next().value);
          }
          if (!this.isConnected || job.generation !== this._generation) return;
          var image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
          image.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
          image.onerror = () => { image.remove(); info.placeholder.textContent = tr('Kein Vorschaubild'); };
          image.src = url; info.picture.appendChild(image);
        } catch (e) {
          if (this.isConnected && job.generation === this._generation) info.placeholder.textContent = tr('Kein Vorschaubild');
        } finally { this._active--; this._drain(); }
      }
      getCardSize() { return 8; }
    });
  }
  (window._casoraHeadSwitchHooks = window._casoraHeadSwitchHooks || []).push(function (src) {
    return [].concat(src?._config?.template || []).includes('casora_unifi_protect') ? false : null;
  });

  // Resolve signed playback URLs only when a clip is opened. Never persist URLs or Protect credentials.
  if (typeof customElements !== 'undefined' && !customElements.get('casora-protect-clip')) {
    customElements.define('casora-protect-clip', class extends HTMLElement {
      constructor() { super(); this.attachShadow({ mode: 'open' }); this._seq = 0; }
      _style() { this.style.display = 'block'; this.style.width = '100%'; this.style.minWidth = '0'; this.style.position = 'relative'; this.style.zIndex = '1'; }
      setConfig(cfg) { this._cfg = cfg; this._loaded = false; this._seq++; if (this.isConnected) this._load(); }
      set hass(h) { this._h = h; if (this.isConnected) this._load(); }
      connectedCallback() { this._style(); this._load(); }
      disconnectedCallback() { this._seq++; this._loaded = false; this._video?.pause(); this._video?.removeAttribute('src'); this._video?.load(); }
      async _load() {
        if (this._loaded || !this._h || !P.validMedia(this._cfg?.media)) return;
        this._loaded = true;
        var seq = ++this._seq;
        this.shadowRoot.textContent = tr('Wird geladen …');
        try {
          var result = await this._h.callWS({ type: 'media_source/resolve_media', media_content_id: this._cfg.media });
          if (!this.isConnected || seq !== this._seq) return;
          var url = new URL(result.url, window.location.origin);
          if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin) throw new Error('Unexpected media origin');
          this.shadowRoot.textContent = '';
          var video = document.createElement('video'); this._video = video;
          video.controls = true; video.playsInline = true; video.preload = 'metadata';
          video.muted = !!this._cfg.autoplay;
          video.style.cssText = 'position:relative;z-index:1;display:block;width:100%;height:auto;max-height:' + (this._cfg.compact ? 'var(--casora-protect-feed-height,22dvh)' : '60vh') + ';object-fit:contain;background:var(--primary-text-color);border-radius:var(--casora-r-row);';
          video.src = url.href;
          video.addEventListener('error', () => { if (seq === this._seq) this.shadowRoot.textContent = tr('Aufnahmen nicht abrufbar'); });
          this.shadowRoot.appendChild(video);
          if (this._cfg.autoplay) video.play().catch(function () { /* Native controls remain available if autoplay is denied. */ });
          var save = document.createElement('button');
          save.textContent = tr('Herunterladen');
          save.style.cssText = 'position:relative;z-index:1;margin-top:var(--casora-space-3);padding:var(--casora-space-3) var(--casora-space-4);border:0;border-radius:var(--casora-r-pill);background:var(--casora-soft-control-fill);color:var(--primary-text-color);font:inherit;cursor:pointer;';
          save.onclick = async () => {
            save.disabled = true;
            try {
              var response = await fetch(url.href, { credentials: 'same-origin' });
              if (!response.ok) throw new Error('Download failed');
              var objectUrl = URL.createObjectURL(await response.blob());
              var link = document.createElement('a'); link.href = objectUrl; link.download = 'UniFi Protect clip.mp4'; link.click();
              setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
            } catch (e) { save.textContent = tr('Aufnahmen nicht abrufbar'); }
            finally { save.disabled = false; }
          };
          this.shadowRoot.appendChild(save);
        } catch (e) { if (seq === this._seq && this.isConnected) this.shadowRoot.textContent = tr('Aufnahmen nicht abrufbar'); }
      }
      getCardSize() { return 5; }
    });
  }
})();
