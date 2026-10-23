// Agile badge: units, import meter isolation, exact band boundaries and responsive card reuse.
import fs from 'node:fs';
import assert from 'node:assert/strict';
globalThis.window = globalThis;
globalThis.document = { hidden: false };
const elements = new Map();
globalThis.HTMLElement = class {
  constructor() { this.style={}; this.isConnected=true; }
  attachShadow() { return this.shadowRoot={children:[],appendChild(c){this.children.push(c);},set textContent(v){this.children=[];},set innerHTML(v){this.children=[];this.markup=v;}}; }
  setAttribute() {}
};
globalThis.customElements = { get: k => elements.get(k), define: (k,v) => elements.set(k,v) };
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/28-energy-rate.js', import.meta.url), 'utf8'))();
const P = window._casoraRate;
const now = Date.parse('2026-10-25T00:45:00Z'); // UK clock change: repeated local hour.
const S = {}, h = { states:S, entities:{}, locale:{language:'en-GB'}, config:{time_zone:'Europe/London'} };
function add(id, state, attributes) { S[id] = {entity_id:id,state,attributes}; }
const meter = {mpan:'fictional-meter', serial_number:'fictional-serial', tariff:'E-AGILE-DEMO', is_export:false};
add('sensor.price','0.18',{...meter,unit_of_measurement:'GBP/kWh', start:'2026-10-25T00:30:00Z',end:'2026-10-25T01:00:00Z'});
const rate = (start,end,n) => ({start,end,value_inc_vat:n});
add('event.today','unknown',{...meter,tariff_code:meter.tariff,event_types:['octopus_energy_electricity_current_day_rates'],rates:[
 rate('2026-10-25T00:00:00Z','2026-10-25T00:30:00Z',0.1),
 rate('2026-10-25T00:30:00Z','2026-10-25T01:00:00Z',0.18),
 rate('2026-10-25T01:00:00Z','2026-10-25T01:30:00Z',-0.03)]});
add('event.tomorrow','unknown',{...meter,event_types:['octopus_energy_electricity_next_day_rates'],rates:[]});
add('event.export','unknown',{...meter,is_export:true,rates:[rate('2026-10-25T01:00:00Z','2026-10-25T01:30:00Z',-9)]});
add('event.other_meter','unknown',{...meter,mpan:'other',rates:[rate('2026-10-25T02:00:00Z','2026-10-25T02:30:00Z',99)]});
let s = P.resolve(S,h,{},'sensor.price',now);
assert.equal(s.price,18); assert.equal(s.rows.length,2); assert.equal(s.minimum,-3);
assert.equal(s.cheapest.price,-3); assert.deepEqual(s.rateIds,['event.today','event.tomorrow']);
assert.equal(P.pence({state:'12.2',attributes:{unit_of_measurement:'p/kWh'}}),12.2);
assert.equal(P.pence({state:'12.2',attributes:{unit_of_measurement:'GBp/kWh'}}),12.2);
for (const state of ['unavailable','unknown','',null]) assert.equal(P.pence({state,attributes:{unit_of_measurement:'GBP/kWh'}}),null);
assert.equal(P.pence({state:'23',attributes:{unit_of_measurement:'W'}}),null);
assert.equal(P.pence({state:'0',attributes:{unit_of_measurement:'GBP/kWh'}}),0);
const v={lowlimit:6,mediumlimit:15,highlimit:27};
assert.match(P.band(6,v).hue,/MediumSeaGreen/);
assert.match(P.band(6.01,v).hue,/ForestGreen/);
assert.match(P.band(15,v).hue,/ForestGreen/);
assert.match(P.band(15.01,v).hue,/orange/);
assert.match(P.band(27,v).hue,/orange/);
assert.match(P.band(27.01,v).hue,/Tomato/);
assert.match(P.band(0,v).hue,/57,28,217/);
assert.match(P.band(-1,v,-1).hue,/LightBlue/);
assert.match(P.band(1,v,1).hue,/LightGreen/);
assert.equal(P.band(30,{...v,color_high:'#123456'}).hue,'#123456');
assert.match(P.band(30,{...v,color_high:'red;display:none'}).hue,/Tomato/);
assert.deepEqual(P.limits({lowlimit:50,mediumlimit:10,highlimit:2}),[5,20,30]);
assert.equal(P.resolve(S,h,{},'sensor.price',Date.parse('2026-10-25T02:00:00Z')).price,null);
S['sensor.price'].state='unavailable';
assert.equal(P.resolve(S,h,{},'sensor.price',now).price,18); // Valid published slot is a safe fallback.
add('sensor.glow','0.29',{unit_of_measurement:'GBP/kWh'});
assert.equal(P.resolve({},h,{fallback_entity:'sensor.glow'},'sensor.price',now).price,null);
assert.ok(Math.abs(P.resolve(S,h,{today_rates:'event.missing',fallback_entity:'sensor.glow'},'sensor.price',now).price-29)<1e-8);
assert.equal(P.resolve(S,h,{today_rates:'event.missing'},'sensor.price',now).price,null);
for (const [width,cols] of [[320,1],[439,1],[440,2],[719,2],[720,3],[1200,3]]) assert.equal(P.columns(width),cols);
const config=P.cardConfig(s,S,v,800);
assert.equal(config.type,'custom:octopus-energy-rates-card');assert.equal(config.cols,3);
assert.equal(config.currentEntity,'event.today');assert.equal(config.futureEntity,'event.tomorrow');
assert.equal(config.lowlimit,6);assert.equal(config.mediumlimit,15);assert.equal(config.highlimit,27);
assert.equal(config.multiplier,100);assert.equal(config.showpast,false);
assert.ok(elements.has('casora-agile-rates'));
const t=JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json',import.meta.url),'utf8'));
assert.ok(t.casora_room.custom_fields.badges.card.cards.some(c=>c.template==='casora_badge_energy_rate'));
assert.ok(t.casora_badge_energy_rate.template.includes('casora_popup_energy_rate'));
assert.equal(t.casora_popup_energy_rate.tap_action.haptic,'light');
let layout;
window._casoraSoftKit={secCard:()=>({}),layout:o=>(layout=o)};
P.popup(S,h,v,'sensor.price');
assert.equal(layout.fields.rates.card.type,'custom:casora-agile-rates');
assert.deepEqual(layout.top,['hero','rates']);
console.log('ok energy_rate: units, import isolation, expired slots, DST, colours, native card reuse and responsive columns');

