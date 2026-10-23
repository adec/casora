// Gallery behavior without HA: progressive DOM, lazy signed thumbnails, bounded requests and close races.
import fs from 'node:fs';
import assert from 'node:assert/strict';
class Node {
 constructor(tag='root') { this.tag=tag;this.children=[];this.style={};this.attributes={};this.isConnected=true;this.scrollTop=0; }
 set textContent(text){this.text=text;this.children=[];}
 get textContent(){return this.text || '';}
 appendChild(child){this.children.push(child);return child;}
 setAttribute(key,value){this.attributes[key]=value;}
 getAttribute(key){return this.attributes[key];}
 addEventListener(){}
 remove(){this.removed=true;}
}
const elements=new Map(), observers=[];
globalThis.window=globalThis;
window.location={origin:'https://ha.example'};
globalThis.document={createElement:tag=>new Node(tag),querySelector:()=>({hass})};
globalThis.HTMLElement=class extends Node {attachShadow(){this.shadowRoot=new Node();}};
globalThis.customElements={get:key=>elements.get(key),define:(key,value)=>elements.set(key,value)};
globalThis.IntersectionObserver=class {
 constructor(callback,options){this.callback=callback;this.options=options;this.targets=new Set();observers.push(this);}
 observe(node){this.targets.add(node);}
 unobserve(node){this.targets.delete(node);}
 disconnect(){this.disconnected=true;this.targets.clear();}
 trigger(nodes,visible=true){this.callback(nodes.map(target=>({target,isIntersecting:visible})));}
};
window._casoraUI={group:(rows,title)=>JSON.stringify({rows,title})};
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/27-unifi-protect.js',import.meta.url),'utf8'))();
const P=window._casoraProtect, root='media-source://unifiprotect';
const id='camera.entry',requests=[];
const hass={states:{[id]:{entity_id:id,state:'recording',attributes:{}}},entities:{[id]:{platform:'unifiprotect',device_id:'door'}},devices:{},callWS:message=>new Promise((resolve,reject)=>{requests.push({message,resolve,reject});})};
const lib=P.library(id);
lib.path=root+'/nvr:browse:cam:all:recent:1';lib.at=Date.now();
lib.rows=Array.from({length:30},(_,i)=>({title:i===0?'<img src=x onerror=alert(1)>':'Event '+i,can_play:true,media_content_id:root+'/nvr:event:e'+i}));
assert.equal(P.thumbnailMedia(lib.rows[0]),root+'/nvr:eventthumb:e0');
assert.equal(P.thumbnailMedia({can_play:false,media_content_id:root+'/nvr:browse:cam'}),null);
assert.equal(P.thumbnailMedia({can_play:true,media_content_id:'https://untrusted.example/video'}),null);
const Media=elements.get('casora-protect-media');
const gallery=new Media();gallery.isConnected=false;gallery.setConfig({entity:id,event_view:'gallery'});gallery.hass=hass;
gallery.isConnected=true;gallery.connectedCallback();
assert.equal(gallery._grid.children.length,12,'only the first batch is rendered initially');
assert.equal(requests.length,0,'no thumbnail resolution before intersection');
assert.equal(gallery._grid.children[0].children[1].textContent,lib.rows[0].title,'camera-provided titles use textContent');
assert.equal(gallery._grid.children[0].children[1].innerHTML,undefined);
assert.equal(gallery._pane.attributes.role,'region');
const firstBatch=gallery._grid.children.slice();
gallery._thumbObserver.trigger(firstBatch,false);
assert.equal(requests.length,0,'offscreen cards do not request thumbnails');
gallery._thumbObserver.trigger(firstBatch);
assert.equal(requests.length,4,'resolve at most four thumbnails concurrently');
assert.ok(requests.every(r=>r.message.type==='media_source/resolve_media' && r.message.media_content_id.includes(':eventthumb:')));
requests[0].resolve({url:'/api/unifiprotect/thumbnail/nvr/e0?authSig=test'});requests[0].done=true;
const flush=async()=>{await new Promise(r=>setTimeout(r,0));};
await flush();
assert.equal(requests.length,5,'the next request starts when a slot is released');
const img=firstBatch[0].children[0].children.find(n=>n.tag==='img');
assert.ok(img.src.startsWith('https://ha.example/api/unifiprotect/thumbnail/'));
assert.equal(img.loading,'lazy');
assert.equal(img.alt,'');
// Reject an unexpected remote origin and preserve the usable clip button with a placeholder.
requests[1].resolve({url:'https://untrusted.example/image'});requests[1].done=true;
await flush();
assert.equal(firstBatch[1].children[0].children.find(n=>n.tag==='img'),undefined);
assert.equal(firstBatch[1].children[0].children[0].textContent,'Kein Vorschaubild');
while(requests.some(r=>!r.done)){
 for(const request of requests.filter(r=>!r.done)){request.done=true;request.resolve({url:'/api/unifiprotect/thumbnail/nvr/ok?authSig=test'});}
 await flush();
}
assert.equal(requests.length,12);
gallery._moreObserver.trigger([gallery._more]);
assert.equal(gallery._grid.children.length,24,'scrolling to the sentinel appends another batch');
assert.equal(requests.length,12,'adding cards alone does not fetch their thumbnails');
gallery._moreObserver.trigger([gallery._more]);
assert.equal(gallery._grid.children.length,30);
assert.equal(gallery._more.hidden,true,'the sentinel disappears after the final event');
assert.equal(requests.length,12,'no fake backend pagination or eager image resolution');
let selected;
P.mediaClick=action=>{selected=action;return true;};
gallery._grid.children[20].onclick();
assert.equal(selected,P.mediaAction('play',id,lib.rows[20].media_content_id));
const pane=gallery._pane;pane.scrollTop=160;
gallery.hass={...hass};
assert.equal(gallery._pane,pane,'normal HA updates do not rebuild the gallery');
assert.equal(gallery._pane.scrollTop,160);
// A background metadata refresh keeps the number of revealed items and scroll position.
lib.at+=1;gallery.requestUpdate();
assert.equal(gallery._grid.children.length,30);
assert.equal(gallery._pane.scrollTop,160);
const count=requests.length;
gallery._thumbObserver.trigger([gallery._grid.children[0]]);await flush();
assert.equal(requests.length,count,'a recently signed thumbnail is reused within this popup');
// Runtime view toggle is local and leaves the library selection intact.
const currentPath=lib.path;
const oldThumbObserver=gallery._thumbObserver;
gallery.shadowRoot.children[0].children[0].onclick();
assert.equal(gallery._view,'list');assert.equal(gallery._grid,null);
assert.equal(oldThumbObserver.disconnected,true);
assert.equal(lib.path,currentPath);
gallery.shadowRoot.children[0].children[1].onclick();
assert.equal(gallery._view,'gallery');
assert.ok(gallery._grid);
// Observer roots belong to the scrollable gallery itself.
assert.equal(gallery._thumbObserver.options.root,gallery._pane);
assert.equal(gallery._moreObserver.options.root,gallery._pane);
// A new folder resets progressive rendering rather than retaining the old folder's count.
lib.path=root+'/nvr:browse:cam:all:recent:7';lib.at+=1;gallery.requestUpdate();
assert.equal(gallery._grid.children.length,12);assert.equal(gallery._pane.scrollTop,0);
// Closing while a thumbnail is resolving prevents late DOM or image requests.
gallery._thumbObserver.trigger([gallery._grid.children[11]]);
// e11 may be cached; use an unseen event after appending.
gallery._append(lib);gallery._thumbObserver.trigger([gallery._grid.children[20]]);
assert.ok(requests.length>count);
const late=gallery._grid.children[20].children[0];
gallery.isConnected=false;gallery.disconnectedCallback();
assert.equal(lib.wait.has(gallery),false);
assert.equal(gallery._thumbObserver.disconnected,true);
assert.equal(gallery._moreObserver.disconnected,true);
for(const request of requests.filter(r=>!r.done)){request.done=true;request.resolve({url:'/api/unifiprotect/thumbnail/nvr/late'});}
await flush();
assert.equal(late.children.find(n=>n.tag==='img'),undefined,'closed galleries ignore late signed URLs');
assert.equal(gallery._thumbCache.size,0,'signed URLs are released on close');
console.log('unifi_protect_gallery: ok');

// The phone gallery grows inside the shared events scroller without a nested scrolling pane.
const shared=new Node('shared');shared.scrollTop=180;
lib.path=root+'/nvr:browse:cam:all:recent:1';lib.at=Date.now();
const phoneGallery=new Media();phoneGallery.isConnected=false;
phoneGallery.scrollRoot=shared;
phoneGallery.setConfig({entity:id,event_view:'gallery',compact:true,shared_scroll:true});phoneGallery.hass=hass;
phoneGallery.isConnected=true;phoneGallery.connectedCallback();
assert.equal(phoneGallery._thumbObserver.options.root,shared);
assert.equal(phoneGallery._moreObserver.options.root,shared);
assert.ok(!phoneGallery._pane.style.cssText.includes('overflow-y:auto'));
assert.equal(shared.scrollTop,180,'initial gallery rendering preserves the shared scroller position');
phoneGallery._moreObserver.trigger([phoneGallery._more]);
assert.equal(phoneGallery._grid.children.length,24);
lib.at++;phoneGallery.requestUpdate();
assert.equal(shared.scrollTop,180,'metadata updates preserve shared scroll position');
phoneGallery.isConnected=false;phoneGallery.disconnectedCallback();
console.log('unifi_protect shared phone scrolling: ok');
