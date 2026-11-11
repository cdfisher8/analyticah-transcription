const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const source=readFileSync(join(__dirname,'..','upload.js'),'utf8');
const accessCode='test-only-app-access-code-123456789';
const ready={enabled:true,provider:'OpenAI',requiresAccessCode:true,maxFileBytes:25_000_000,maxDurationSeconds:1800};
const flush=()=>new Promise(setImmediate);
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function file(name='voice.mp3',bytes=Buffer.from('ID3\u0004\u0000\u0000synthetic'),type='audio/mpeg'){return new File([bytes],name,{type});}
function app(options={}){
  const elements={};
  for(const id of ['upload-status','audio-file','upload-cancel','upload-retry','upload-access-code','upload-consent','upload-start','start','stop','lang','transcript']){
    elements[id]={textContent:'',value:'',disabled:false,checked:false,files:[],events:{},scrollTop:0,scrollHeight:100,
      addEventListener(name,fn){this.events[name]=fn;},dispatchEvent(event){this.events[event.type]?.(event);}};
  }
  elements.stop.disabled=true;elements['upload-access-code'].value=accessCode;elements['upload-consent'].checked=true;
  const calls=[],windowEvents={},timers=new Map();let id=0,saves=0;
  const window={isSecureContext:options.secure!==false,location:{origin:options.origin||'https://transcribe.analyticah.co.za'},ANALYTICAH_UPLOAD_CONFIG:options.config||{},addEventListener(name,fn){windowEvents[name]=fn;}};
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(url.endsWith('/api/capabilities')) return options.capabilitiesResponse ? options.capabilitiesResponse() : new Response(JSON.stringify(options.capabilities||ready),{status:200});
    if(options.uploadResponse)return options.uploadResponse(url,init);
    return new Response(JSON.stringify({text:'Uploaded transcript.',durationSeconds:3}),{status:200});
  };
  vm.runInContext(source,vm.createContext({window,document:{getElementById:id=>elements[id]},URL,Uint8Array,AbortController,AbortSignal,Event,fetch:fetchImpl,
    saveDraft:()=>{saves++;},setTimeout:(fn,delay)=>{const current=++id;timers.set(current,{fn,delay});return current;},clearTimeout:id=>timers.delete(id)}));
  return {elements,calls,timers,saves:()=>saves,select:async f=>{elements['audio-file'].files=Array.isArray(f)?f:[f];await elements['audio-file'].events.change();},upload:()=>elements['upload-start'].events.click(),cancel:()=>elements['upload-cancel'].events.click(),hide:()=>windowEvents.pagehide(),runTimer:()=>{const [id,timer]=timers.entries().next().value;timers.delete(id);timer.fn();}};
}