// Exercise resize, original-card forwarding, and close/reopen lifecycle without Home Assistant.
const realNow=Date.now, realSet=globalThis.setInterval, realClear=globalThis.clearInterval;
Date.now=()=>now;
let running=0, disconnected=0, drawn=0, observer;
globalThis.setInterval=()=>{running++;return 1;};globalThis.clearInterval=()=>{running--;};
globalThis.ResizeObserver=class { constructor(fn){this.fn=fn;observer=this;} observe(){} disconnect(){disconnected++;} };
class NativeRates { setConfig(c){this.config=c;} set hass(h){drawn++;this.states=h.states;} }
elements.set('octopus-energy-rates-card',NativeRates);
globalThis.document.createElement=tag=>tag==='octopus-energy-rates-card'?new NativeRates():{};
globalThis.customElements.whenDefined=()=>Promise.resolve();
window._casoraUI={note:s=>s};
const Wrapper=elements.get('casora-agile-rates'), wrapper=new Wrapper();
wrapper.setConfig({entity:'sensor.price',variables:v});wrapper.hass=h;wrapper.connectedCallback();
assert.equal(wrapper._child.config.cols,1);assert.equal(running,1);
observer.fn([{contentRect:{width:500}}]);assert.equal(wrapper._child.config.cols,2);
observer.fn([{contentRect:{width:800}}]);assert.equal(wrapper._child.config.cols,3);
const retained=wrapper._child, before=drawn;wrapper.hass=h;assert.equal(wrapper._child,retained);assert.equal(drawn,before);
S['event.tomorrow'].last_updated='changed';wrapper.hass=h;assert.equal(drawn,before+1);
wrapper.isConnected=false;wrapper.disconnectedCallback();assert.equal(running,0);assert.equal(disconnected,1);
await Promise.resolve();assert.equal(running,0);
wrapper.isConnected=true;wrapper.connectedCallback();assert.equal(running,1);wrapper.disconnectedCallback();assert.equal(running,0);
Date.now=realNow;globalThis.setInterval=realSet;globalThis.clearInterval=realClear;
console.log('ok energy_rate wrapper: native card forwarding, 1/2/3 columns, updates and observer/timer cleanup');

