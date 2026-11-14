/* Local-only exports. DOCX is a valid Open XML ZIP, never an HTML file renamed .doc. */
(function(root){
  'use strict';
  const escapeXml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function xmlText(text) { return escapeXml(text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'')); }
  function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
  function zip(files){
    const encoder=new TextEncoder(), parts=[], directory=[]; let offset=0;
    const header=(size)=>{const bytes=new Uint8Array(size);return [bytes,new DataView(bytes.buffer)];};
    for(const [name,content] of Object.entries(files)){
      const filename=encoder.encode(name), data=encoder.encode(content), crc=crc32(data);
      const [local,l]=header(30);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,33,true);l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,filename.length,true);
      parts.push(local,filename,data);
      const [central,c]=header(46);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,filename.length,true);c.setUint32(42,offset,true);directory.push(central,filename);offset+=30+filename.length+data.length;
    }
    const directorySize=directory.reduce((sum,p)=>sum+p.length,0), [end,e]=header(22);e.setUint32(0,0x06054b50,true);e.setUint16(8,Object.keys(files).length,true);e.setUint16(10,Object.keys(files).length,true);e.setUint32(12,directorySize,true);e.setUint32(16,offset,true);
    const bytes=new Uint8Array(offset+directorySize+22);let at=0;for(const p of [...parts,...directory,end]){bytes.set(p,at);at+=p.length;}return bytes;
  }
  function makeDocx(text){
    const paragraphs=text.replace(/\r\n?/g,'\n').split('\n').map(line=>'<w:p><w:r><w:t xml:space="preserve">'+xmlText(line)+'</w:t></w:r></w:p>').join('');
    return zip({
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/document.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+paragraphs+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>'
    });
  }
  function printHtml(text){return '<!doctype html><html><head><meta charset="utf-8"><title>Transcript</title><style>@page{size:A4;margin:20mm}body{font:12pt/1.5 Arial,sans-serif;color:#111}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}</style></head><body><h1>Transcript</h1><pre>'+escapeXml(text)+'</pre></body></html>';}
  if(typeof module==='object'&&module.exports){module.exports={makeDocx,printHtml,crc32};return;}
  root.TranscribeExports={makeDocx,printHtml};
  const doc=root.document, area=doc.getElementById('transcript'); if(!area)return;
  const say=text=>{doc.getElementById('status').textContent=text;};
  doc.getElementById('save-word').addEventListener('click',()=>{
    let url,link;
    try{const blob=new Blob([makeDocx(area.value)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});url=URL.createObjectURL(blob);link=doc.createElement('a');link.href=url;link.download='transcript-'+new Date().toISOString().slice(0,10)+'.docx';doc.body.appendChild(link);link.click();say('Word download requested. Check your downloads.');}
    catch(_){say('Word export unavailable. Save TXT to keep a copy.');}
    finally{if(link)link.remove();if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);}
  });
  doc.getElementById('save-pdf').addEventListener('click',()=>{
    const frame=doc.createElement('iframe');frame.title='Transcript print view';frame.style.cssText='position:fixed;left:-10000px;width:800px;height:1000px;border:0';
    frame.onload=()=>{try{frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});frame.contentWindow.focus();frame.contentWindow.print();say('Choose Save as PDF in the print dialog. No PDF is saved until you confirm.');}catch(_){frame.remove();say('Print unavailable. Save TXT or Word instead.');}};
    frame.srcdoc=printHtml(area.value);doc.body.appendChild(frame);setTimeout(()=>frame.remove(),300000);
  });
})(typeof window==='undefined'?globalThis:window);
