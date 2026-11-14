'use strict';
// Synthetic integration only: no HTTP, payment provider, microphone or audio.
const test=require('node:test'),assert=require('node:assert/strict');
const {TestEntitlements}=require('../server/entitlements.cjs');
const {SessionController}=require('../session-control.js');
const fs=require('node:fs'),path=require('node:path');
function fixture(policyEnabled=true){
 const now=Date.UTC(2026,10,14),payment={},receipt={}; let leaseId,opens=0,closed=0;
 const policy={testFixture:true,version:'integration_fixture',timeZone:'UTC',meteringPolicy:'fixture',failurePolicy:'fixture',refundPolicy:'fixture',leaseMs:60000,prepaidExpiry:()=>Date.UTC(2026,11,1),unlimitedPeriod:e=>({starts:e.paidAt,expires:e.paidAt+86400000})};
 const ledger=new TestEntitlements({environment:'test',clock:()=>now,authenticate:c=>c==='fixture-session'?{id:'fixture_owner',product:'transcribe',verified:true}:null,policy:policyEnabled?policy:null,verifyPayment:p=>p===payment?{id:'fixture_order',owner:'fixture_owner',product:'transcribe',environment:'test',policyVersion:policy.version,currency:'ZAR',paidAt:now,kind:'prepaid',quantity:1,amountCents:1000}:null,verifyMeter:r=>r===receipt?{id:'fixture_receipt',owner:'fixture_owner',product:'transcribe',environment:'test',policyVersion:policy.version,leaseId,usedMs:1000,final:true}:null});
 const views=[];
 const controller=new SessionController({authority:{openSession(){const l=ledger.openSession('fixture-session','fixture_start');leaseId=l.id;return l;},closeSession:id=>ledger.closeSession('fixture-session',id)},now:()=>0,wallNow:()=>now,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},render:v=>views.push(v),onResult(){},openMicrophone:async()=>{opens++;return {close(){closed++;}};},createRecognition:()=>({start(){this.onstart();},abort(){}})});
 return {ledger,controller,views,payment,receipt,opens:()=>opens,closed:()=>closed,id:()=>leaseId};
}
test('controller and test ledger reserve, Stop revokes, trusted receipt alone restores unused time',async()=>{
 const f=fixture();try{f.ledger.grant(f.payment);await f.controller.start();assert.equal(f.opens(),1);assert.equal(f.views.at(-1).state,'listening');assert.equal(f.ledger.balance('fixture-session').prepaidAvailableMs,'3540000');f.controller.stop();await Promise.resolve();assert.equal(f.closed(),1);assert.equal(f.ledger.isActive(f.id(),'fixture_owner'),false);assert.equal(f.ledger.balance('fixture-session').prepaidAvailableMs,'3540000');f.ledger.settle(f.receipt);assert.equal(f.ledger.balance('fixture-session').prepaidAvailableMs,'3599000');}finally{f.ledger.close();}
});
test('unresolved ledger policy cannot be bypassed by controller or start a microphone',async()=>{
 const f=fixture(false);try{await f.controller.start();assert.equal(f.opens(),0);assert.equal(f.controller.run,null);assert.match(f.views.at(-1).message,/Unresolved policy/);}finally{f.ledger.close();}
});
test('combined page keeps test ledger off client and explicitly warns listening is blocked',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/const creditAuthority=null/);assert.match(html,/Listening is blocked/);
 assert.match(html,/src="minutes.js"/);assert.match(html,/src="session-control.js"/);
 assert.doesNotMatch(html,/<script[^>]*src=[^>]*entitlements/);
 assert.doesNotMatch(html,/id=["']translate/i);
});