// Category timing follows consecutive slots, not each rate change or the cheapest highlight.
const slot=30*60000;
const future=(prices, offset=0)=>prices.map((price,i)=>({start:now+(i+offset)*slot,end:now+(i+offset+1)*slot,price}));
let outlook=P.outlook({price:40,rows:future([40,35,27,5])},v,now+10*60000);
assert.equal(outlook.category,'high');assert.equal(outlook.until,now+2*slot);assert.equal(outlook.change.price,27);
assert.equal(P.duration(outlook.until-(now+10*60000)),'50 min');
assert.equal(P.duration(125*60000),'2 h 5 min');assert.equal(P.duration(120*60000),'2 h');
assert.equal(P.duration(1),'1 min');
assert.equal(P.outlook({price:40,rows:future([40,35,45])},v,now).change,null);
assert.equal(P.outlook({price:40,rows:future([40,35,45])},v,now).until,now+3*slot);
assert.equal(P.outlook({price:40,rows:[...future([40]),...future([5],2)]},v,now).until,now+slot);
assert.equal(P.outlook({price:40,rows:[...future([40]),...future([5],2)]},v,now).change,null);
assert.equal(P.outlook({price:40,rows:[]},v,now).known,false);
assert.equal(P.outlook({price:null,rows:future([40,5])},v,now).known,false);
assert.equal(P.outlook({price:5,rows:future([40,5])},v,now).known,false);
assert.equal(P.outlook({price:27,rows:future([27,27.01])},v,now).change.price,27.01);
assert.equal(P.outlook({price:0,rows:future([0,-2,0,1])},v,now).until,now+3*slot);
assert.equal(P.outlook({price:3,minimum:3,rows:future([3,4,6,7])},v,now).until,now+3*slot);
// Timestamp arithmetic remains correct when the UK's 01:00 occurs twice.
assert.equal(P.outlook({price:40,rows:future([40,35,27])},v,now).until-now,3600000);
assert.equal(P.outlook({price:35,rows:future([40,35,27])},v,now+slot).until,now+2*slot);
assert.equal(P.outlook({price:35,rows:future([40,35,27])},v,now+3*slot).known,false);
assert.match(P.timing({price:40,rows:future([40,35,27])},h,v,now),/1 h/);
assert.match(P.timing({price:40,rows:future([40])},h,v,now),/Mindestens/);
assert.equal(P.timing({price:null,rows:[]},h,v,now),'');
assert.equal(P.timing({price:40,rows:[]},h,v,now),'Dauer der Preisstufe nicht verfügbar');
// Render the real header and ensure a category end is distinct from the cheapest-slot overlay.
Date.now=()=>now;
window._casoraUI={line:(main,rest)=>[main,...rest].join(' | ')};
const header=P.sec('hero',{v,id:'sensor.price'},S,h);
assert.match(header,/18\.00 p\/kWh/);assert.match(header,/Erhöhter Preis/);assert.match(header,/15 min/);
Date.now=realNow;
console.log('ok energy_rate outlook: continuous category duration, inclusive thresholds, forecast horizon/gaps, negative rates, header and DST');

Date.now=()=>now;
const hueHook=window._casoraRingHueHooks.at(-1);
assert.equal(hueHook({_hass:h,_config:{entity:'sensor.price'},_variables:v},'casora_light'),null);
assert.match(hueHook({_hass:h,_config:{entity:'sensor.price'},_variables:v},'casora_badge_energy_rate').hue,/orange/);
Date.now=realNow;

// Studio sees two separately selectable badges, with independent visibility and popup sources.
const panelSource=fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js',import.meta.url),'utf8');
const methodStart=panelSource.indexOf('  _miniModel(room, opts) {');
const methodEnd=panelSource.indexOf('\n  // ── layout animation',methodStart);
const model=new Function('numText','wattText','studioIcon','return ({'+panelSource.slice(methodStart,methodEnd)+'})._miniModel;')(
  n=>String(n),n=>n+' W',()=> 'green');
add('sensor.demand','500',{unit_of_measurement:'W'});
const context={_hass:h};
const configured={energy_power_entity:'sensor.demand',energy_rate_entity:'sensor.price',energy_rate_lowlimit:6,energy_rate_mediumlimit:15,energy_rate_highlimit:27};
Date.now=()=>now;
let badges=model.call(context,{variables:configured});
assert.ok(badges.some(b=>b.id==='energy'));assert.ok(badges.some(b=>b.id==='rates'));
assert.equal(badges.find(b=>b.id==='rates').label,'18.00 p/kWh');
badges=model.call(context,{variables:{...configured,show_energy:false}});
assert.ok(!badges.some(b=>b.id==='energy'));assert.ok(badges.some(b=>b.id==='rates'));
badges=model.call(context,{variables:{...configured,show_rates:false}});
assert.ok(badges.some(b=>b.id==='energy'));assert.ok(!badges.some(b=>b.id==='rates'));
const headerBadge=t.casora_room.custom_fields.badges.card.cards.find(c=>c.template==='casora_badge_energy_rate');
const enabled=new Function('variables','user',headerBadge.variables.enabled.slice(3,-3));
assert.equal(enabled({...configured,show_energy:false},{}),true);
assert.equal(enabled({...configured,show_rates:false},{}),false);
const popupSource=fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-popups.js',import.meta.url),'utf8');
assert.match(popupSource,/rates: \["casora_badge_energy_rate"\]/);
const sectionStart=panelSource.indexOf('  {\n    label: "Energy", bid: "energy"');
const sectionEnd=panelSource.indexOf('\n];',sectionStart);
assert.ok(!panelSource.slice(sectionStart,sectionEnd).includes('energy_rate_'));
Date.now=realNow;
console.log('ok energy_rate Studio: separate preview, visibility toggles, settings and popup routes');
