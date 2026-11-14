const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const {blank,normalise,topic,suggestTopics,toText}=require('../minutes.js');
test('minutes format contains structured fields without inventing missing decisions',()=>{
 const m=blank();m.title='Team review';m.venue='Room 1';m.date='2026-11-14';m.attendees=[{name:'A Example',designation:'Chair'}];m.topics=[topic('Budget','Speaker 1: Review costs.')];
 const text=toText(m);assert.match(text,/DRAFT FOR REVIEW/);assert.match(text,/A Example — Chair/);assert.match(text,/1. Budget/);assert.match(text,/Decision: Not recorded/);assert.match(text,/CONCLUSION\nNot entered/);assert.equal(m.topics[0].discussion,'Speaker 1: Review costs.');
});
test('heading suggestion only recognises explicit labels, deduplicates, never invents prose',()=>{
 assert.deepEqual(suggestTopics('We should discuss money.\nSpeaker 1: Launch next week.\nTopic: Budget\nAgenda item 2: Staffing\nTopic: budget\nItem: Next steps'),['Budget','Staffing','Next steps']);assert.deepEqual(suggestTopics('Plain text without explicit headings.'),[]);
});
test('malformed drafts normalise and collections are bounded',()=>{assert.deepEqual(normalise(null),blank());assert.deepEqual(normalise({attendees:[null,9],topics:[null]}).attendees,[{name:'',designation:''},{name:'',designation:''}]);assert.equal(normalise({topics:Array(600).fill(null)}).topics.length,500);});
function app({restore='null',storageFail=false}={}){
 class El{constructor(tag=''){this.tag=tag;this.value='';this.children=[];this.events={};this.hidden=false;}
 addEventListener(k,fn){(this.events[k]??=[]).push(fn);}fire(k,data={}){this['on'+k]?.({target:this,...data});for(const fn of this.events[k]||[])fn({target:this,...data});}
 appendChild(e){this.children.push(e);return e;}append(...es){this.children.push(...es);}replaceChildren(){this.children=[];}get lastElementChild(){return this.children.at(-1);}querySelector(tag){for(const child of this.children){if(child.tag===tag)return child;const found=child.querySelector(tag);if(found)return found;}}focus(){this.focused=true;}remove(){}click(){this.fire('click');}}
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]),els=Object.fromEntries(ids.map(id=>[id,new El()])),storage=new Map([['analyticah-minutes-v1',restore]]),events={};
 const localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>{if(storageFail)throw Error();storage.set(k,v);}};
 const window={document:{getElementById:id=>els[id],createElement:tag=>new El(tag),body:new El('body')},addEventListener:(k,fn)=>events[k]=fn};
 vm.runInNewContext(fs.readFileSync(require.resolve('../minutes.js'),'utf8'),{window,localStorage,confirm:()=>true,setTimeout:()=>1,clearTimeout(){}});
 return {e:els,storage,events};
}
test('selected source is copied without editing transcript and new minutes never clears transcript',()=>{
 const {e,storage}=app();e.transcript.value='Speaker 1: Budget agreed. Another topic.';e.transcript.selectionStart=0;e.transcript.selectionEnd=25;e.transcript.fire('select');e['minutes-from-selection'].click();
 const state=JSON.parse(storage.get('analyticah-minutes-v1'));assert.equal(state.topics[0].discussion,'Speaker 1: Budget agreed.');assert.equal(e.transcript.value,'Speaker 1: Budget agreed. Another topic.');e['minutes-new'].click();assert.equal(JSON.parse(storage.get('analyticah-minutes-v1')).topics.length,0);assert.equal(e.transcript.value,'Speaker 1: Budget agreed. Another topic.');
});
test('suggestions require individual acceptance and do not overwrite existing topics',()=>{
 const {e,storage}=app();e.transcript.value='Topic: Budget';e['minutes-suggest'].click();assert.equal(e['minutes-topics'].children.length,0);e['minutes-candidates'].children[0].click();assert.equal(JSON.parse(storage.get('analyticah-minutes-v1')).topics[0].title,'Budget');assert.equal(e['minutes-candidates'].children[0].disabled,true);
});
test('attendees and edits persist at pagehide; previews reflect latest fields',()=>{
 const {e,events,storage}=app();e['minutes-add-attendee'].click();const input=e['minutes-attendees'].children[0].querySelector('input');input.value='Test Person';input.fire('input');e['minutes-venue'].value='Online';e['minutes-venue'].fire('input');events.pagehide();assert.equal(JSON.parse(storage.get('analyticah-minutes-v1')).venue,'Online');e['minutes-preview'].click();assert.match(e['minutes-output'].value,/Test Person/);assert.match(e['minutes-output'].value,/Venue: Online/);
});
test('storage failure warns but keeps minutes usable and transcript separate',()=>{
 const {e}=app({storageFail:true});e['minutes-add-topic'].click();assert.match(e['minutes-status'].textContent,/could not be saved/);assert.equal(e['minutes-topics'].children.length,1);
});
test('minutes content remains text not rendered HTML and exposes no network API',()=>{
 const {e}=app({restore:JSON.stringify({title:'<script>bad()</script>',topics:[{title:'<img onerror=bad()>',discussion:'source'}]})});assert.equal(e['minutes-title'].value,'<script>bad()</script>');assert.equal(e['minutes-topics'].children[0].querySelector('input').value,'<img onerror=bad()>');const js=fs.readFileSync(require.resolve('../minutes.js'),'utf8');assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|\.innerHTML\s*=/);
});
test('cleared or replaced transcript cannot copy a stale cached excerpt',()=>{
 for(const replacement of ['', 'New meeting']){const {e}=app();e.transcript.value='Old meeting';e.transcript.selectionStart=0;e.transcript.selectionEnd=11;e.transcript.fire('select');e.transcript.value=replacement;e['minutes-from-selection'].click();assert.equal(e['minutes-topics'].children.length,0);assert.match(e['minutes-status'].textContent,/changed/);}
 const {e}=app();e.transcript.value='Old meeting';e.transcript.selectionStart=0;e.transcript.selectionEnd=11;e.transcript.fire('select');e['minutes-new'].click();e['minutes-from-selection'].click();assert.equal(e['minutes-topics'].children.length,0);
});
test('closing stale tab does not overwrite a newer minutes draft',()=>{
 const {e,events,storage}=app();const newer=JSON.stringify({title:'Other tab meeting'});storage.set('analyticah-minutes-v1',newer);events.pagehide();assert.equal(storage.get('analyticah-minutes-v1'),newer);
 e['minutes-title'].value='My edits';e['minutes-title'].fire('input');events.pagehide();assert.equal(storage.get('analyticah-minutes-v1'),newer);assert.match(e['minutes-status'].textContent,/another tab/);e['minutes-preview'].click();assert.match(e['minutes-output'].value,/My edits/);
});
