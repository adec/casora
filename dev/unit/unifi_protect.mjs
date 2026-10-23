// Protect card without HA: renamed entities, device isolation, events, media navigation and lifecycle.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const registry = new Map();
globalThis.window = globalThis;
globalThis.document = { querySelector: () => ({ hass }) };
globalThis.HTMLElement = class {
  constructor() { this.style = {}; }
  attachShadow() {
    this.shadowRoot = { children: [], set textContent(value) { this.children = []; this.text = value; },
      get textContent() { return this.text || ''; }, appendChild(child) { this.children.push(child); } };
  }
};
globalThis.customElements = { get: n => registry.get(n), define: (n, c) => registry.set(n, c) };
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/27-unifi-protect.js', import.meta.url), 'utf8'))();
const P = window._casoraProtect, S = {}, R = {};
const now = Date.now();
function add(id, key, state, attrs = {}, device = 'door', platform = 'unifiprotect') {
  R[id] = { platform, device_id: device, translation_key: key };
  S[id] = { entity_id: id, state, attributes: attrs, last_changed: new Date(now - 1000).toISOString() };
}
add('camera.entrance', null, 'recording', { channel_id: 1, supported_features: 2 });
add('camera.parcel', null, 'recording', { channel_id: 3 });
add('camera.other', null, 'idle', { channel_id: 0 }, 'other');
add('camera.foreign', null, 'idle', {}, 'foreign', 'generic');
add('event.renamed_button', 'doorbell', new Date(now - 60000).toISOString());
add('event.parcel_seen', 'package', 'unknown');
add('event.motion_seen', 'motion_detection', 'unknown');
add('binary_sensor.somebody', 'person_detected', 'on');
add('binary_sensor.engine', 'vehicle_detected', 'off');
add('binary_sensor.movement', null, 'off', { device_class: 'motion' });
add('binary_sensor.someone_else', 'person_detected', 'on', {}, 'other');
add('switch.private', 'privacy_mode', 'off');
add('switch.detect', 'detections_person', 'on');
add('select.screen', 'doorbell_text', 'WELCOME', { options: ['WELCOME', '<script>alert(1)</script>'] });
add('select.record', 'recording_mode', 'always', { options: ['always', 'never'] });
const hass = { entities: R, states: S, devices: { door: { configuration_url: 'https://console.example/protect/devices/cam123' } } };
const c = P.find(hass, 'camera.entrance');
assert.equal(P.is(hass, c.cam), true);
assert.equal(P.is(hass, 'camera.foreign'), false);
assert.equal(c.package, 'camera.parcel');
assert.equal(c.events.ring, 'event.renamed_button');
assert.deepEqual(c.det, { person: 'binary_sensor.somebody', vehicle: 'binary_sensor.engine' });
assert.ok(P.watch(c).includes('select.screen'));
assert.equal(P.tileText(P.status(c, S, now)), 'Hat geklingelt');
S[c.events.ring].state = 'unknown';
assert.equal(P.tileText(P.status(c, S, now)), 'Person erkannt');
S['switch.private'].state = 'on'; S[c.cam].state = 'unavailable';
assert.equal(P.tileText(P.status(c, S, now)), 'Privatsphäre an');
S['switch.private'].state = 'off';
assert.equal(P.tileText(P.status(c, S, now)), 'Offline');
S[c.cam].state = 'off'; assert.equal(P.tileText(P.status(c, S, now)), 'Aus');
S[c.cam].state = 'recording'; S['binary_sensor.somebody'].state = 'off';
assert.equal(P.tileText(P.status(c, S, now)), null);
S[c.events.ring].state = new Date(now + 100000).toISOString();
assert.equal(P.status(c, S, now).ring, null, 'future events are not rings');
assert.equal(P.status(c, {}, now).dead, true);
const early = { ...hass, states: {} };
assert.equal(P.find(early, c.cam).package, null);
assert.equal(P.find(hass, c.cam).package, 'camera.parcel', 'late state arrival is rediscovered');
R['camera.parcel'].disabled_by = 'user';
assert.equal(P.find(hass, c.cam).package, null);
R['camera.parcel'].disabled_by = null;
// Minimal shared UI and layout stubs inspect actions instead of duplicating rendering.
window._casoraUI = { line: (a,b) => JSON.stringify([a,b]), group: (rows,title) => JSON.stringify({ rows,title }), more: (_,out) => out };
window._casoraSoftKit = { secCard: (watch,code) => ({ watch, code }), layout: x => x };
const popup = P.popup(S[c.cam], S, hass, {});
assert.equal(popup.fields.live.card.cam2, 'camera.parcel');
assert.equal(popup.fields.live.card.talk, false, 'no unsupported talk control');
assert.equal(P.popup(S[c.cam], S, hass, { camera2: 'camera.other' }).fields.live.card.cam2, 'camera.other');
assert.deepEqual(P.popup(S['camera.foreign'], S, hass, {}), {type:'vertical-stack',cards:[]});
const controls = P.sec('controls', c, S, hass);
assert.ok(controls.includes('Change this setting') === false);
assert.ok(controls.includes('Einstellung ändern?'));
assert.ok(controls.includes('Aufnahme ausschalten?'));
assert.ok(controls.includes('select_option'));
const root = 'media-source://unifiprotect';
const cameraPath = root + '/nvr:browse:cam123';
const folder = { title: 'Entry', media_content_id: cameraPath, can_expand: true };
const clip = { title: 'Recent event', media_content_id: root + '/nvr:event:event123', can_play: true };
const calls = [];
hass.callWS = async m => { calls.push(m); return m.media_content_id === root ? { children: [folder] } : { title: 'Today', children: [clip] }; };
await P.load(hass, c);
assert.deepEqual(calls.map(x => x.media_content_id), [root, cameraPath + ':all:recent:1']);
assert.equal(P.library(c.cam).scope, cameraPath);
assert.equal(P.library(c.cam).rows.length, 1);
await P.load(hass, c);
assert.equal(calls.length, 2, 'popup cache avoids repeated browsing');
assert.equal(P.validMedia('javascript:alert(1)'), false);
assert.equal(P.validMedia(root + '-evil/x'), false);
assert.equal(P.validMedia(clip.media_content_id), true);
assert.ok(P.sec('media', c, S, hass).includes('Klingeldrücke'));
const hook = window._casoraMiHooks.at(-1);
assert.equal(hook('unrelated'), false);
assert.equal(hook(P.mediaAction('browse', c.cam, 'javascript:alert(1)')), true);
assert.equal(calls.length, 2);
P.forget(c.cam);
let rejectCount = 0;
const noAccess = { ...hass, callWS: async () => { rejectCount++; throw Error('no media source'); } };
await P.load(noAccess, c);
await P.load(noAccess, c);
assert.equal(rejectCount, 1, 'access failure is cached, not retried on every render');
assert.ok(P.sec('media', c, S, noAccess).includes('Vollzugriff'));
// A stale response after popup reset must not populate the new session.
P.forget(c.cam);
let finish;
const pending = { ...hass, callWS: () => new Promise(resolve => { finish = resolve; }) };
const job = P.load(pending, c, cameraPath);
P.forget(c.cam); finish({ children: [clip] }); await job;
assert.equal(P.library(c.cam).rows, null);
// Multiple consoles: resolve only the matching camera, never a similarly named camera.
P.forget(c.cam);
const multiCalls = [];
const multi = { ...hass, callWS: async m => {
  multiCalls.push(m.media_content_id);
  return m.media_content_id === root ? {children:[{media_content_id:root+'/nvr:browse'}]}
    : m.media_content_id.endsWith(':browse') ? {children:[folder]} : {children:[clip]};
} };
await P.load(multi,c);
assert.equal(multiCalls.length,3);
assert.equal(P.library(c.cam).scope,cameraPath);
// Disconnect while resolving a clip: no late playback, and reattach can retry.
const Clip = registry.get('casora-protect-clip');
const player = new Clip(); player.isConnected = true;
player.setConfig({media:clip.media_content_id});
let resolve;
player.hass = {callWS:()=>new Promise(r=>{resolve=r;})};
player.isConnected = false; player.disconnectedCallback();
resolve({url:'/api/unifiprotect/video/test?authSig=temporary'});
await new Promise(r=>setTimeout(r,0));
assert.equal(player._video, undefined);
assert.equal(player._loaded,false);
console.log('unifi_protect: ok');
// Live tiles: visibility/privacy teardown, real-frame status, frozen-stream fallback and reconnect.
let observer;
globalThis.IntersectionObserver = class {
  constructor(callback) { this.callback = callback; observer = this; }
  observe() {}
  disconnect() { this.disconnected = true; }
  visible(on) { this.callback([{isIntersecting:on}]); }
};
const liveCalls = [];
hass.callWS = async message => { liveCalls.push(message); return {url:'/api/hls/test/master_playlist.m3u8'}; };
const mounted = [];
let videosPaused = 0;
document.createElement = tag => {
  const node = { style:{}, setAttribute(){}, appendChild(){}, remove(){this.removed=true;}, querySelector(){return null;},querySelectorAll(){return [];} };
  if (tag === 'ha-hls-player') {
    node.video = { readyState:3, paused:false, currentTime:10, style:{}, pause(){this.paused=true;videosPaused++;} };
    node.shadowRoot = {querySelector:name => name === 'video' ? node.video : null,querySelectorAll:()=>[]};
  }
  return node;
};
registry.set('ha-hls-player', class {});
const host = {isConnected:true, _hcPic:true, _hcAt:now-999999, requestUpdate(){}, shadowRoot:{querySelector:()=>({insertBefore:el=>mounted.push(el)})}};
S[c.cam].state = 'recording'; S['switch.private'].state = 'off';
P.tileWatch(host,S[c.cam],hass,{live_tile:false});
assert.equal(mounted.length,0);
P.tileWatch(host,S[c.cam],hass,{live_tile:true});
assert.equal(mounted.length,0,'do not open streams before visibility is known');
observer.visible(true);
assert.equal(mounted.length,1);
await Promise.resolve();
assert.deepEqual(liveCalls[0], {type:'camera/stream',entity_id:c.cam,format:'hls'});
assert.equal(P.tilePlaying(host),true);
assert.equal(P.tile(S[c.cam],hass,S,host),'Live','playing video takes precedence over old snapshot age');
document.hidden = true; P.sweepTiles();
assert.equal(P.tilePlaying(host),false);
assert.equal(mounted[0].removed,true);
assert.equal(videosPaused,1);
document.hidden = false; P.sweepTiles();
assert.equal(mounted.length,2,'foreground resumes the stream');
observer.visible(false);
assert.equal(P.tilePlaying(host),false,'off-screen stream is removed');
observer.visible(true);
S['switch.private'].state='on'; P.sweepTiles();
assert.equal(P.tilePlaying(host),false,'privacy mode tears down the stream');
S['switch.private'].state='off'; P.sweepTiles();
assert.equal(P.tilePlaying(host),true);
const realNow=Date.now;
try {
 Date.now=()=>now+25000;
 P.sweepTiles();
 assert.equal(P.tilePlaying(host),false,'frozen video falls back to snapshots');
 const n=mounted.length;
 P.sweepTiles();
 assert.equal(mounted.length,n,'failed stream observes retry cooldown');
} finally { Date.now=realNow; }
host.isConnected=false; P.sweepTiles();
assert.equal(observer.disconnected,true);
assert.equal(P.tilePlaying(host),false);
assert.ok(P.popupStyle().includes('1360px,94vw'));
console.log('unifi_protect live tiles: ok');

