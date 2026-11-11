// Cloudflare Worker: deploy separately; set GOOGLE_TRANSLATE_API_KEY as a secret.
// Set ALLOWED_ORIGIN to https://transcribe.analyticah.co.za
const supported=new Set(['en','af','zu']);
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin')||'';
  const allowed=env.ALLOWED_ORIGIN||'https://transcribe.analyticah.co.za';
  const headers={'Access-Control-Allow-Origin':allowed,'Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json; charset=utf-8'};
  if(origin&&origin!==allowed)return new Response(JSON.stringify({error:'Origin not allowed'}),{status:403,headers});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers});
  try{
   if(!env.GOOGLE_TRANSLATE_API_KEY)return new Response(JSON.stringify({error:'Translation provider not configured'}),{status:503,headers});
   const body=await request.json();
   if(typeof body.text!=='string'||!body.text.trim()||body.text.length>5000||!supported.has(body.target)||!(body.source==='auto'||supported.has(body.source)))
    return new Response(JSON.stringify({error:'Invalid text or language'}),{status:400,headers});
   const payload={q:body.text,target:body.target,format:'text'};
   if(body.source!=='auto')payload.source=body.source;
   const upstream=await fetch('https://translation.googleapis.com/language/translate/v2',{method:'POST',headers:{'Content-Type':'application/json','X-goog-api-key':env.GOOGLE_TRANSLATE_API_KEY},body:JSON.stringify(payload)});
   if(!upstream.ok)return new Response(JSON.stringify({error:'Translation provider failed'}),{status:502,headers});
   const data=await upstream.json();
   const translation=data?.data?.translations?.[0]?.translatedText;
   if(typeof translation!=='string')throw new Error('Invalid provider response');
   return new Response(JSON.stringify({translation}),{status:200,headers});
  }catch(e){return new Response(JSON.stringify({error:'Translation request failed'}),{status:500,headers})}
 }
};
