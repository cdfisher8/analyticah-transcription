const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {makeDocx,printHtml,crc32}=require('../exports.js');
test('DOCX uses ZIP entries, valid CRCs and escaped paragraph XML',()=>{
  const data=Buffer.from(makeDocx('Speaker 1: Hello & <friend>\n\nSpeaker 2: Café 😊'));let pos=0;const files={};
  while(data.readUInt32LE(pos)===0x04034b50){const size=data.readUInt32LE(pos+18),n=data.readUInt16LE(pos+26);const name=data.subarray(pos+30,pos+30+n).toString();const body=data.subarray(pos+30+n,pos+30+n+size);assert.equal(crc32(body),data.readUInt32LE(pos+14));files[name]=body.toString();pos+=30+n+size;}
  assert.equal(data.readUInt32LE(pos),0x02014b50);assert.equal(data.readUInt32LE(data.length-22),0x06054b50);assert.equal(data.readUInt16LE(data.length-12),3);
  assert.match(files['word/document.xml'],/Speaker 1: Hello &amp; &lt;friend&gt;/);assert.match(files['word/document.xml'],/Café 😊/);assert.equal((files['word/document.xml'].match(/<w:p>/g)||[]).length,3);assert.match(files['_rels/.rels'],/Target="word\/document.xml"/);
});
test('print view preserves paragraphs and escapes markup rather than running it',()=>{const html=printHtml('Speaker 1: <script>bad</script>\n\nSpeaker 2: hello');assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>'));assert.match(html,/\n\nSpeaker 2/);});
test('latest frontend has TXT, Word and PDF controls and no translation code',()=>{const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');assert.match(html,/Save TXT/);assert.match(html,/Save Word \(\.docx\)/);assert.match(html,/Print \/ Save PDF/);assert.doesNotMatch(html,/translate|translation|Translator/i);assert.match(html,/pagehide.*saveDraft\(\)/);});