// Event clips replace only the existing viewer; the popup and event-library navigation remain intact.
const Viewer = registry.get('casora-protect-viewer');
assert.equal(popup.fields.live.card.type, 'custom:casora-protect-viewer');
const savedCreateElement = document.createElement;
const childNodes = [];
document.createElement = tag => {
 const child = {tag,style:{},children:[],appendChild(x){this.children.push(x);},
   setConfig(cfg){this.config=cfg;},remove(){this.removed=true;}};
 childNodes.push(child); return child;
};
let openedPopups=0;
window.casoraPopup = {open(){openedPopups++;}};
const viewer = new Viewer();
viewer.isConnected=false;
viewer.setConfig(popup.fields.live.card);
viewer.hass=hass;
viewer.isConnected=true; viewer.connectedCallback();
const initialLive=viewer._child;
assert.equal(initialLive.tag,'casora-klingel-live');
assert.equal(initialLive.config.cam2,'camera.parcel');
const libraryBefore=P.library(c.cam);
assert.equal(P.play(hass,c,clip.media_content_id),true);
assert.equal(openedPopups,0,'clip selection does not open or rebuild a popup');
assert.equal(initialLive.removed,true,'live audio and video are disconnected during clip playback');
assert.equal(viewer._child.tag,'casora-protect-clip');
assert.equal(viewer._child.config.media,clip.media_content_id);
assert.equal(viewer._child.config.autoplay,true);
assert.equal(P.library(c.cam),libraryBefore,'clip selection preserves event-list position and filters');
assert.ok(childNodes.some(x=>x.tag==='button' && x.textContent==='Zurück zur Live-Ansicht'));
const playingClip=viewer._child;
viewer.hass={...hass};
assert.equal(viewer._child,playingClip,'state pushes do not restart clip playback');
P.play(hass,c,root+'/nvr:event:event456');
assert.equal(playingClip.removed,true,'choosing another clip disconnects the previous player');
const secondClip=viewer._child;
const back=childNodes.filter(x=>x.tag==='button').at(-1);
back.onclick();
assert.equal(secondClip.removed,true);
assert.equal(viewer._child.tag,'casora-klingel-live');
assert.equal(viewer._child.config.cam2,'camera.parcel','returning to live keeps package-camera configuration');
assert.equal(openedPopups,0);
viewer.isConnected=false; viewer.disconnectedCallback();
assert.equal(P.play(hass,c,clip.media_content_id),false,'closed viewers cannot be revived by a late click');
viewer.isConnected=true; viewer.connectedCallback();
assert.equal(viewer._child.tag,'casora-klingel-live','reopening starts in live mode');
assert.equal(P.play(hass,c,'javascript:alert(1)'),false);
viewer.isConnected=false; viewer.disconnectedCallback();
document.createElement=savedCreateElement;
console.log('unifi_protect inline viewer: ok');

