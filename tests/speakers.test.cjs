const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { insertSpeaker } = require('../speakers.js');
test('empty transcript, middle, end and paragraph boundaries preserve all original text', () => {
  assert.deepEqual(insertSpeaker('',0,1), {text:'Speaker 1: ',cursor:11});
  assert.equal(insertSpeaker('Hello world',6,2).text,'Hello \n\nSpeaker 2: world');
  assert.equal(insertSpeaker('Hello\n',6,2).text,'Hello\n\nSpeaker 2: ');
  assert.equal(insertSpeaker('Hello\n\nworld',7,2).text,'Hello\n\nSpeaker 2: world');
  assert.equal(insertSpeaker('abc',99,1).text,'abc\n\nSpeaker 1: ');
  assert.equal(insertSpeaker('abc',-2,1).text,'Speaker 1: abc');
  assert.throws(() => insertSpeaker('safe',1,0));
});
function app({restore='2',storageFail=false}={}) {
  class Element {
    constructor(){this.value='';this.children=[];this.events={};this.selectionStart=0;this.classList={add(){},remove(){}};}
    addEventListener(type,fn){(this.events[type] ||= []).push(fn);}
    dispatchEvent(e){for(const fn of this.events[e.type] || []) fn(e);}
    fire(type,data={}){this.dispatchEvent({type,...data});}
    appendChild(e){this.children.push(e);}
    replaceChildren(){this.children=[];this.value='';}
    setAttribute(){}
    focus(){this.focused=true;}
    setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
  }
  const ids=['transcript','speaker-list','speaker-select','speaker-status','speaker-add','speaker-insert','speaker-undo'];
  const els=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const storage=new Map([['analyticah-transcription-speakers-v1',restore]]);
  const window={document:{getElementById:id=>els[id],createElement:()=>new Element()},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>{if(storageFail)throw Error(); storage.set(k,v);}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../speakers.js'),'utf8'), {window,Event:class{constructor(type){this.type=type;}}});
  return {els,storage};
}
test('touch/keyboard button inserts at cursor without deleting selected text, emits save input, and undo restores',()=>{
  const {els:e}=app(); const a=e.transcript; a.value='First. Second.';a.selectionStart=7;a.selectionEnd=14;a.fire('select');let saves=0;a.addEventListener('input',()=>saves++);
  e['speaker-select'].value='2'; e['speaker-insert'].fire('click');
  assert.equal(a.value,'First. \n\nSpeaker 2: Second.');assert.equal(saves,1);assert.equal(a.focused,true);
  e['speaker-undo'].fire('click');assert.equal(a.value,'First. Second.');assert.equal(saves,2);
});
test('undo refuses to overwrite newer typed or appended upload/recognition text',()=>{
  const {els:e}=app();e['speaker-insert'].fire('click');e.transcript.value+='new words';e['speaker-undo'].fire('click');assert.equal(e.transcript.value,'Speaker 1: new words');assert.match(e['speaker-status'].textContent,/protect/);
});
test('add sequential speakers and restore count; malicious storage is ignored',()=>{
  const {els:e,storage}=app();e['speaker-add'].fire('click');assert.equal(e['speaker-list'].children[2].textContent,'Speaker 3');assert.equal(storage.values().next().value,'3');
  assert.equal(app({restore:'<script>'}).els['speaker-list'].children.length,2);
  assert.equal(app({restore:'100000'}).els['speaker-list'].children.length,2);
});
test('internal drag inserts only label, external text drop not intercepted, repeated drop does not duplicate',()=>{
  const {els:e}=app();let prevented=0;const drop={preventDefault(){prevented++;},dataTransfer:{setData(){}}};
  e.transcript.fire('drop',drop);assert.equal(prevented,0);
  e['speaker-list'].children[1].fire('dragstart',drop);e.transcript.fire('drop',drop);e.transcript.fire('drop',drop);
  assert.equal(e.transcript.value,'Speaker 2: ');assert.equal(prevented,1);
});
test('storage failure keeps labels usable and count is bounded',()=>{
  const {els:e}=app({storageFail:true});e['speaker-add'].fire('click');assert.match(e['speaker-status'].textContent,/unavailable/);
  const {els:max}=app({restore:'999'});max['speaker-add'].fire('click');assert.equal(max['speaker-list'].children.length,999);assert.equal(max['speaker-add'].disabled,true);
});
test('programmatic append or clear invalidates stale cursor without overwriting words',()=>{
  const {els:e}=app();const a=e.transcript;a.value='abc';a.selectionStart=0;a.fire('select');a.value+=' newly recognized';e['speaker-insert'].fire('click');assert.equal(a.value,'abc newly recognized\n\nSpeaker 1: ');
  a.value='';e['speaker-insert'].fire('click');assert.equal(a.value,'Speaker 1: ');
});
test('Ctrl+1..9 is transcript-scoped, uses live cursor, and ignores repeats/other combinations',()=>{
  const {els:e}=app();const a=e.transcript;a.value='before after';a.selectionStart=7;let prevented=0;
  a.fire('keydown',{ctrlKey:true,key:'2',preventDefault(){prevented++;}});
  assert.equal(a.value,'before \n\nSpeaker 2: after');assert.equal(prevented,1);
  const unchanged=a.value;
  for(const ev of [{key:'1'},{ctrlKey:true,key:'9'},{ctrlKey:true,key:'1',repeat:true},{ctrlKey:true,altKey:true,key:'1'},{ctrlKey:true,metaKey:true,key:'1'},{ctrlKey:true,shiftKey:true,key:'1'}])a.fire('keydown',{...ev,preventDefault(){throw Error('should ignore')}});
  assert.equal(a.value,unchanged);assert.equal(e['speaker-select'].events.keydown,undefined);
});
