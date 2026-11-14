/* Minutes Maker: local, editable notes; no AI summarisation or network requests. */
(function(root){
'use strict';
const blank=()=>({title:'',date:'',venue:'',attendees:[],topics:[],conclusion:''});
function clean(value){return typeof value==='string'?value:'';}
function normalise(value){
 const v=value&&typeof value==='object'?value:{};
 return {title:clean(v.title),date:clean(v.date),venue:clean(v.venue),conclusion:clean(v.conclusion),
 attendees:Array.isArray(v.attendees)?v.attendees.slice(0,500).map(a=>({name:clean(a?.name),designation:clean(a?.designation)})):[],
 topics:Array.isArray(v.topics)?v.topics.slice(0,500).map(t=>({title:clean(t?.title),discussion:clean(t?.discussion),decision:clean(t?.decision),action:clean(t?.action),owner:clean(t?.owner),due:clean(t?.due)})):[]};
}
function topic(title='',discussion=''){return {title,discussion,decision:'',action:'',owner:'',due:''};}
// Conservative candidate headings only: explicit agenda/topic labels, not invented conclusions.
function suggestTopics(text){
 const candidates=[],seen=new Set();
 for(const line of String(text).split(/\r?\n/)){
  const match=line.trim().match(/^(?:agenda(?:\s+item)?|topic|item)\s*(?:\d+[.):\-]?\s*)?[:\-]\s*(.{2,120})$/i);
  if(match){const title=match[1].trim(),key=title.toLowerCase();if(!seen.has(key)){seen.add(key);candidates.push(title);}}
  if(candidates.length===30)break;
 }
 return candidates;
}
function toText(input){
 const m=normalise(input),lines=['MEETING MINUTES — DRAFT FOR REVIEW',m.title||'Untitled meeting','Date: '+(m.date||'Not entered'),'Venue: '+(m.venue||'Not entered'),'','ATTENDEES'];
 lines.push(...(m.attendees.length?m.attendees.map(a=>`${a.name||'Name not entered'}${a.designation?' — '+a.designation:''}`):['Not entered']));
 lines.push('','TOPICS');
 m.topics.forEach((t,i)=>{lines.push('',`${i+1}. ${t.title||'Untitled topic'}`,'Discussion / source excerpt: '+(t.discussion||'Not entered'),'Decision: '+(t.decision||'Not recorded'),'Action: '+(t.action||'Not recorded'),'Responsible person: '+(t.owner||'Not assigned'),'Due date: '+(t.due||'Not entered'));});
 if(!m.topics.length)lines.push('Not entered');
 lines.push('','CONCLUSION',m.conclusion||'Not entered');return lines.join('\n');
}
if(typeof module==='object'&&module.exports){module.exports={blank,normalise,topic,suggestTopics,toText};return;}
const doc=root.document,host=doc.getElementById('minutes-maker'),transcript=doc.getElementById('transcript');if(!host||!transcript)return;
const key='analyticah-minutes-v1';let state=blank(),selection='',selectionSource='',selectionStart=0,selectionEnd=0,timer,storedValue=null,dirty=false;
const $=id=>doc.getElementById(id),say=message=>{$('minutes-status').textContent=message;};
try{storedValue=localStorage.getItem(key)||null;state=normalise(JSON.parse(storedValue||'null'));}catch(_){say('Saved minutes could not be read. Original transcript is separate.');}
function save(markDirty=true){clearTimeout(timer);if(markDirty)dirty=true;if(!dirty)return;try{if((localStorage.getItem(key)||null)!==storedValue){say('Minutes changed in another tab. Export this draft now, then reload to see the other version. No draft was overwritten.');return;}const next=JSON.stringify(state);localStorage.setItem(key,next);storedValue=next;dirty=false;say('Minutes draft saved in this browser only.');}catch(_){say('Minutes could not be saved locally. Export TXT now to keep a copy.');}}
function changed(){dirty=true;clearTimeout(timer);timer=setTimeout(()=>save(false),300);}
function field(label,value,onchange,type='text'){
 const wrap=doc.createElement('label');wrap.className='minutes-field';const span=doc.createElement('span');span.textContent=label;wrap.appendChild(span);
 const input=doc.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value;input.addEventListener('input',()=>{onchange(input.value);changed();});wrap.appendChild(input);return wrap;
}
function button(text,fn){const b=doc.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);return b;}
function render(){
 for(const name of ['title','date','venue','conclusion'])$('minutes-'+name).value=state[name];
 const people=$('minutes-attendees');people.replaceChildren();state.attendees.forEach((a,i)=>{
  const row=doc.createElement('div');row.className='minutes-row';row.append(field('Attendee '+(i+1)+' name',a.name,v=>a.name=v),field('Designation / role',a.designation,v=>a.designation=v),button('Remove attendee '+(i+1),()=>{if(confirm('Remove this attendee from the minutes?')){state.attendees.splice(i,1);render();save();}}));people.appendChild(row);
 });
 const topics=$('minutes-topics');topics.replaceChildren();state.topics.forEach((t,i)=>{
  const card=doc.createElement('fieldset');card.className='minutes-topic';const legend=doc.createElement('legend');legend.textContent='Topic '+(i+1);card.appendChild(legend);
  card.append(field('Topic heading',t.title,v=>t.title=v),field('Discussion / source excerpt (edit into a summary)',t.discussion,v=>t.discussion=v,'textarea'),field('Decision',t.decision,v=>t.decision=v,'textarea'),field('Action required',t.action,v=>t.action=v),field('Responsible person',t.owner,v=>t.owner=v),field('Due date',t.due,v=>t.due=v,'date'),button('Remove topic '+(i+1),()=>{if(confirm('Remove this topic from the minutes? The original transcript is kept.')){state.topics.splice(i,1);render();save();}}));topics.appendChild(card);
 });
}
for(const name of ['title','date','venue','conclusion'])$('minutes-'+name).addEventListener('input',e=>{state[name]=e.target.value;changed();});
function capture(){selectionSource=transcript.value;selectionStart=transcript.selectionStart;selectionEnd=transcript.selectionEnd;selection=selectionSource.slice(selectionStart,selectionEnd);$('minutes-selected').textContent=selection?`${selection.length} characters selected. Add as a topic to copy this excerpt.`:'Select transcript text, then add it as a topic. The original stays unchanged.';}
for(const event of ['select','keyup','mouseup','touchend'])transcript.addEventListener(event,capture);
function addTopic(t){if(state.topics.length>=500){say('Maximum 500 topics in one minutes draft. Export and start a new meeting.');return;}state.topics.push(t);render();save();$('minutes-topics').lastElementChild.querySelector('input').focus();}
$('minutes-add-attendee').onclick=()=>{if(state.attendees.length>=500)return;state.attendees.push({name:'',designation:''});render();save();$('minutes-attendees').lastElementChild.querySelector('input').focus();};
$('minutes-add-topic').onclick=()=>addTopic(topic());
$('minutes-from-selection').onclick=()=>{if(transcript.value!==selectionSource){selection='';say('Transcript changed. Select the excerpt again before adding it.');return;}if(!selection.trim()){say('Select some text in the transcript first.');return;}addTopic(topic('',selection));};
$('minutes-suggest').onclick=()=>{
 const candidates=suggestTopics(transcript.value),list=$('minutes-candidates');list.replaceChildren();
 if(!candidates.length){say('No explicit headings found. Add a topic manually or select an excerpt. To suggest headings, use “Topic: Budget” or “Agenda: Recruitment”.');return;}
 for(const heading of candidates){const b=button('Add: '+heading,()=>{addTopic(topic(heading));b.disabled=true;});list.appendChild(b);}
 say('Suggested headings only. Review each before adding. No discussion, decision or conclusion was inferred.');
};
$('minutes-preview').onclick=()=>{$('minutes-output').value=toText(state);$('minutes-output-panel').hidden=false;$('minutes-output').focus();};
function download(data,type,ext){let url,link;try{url=URL.createObjectURL(new Blob([data],{type}));link=doc.createElement('a');link.href=url;link.download='meeting-minutes-'+(state.date||new Date().toISOString().slice(0,10))+'.'+ext;doc.body.appendChild(link);link.click();say('Minutes download requested. Check your downloads.');}catch(_){say('Export unavailable. Use Preview minutes and copy the text.');}finally{link?.remove();if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);}}
$('minutes-txt').onclick=()=>download(toText(state),'text/plain;charset=utf-8','txt');
$('minutes-word').onclick=()=>{if(!root.TranscribeExports){say('Word exporter unavailable. Save TXT instead.');return;}download(root.TranscribeExports.makeDocx(toText(state)),'application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx');};
$('minutes-pdf').onclick=()=>{
 if(!root.TranscribeExports)return;const frame=doc.createElement('iframe');frame.title='Meeting minutes print view';frame.style.cssText='position:fixed;left:-10000px;width:800px;height:1000px;border:0';
 frame.onload=()=>{try{frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});frame.contentWindow.focus();frame.contentWindow.print();say('Choose Save as PDF in the print dialog.');}catch(_){frame.remove();say('Print unavailable. Save TXT or Word instead.');}};
 frame.srcdoc=root.TranscribeExports.printHtml(toText(state)).replace('<title>Transcript</title>','<title>Meeting minutes</title>').replace('<h1>Transcript</h1>','<h1>Meeting minutes</h1>');doc.body.appendChild(frame);setTimeout(()=>frame.remove(),300000);
};
$('minutes-new').onclick=()=>{if(!confirm('Start new minutes? Export the current minutes first if needed. This replaces only the minutes draft, never the transcript.'))return;state=blank();selection='';selectionSource='';$('minutes-selected').textContent='Select transcript text, then add it as a topic. The original stays unchanged.';$('minutes-candidates').replaceChildren();$('minutes-output-panel').hidden=true;render();save();};
root.addEventListener('pagehide',()=>save(false));render();
})(typeof window==='undefined'?globalThis:window);