// Phone panes use the actual remaining popup body height and keep card instances on state updates.
window.innerWidth=393;
const phonePopup=P.popup(S[c.cam],S,hass,{event_view:'gallery'});
assert.deepEqual(phonePopup.top,['hero','phone']);
const phoneConfig=phonePopup.fields.phone.card;
assert.equal(phoneConfig.viewer.compact,true);
assert.equal(phoneConfig.media.compact,true);
assert.ok(P.popupStyle().includes('--casora-sheet-height:'));
window.innerWidth=1024;
assert.ok(!P.popupStyle().includes('--casora-sheet-height:'));
const Phone=registry.get('casora-protect-phone');
const made=[];
document.createElement=tag=>({tag,style:{},children:[],appendChild(x){this.children.push(x);},setAttribute(k,v){this[k]=v;}});
window.loadCardHelpers=async()=>({createCardElement:async config=>{const card={config};made.push(card);return card;}});
const body={classList:{contains:x=>x==='content'},getBoundingClientRect:()=>({bottom:800})};
const phone=new Phone();phone.isConnected=false;phone.setConfig(phoneConfig);phone.hass=hass;
phone.parentElement=body;phone.getBoundingClientRect=()=>({top:140});
phone.style.setProperty=(k,v)=>{phone.style[k]=v;};
phone.isConnected=true;await phone._build();
assert.equal(phone.style['--casora-protect-phone-height'],'644px');
assert.deepEqual(made.map(x=>x.config),[phoneConfig.viewer,phoneConfig.events,phoneConfig.media,phoneConfig.controls]);
const panes=phone.shadowRoot.children[1].children;
assert.deepEqual(panes.map(x=>x.className),['viewer','details']);
assert.equal(panes[1].role,'region');
assert.equal(panes[1].children.length,3,'events, clips and settings share one scroller');
assert.equal(made[2].scrollRoot,panes[1],'gallery observers follow the shared scroller');
assert.equal(phoneConfig.media.shared_scroll,true);
const before=phone._cards.slice();phone.hass={...hass};assert.deepEqual(phone._cards,before);
body.getBoundingClientRect=()=>({bottom:650});phone._fit();
assert.equal(phone.style['--casora-protect-phone-height'],'494px','rotation/header changes recalculate the available height');
phone.parentElement={parentElement:body};
window.getComputedStyle=()=>({paddingBottom:'30px',borderBottomWidth:'0px'});phone._fit();
assert.equal(phone.style['--casora-protect-phone-height'],'464px','ancestor padding cannot create an outer scrolling area');
delete window.getComputedStyle;
let disconnected=false;phone._resize={disconnect(){disconnected=true;}};
phone.isConnected=false;phone.disconnectedCallback();assert.ok(disconnected);assert.equal(phone._cards.length,0);
let helpersResolve;window.loadCardHelpers=()=>new Promise(resolve=>{helpersResolve=resolve;});
phone.isConnected=true;const building=phone._build();phone.isConnected=false;phone.disconnectedCallback();
helpersResolve({createCardElement(){throw Error('closed popup must not create cards');}});await building;
document.createElement=savedCreateElement;
console.log('unifi_protect phone panes: ok');

