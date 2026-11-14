'use strict';
// Isolated UI lifecycle contract. No network, storage, identity or microphone implementation.
class TestAccountWorkspace {
 constructor({environment,transport,clearView,render,stop}={}) {
  if(environment!=='test'||!transport||![clearView,render,stop].every(f=>typeof f==='function'))throw Error('Isolated test adapters required');
  Object.assign(this,{transport,clearView,render,stop});this.generation=0;this.account=null;this.binding=null;this.rows=null;this.saving=false;this.cleanup=null;
 }
 async disconnect(){
  ++this.generation;this.account=null;this.binding=null;this.rows=null;this.saving=false;
  // Clearing visible/private draft state must not wait for remote cleanup.
  let clearError;try{this.clearView();}catch(e){clearError=e;}
  const previous=this.cleanup;
  const cleanup=Promise.resolve(previous).then(()=>this.stop());this.cleanup=cleanup;
  await cleanup;if(this.cleanup===cleanup)this.cleanup=null;
  if(clearError)throw clearError;
 }
 async retryCleanup(){
  if(this.account)throw Error('Disconnect first');
  ++this.generation;
  const cleanup=Promise.resolve(this.cleanup).catch(()=>{}).then(()=>this.stop());this.cleanup=cleanup;
  await cleanup;if(this.cleanup===cleanup)this.cleanup=null;
 }
 async connect(){
  // Credentials are handled by transport (future same-origin HttpOnly session), never owner JSON.
  const disconnected=this.disconnect(),generation=this.generation;
  const current=()=>generation===this.generation;
  await disconnected;if(!current())return false;
  const identity=await this.transport.identity();if(!current())return false;
  if(!identity||identity.product!=='transcribe'||identity.verified!==true||typeof identity.id!=='string'||!identity.id||typeof identity.binding!=='string'||!identity.binding)throw Error('Verified Transcribe account required');
  const rows=await this.transport.readDrafts(identity.binding);if(!current())return false;
  for(const kind of ['transcript','minutes'])if(!rows?.[kind]||typeof rows[kind].text!=='string'||!Number.isSafeInteger(rows[kind].revision)||rows[kind].revision<0)throw Error('Invalid draft response');
  // Transport MUST atomically bind the request and response to the same server session.
  if(rows.accountId!==identity.id)throw Error('Account changed during load');
  this.account=identity.id;this.binding=identity.binding;this.rows=structuredClone(rows);this.render(structuredClone(rows));return true;
 }
 async save(kind,text){
  if(!this.account||!this.rows||this.saving||!['transcript','minutes'].includes(kind)||typeof text!=='string')throw Error('Workspace not ready');
  const generation=this.generation,account=this.account;this.saving=true;
  try{
   const row=await this.transport.writeDraft(this.binding,kind,text,this.rows[kind].revision);
   if(generation!==this.generation)return false;
   if(row?.accountId!==account||typeof row.text!=='string'||row.revision!==this.rows[kind].revision+1)throw Error('Invalid account draft response');
   this.rows[kind]={text:row.text,revision:row.revision};this.render(structuredClone(this.rows));return true;
  }finally{if(generation===this.generation)this.saving=false;}
 }
}
module.exports={TestAccountWorkspace};
