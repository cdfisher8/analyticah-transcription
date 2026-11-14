'use strict';
// Server-side test repository. Not browser localStorage and not a production DB.
class TestAccountDrafts {
 constructor({environment,authenticate}={}){
  if(environment!=='test'||typeof authenticate!=='function')throw Error('Isolated test authentication required');
  this.authenticate=authenticate;this.rows=new Map();
 }
 owner(credential){const p=this.authenticate(credential);if(!p||p.verified!==true||p.product!=='transcribe'||typeof p.id!=='string'||!p.id)throw Error('Verified product identity required');return p.id;}
 key(credential,kind){if(!['transcript','minutes'].includes(kind))throw Error('Invalid draft type');return JSON.stringify([this.owner(credential),kind]);}
 read(credential,kind){const row=this.rows.get(this.key(credential,kind));return row?structuredClone(row):{revision:0,text:''};}
 write(credential,kind,text,expectedRevision){const key=this.key(credential,kind),old=this.rows.get(key)||{revision:0};if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==old.revision)throw Error('Draft revision conflict');if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>1024*1024)throw Error('Draft limit exceeded');const row={revision:old.revision+1,text};this.rows.set(key,row);return structuredClone(row);}
}
module.exports={TestAccountDrafts};