// Latest-event ages are localized and refresh without rebuilding the viewer or media list.
const noon=new Date(2026,9,22,12).getTime();
assert.equal(P.eventAge(noon-30000,noon,'en'),'gerade eben');
assert.equal(P.eventAge(noon-60000,noon,'en'),'1 minute ago');
assert.equal(P.eventAge(noon-5*60000,noon,'en'),'5 minutes ago');
assert.equal(P.eventAge(noon-2*3600000,noon,'en'),'2 hours ago');
assert.equal(P.eventAge(new Date(2026,9,21,18).getTime(),noon,'en'),'yesterday');
assert.equal(P.eventAge(new Date(2026,9,19,18).getTime(),noon,'en'),'3 days ago');
assert.equal(P.eventAge(noon-8*86400000,noon,'en'),'last week');
assert.equal(P.eventAge(noon-65*86400000,noon,'en'),'2 months ago');
assert.equal(P.eventAge(noon-400*86400000,noon,'en'),'last year');
assert.equal(P.eventAge(noon-5*60000,noon,'de'),'vor 5 Minuten');
assert.equal(P.eventAge(NaN,noon,'en'),'');assert.equal(P.eventAge(noon+1000,noon,'en'),'');
const realTimeout=globalThis.setTimeout, scheduled=[];
globalThis.setTimeout=(fn,ms)=>{scheduled.push({fn,ms});return {unref(){}};};
let refreshCount=0;const eventCard={isConnected:true,requestUpdate(){refreshCount++;}};
S[c.events.ring].state=new Date(Date.now()-5*60000).toISOString();
window.casoraLocale=()=> 'en';
const eventRows=JSON.parse(P.sec('events',c,S,hass,eventCard));
assert.equal(eventRows.rows[0].value,'5 minutes ago');assert.equal(eventRows.rows[0].valueLit,true);
assert.ok(!eventRows.rows.some(row=>row.value.includes('/')));
P.sec('events',c,S,hass,eventCard);assert.equal(scheduled.length,1);
assert.equal(scheduled[0].ms,30000);scheduled[0].fn();assert.equal(refreshCount,1);
document.hidden=true;scheduled[1].fn();assert.equal(refreshCount,1,'background refreshes do not redraw');
document.hidden=false;scheduled[2].fn();assert.equal(refreshCount,2,'foreground refresh resumes');
eventCard.isConnected=false;scheduled[3].fn();assert.equal(scheduled.length,4,'closed event cards stop refreshing');
globalThis.setTimeout=realTimeout;delete window.casoraLocale;
console.log('unifi_protect relative event times: ok');