test('choosing a supported file does not upload it',async()=>{
  const a=app();await flush();await a.select(file());
  assert.equal(a.calls.length,1);assert.match(a.elements['upload-status'].textContent,/Nothing has been uploaded/);
  assert.equal(a.elements['upload-start'].disabled,false);
});
test('upload appends without overwriting existing text and saves immediately',async()=>{
  const a=app();await flush();a.elements.transcript.value='Existing edits';await a.select(file());await a.upload();
  assert.equal(a.elements.transcript.value,'Existing edits\n\nUploaded transcript.');assert.equal(a.saves(),1);
  assert.equal(a.calls[1].init.headers['X-App-Access-Code'],accessCode);
  assert.equal(a.calls[1].init.credentials,'omit');assert.equal(a.calls[1].init.redirect,'error');
  assert.equal(a.elements.start.disabled,false);assert.equal(a.elements['upload-cancel'].disabled,true);
});
for(const [sample,expected] of [[file('malware.exe'),/Unsupported/],[file('empty.mp3',Buffer.alloc(0)),/empty/],[file('fake.mp3',Buffer.from('<html>fake file</html>')),/Renaming/],[{name:'large.mp3',size:25_000_001},/larger than 25 MB/]]){
  test(`file validation rejects ${sample.name}`,async()=>{const a=app();await flush();await a.select(sample);assert.match(a.elements['upload-status'].textContent,expected);assert.equal(a.elements['upload-start'].disabled,true);assert.equal(a.calls.length,1);});
}
test('multiple files are rejected rather than quietly choosing one',async()=>{const a=app();await flush();await a.select([file(),file('two.mp3')]);assert.equal(a.elements['upload-start'].disabled,true);assert.match(a.elements['upload-status'].textContent,/one recording/);});
test('uppercase MP3 extension and empty MIME type are supported',async()=>{const a=app();await flush();await a.select(file('VOICE.MP3',Buffer.from('ID3 valid bytes'),''));await a.upload();assert.equal(a.calls[1].init.headers['Content-Type'],'application/octet-stream');});
test('permission/processing consent is required before any file transmission',async()=>{const a=app();await flush();await a.select(file());a.elements['upload-consent'].checked=false;await a.upload();assert.equal(a.calls.length,1);assert.match(a.elements['upload-status'].textContent,/Confirm/);});
test('an OpenAI API key entered in access field is never transmitted',async()=>{const a=app();await flush();await a.select(file());a.elements['upload-access-code'].value='sk-fake-should-never-be-sent';await a.upload();assert.equal(a.calls.length,1);assert.match(a.elements['upload-status'].textContent,/Do not enter an OpenAI API key/);});
test('short access code does not trigger an upload',async()=>{const a=app();await flush();await a.select(file());a.elements['upload-access-code'].value='short';await a.upload();assert.equal(a.calls.length,1);});
test('active microphone capture blocks starting a file upload',async()=>{const a=app();await flush();await a.select(file());a.elements.stop.disabled=false;await a.upload();assert.equal(a.calls.length,1);assert.match(a.elements['upload-status'].textContent,/Stop live listening/);});
test('duplicate Transcribe clicks produce one request',async()=>{const result=deferred();const a=app({uploadResponse:()=>result.promise});await flush();await a.select(file());const first=a.upload();await a.upload();assert.equal(a.calls.length,2);assert.equal(a.elements.start.disabled,true);result.resolve(new Response('{"text":"One"}',{status:200}));await first;assert.equal(a.elements.transcript.value,'One');});
test('Cancel ignores a late successful result and preserves manual edits',async()=>{const result=deferred();const a=app({uploadResponse:()=>result.promise});await flush();await a.select(file());a.elements.transcript.value='Keep me';const pending=a.upload();a.cancel();result.resolve(new Response('{"text":"Too late"}',{status:200}));await pending;assert.equal(a.elements.transcript.value,'Keep me');assert.match(a.elements['upload-status'].textContent,/cancelled/);assert.equal(a.elements.start.disabled,false);});
test('old cancelled request cannot affect a newer upload',async()=>{const first=deferred();let calls=0;const a=app({uploadResponse:()=>++calls===1?first.promise:Promise.resolve(new Response('{"text":"New"}',{status:200}))});await flush();await a.select(file());const old=a.upload();a.cancel();await a.upload();first.resolve(new Response('{"text":"Old"}',{status:200}));await old;assert.equal(a.elements.transcript.value,'New');});
test('edits made while transcription runs are preserved',async()=>{const result=deferred();const a=app({uploadResponse:()=>result.promise});await flush();await a.select(file());const pending=a.upload();a.elements.transcript.value='Edited while waiting';result.resolve(new Response('{"text":"Result"}',{status:200}));await pending;assert.equal(a.elements.transcript.value,'Edited while waiting\n\nResult');});
for(const response of [()=>new Response('null',{status:200}),()=>new Response('null',{status:400}),()=>new Response('{"message":"Rate limit reached."}',{status:429}),()=>new Response('not JSON',{status:500}),()=>new Response('{"text":123}',{status:200}),()=>Promise.reject(new Error('Network failure'))]){
  test('failed upload preserves the transcript and restores controls',async()=>{const a=app({uploadResponse:response});await flush();await a.select(file());a.elements.transcript.value='Keep this';await a.upload();assert.equal(a.elements.transcript.value,'Keep this');assert.equal(a.elements.start.disabled,false);assert.equal(a.elements['upload-start'].disabled,false);assert.equal(a.saves(),0);});
}
test('empty recognition result does not erase or append to existing transcript',async()=>{const a=app({uploadResponse:()=>new Response('{"text":"   "}',{status:200})});await flush();await a.select(file());a.elements.transcript.value='Existing';await a.upload();assert.equal(a.elements.transcript.value,'Existing');assert.match(a.elements['upload-status'].textContent,/No speech/);});
test('HTTPS is required before configuration checks or file uploads',async()=>{const a=app({secure:false,origin:'http://transcribe.analyticah.co.za'});await flush();assert.equal(a.calls.length,0);assert.match(a.elements['upload-status'].textContent,/HTTPS/);});
for(const apiBase of ['http://untrusted.example','https://user:pass@example.com','https://example.com/path','https://example.com?key=x']){
  test('unsafe backend URL is rejected: '+apiBase,async()=>{const a=app({config:{apiBase}});await flush();assert.equal(a.calls.length,0);assert.match(a.elements['upload-status'].textContent,/not configured/);});
}
test('disabled backend is described honestly and cannot upload',async()=>{const a=app({capabilities:{...ready,enabled:false}});await flush();await a.select(file());await a.upload();assert.equal(a.calls.length,1);assert.equal(a.elements['upload-start'].disabled,true);});
test('missing backend does not break microphone controls',async()=>{const a=app({capabilitiesResponse:()=>new Response('Not found',{status:404})});await flush();assert.equal(a.elements.start.disabled,false);assert.match(a.elements['upload-status'].textContent,/unavailable or not configured/);});
test('a failed local file read does not upload anything',async()=>{const a=app();await flush();await a.select({name:'note.mp3',size:20,slice:()=>({arrayBuffer:async()=>{throw new Error();}})});assert.equal(a.calls.length,1);assert.match(a.elements['upload-status'].textContent,/could not be read/);});
test('stale file inspection cannot replace a newer selection',async()=>{const old=deferred();const a=app();await flush();const first=a.select({name:'old.mp3',size:20,slice:()=>({arrayBuffer:()=>old.promise})});await a.select(file('new.mp3'));old.resolve(Buffer.from('ID3 old bytes'));await first;await a.upload();assert.equal(a.calls[1].init.headers['X-File-Name'],'new.mp3');});
test('page exit cancels pending work and clears the access code',async()=>{const result=deferred();const a=app({uploadResponse:()=>result.promise});await flush();await a.select(file());const pending=a.upload();a.hide();result.resolve(new Response('{"text":"Too late"}',{status:200}));await pending;assert.equal(a.elements.transcript.value,'');assert.equal(a.elements['upload-access-code'].value,'');assert.equal(a.calls[1].init.signal.aborted,true);});

test('back-forward cached page restores controls after upload cancellation and rejects stale results', async () => {
  const oldResult = deferred(); let uploads = 0;
  const a = app({uploadResponse:() => ++uploads === 1 ? oldResult.promise : Promise.resolve(new Response('{"text":"Fresh result"}', {status:200}))});
  await flush(); await a.select(file()); a.elements.transcript.value = 'Existing transcript';
  const pending = a.upload(); assert.equal(a.elements['audio-file'].disabled, true);
  a.hide();
  for (const id of ['audio-file','upload-retry','upload-access-code','upload-consent','upload-start','start','lang']) {
    assert.equal(a.elements[id].disabled, false, `${id} must be usable when the page is restored`);
  }
  assert.equal(a.elements['upload-cancel'].disabled, true);
  assert.equal(a.elements['upload-access-code'].value, '');
  a.elements['upload-access-code'].value = accessCode; await a.upload();
  oldResult.resolve(new Response('{"text":"Stale result"}', {status:200})); await pending;
  assert.equal(a.elements.transcript.value, 'Existing transcript\n\nFresh result');
  assert.equal(a.saves(), 1); assert.equal(a.timers.size, 0);
});
