/* Preview session controller. It is NOT a payment or security authority. */
(function(root){
'use strict';
class SessionController {
  constructor(deps){this.d=deps;this.run=null;this.auto=false;this.lastStopped=null;}
  current(r){return this.run===r&&!r.cancelled;}
  remaining(r){return Math.max(0,Math.min(r.seconds-(r.startedAt===null?0:(this.d.now()-r.startedAt)/1000),(r.expiresAt-this.d.wallNow())/1000));}
  emit(state,r=this.run,message=''){this.d.render({state,remainingSeconds:r?this.remaining(r):null,message});}
  async start(){
    if(this.run)return;
    const r={cancelled:false,lease:null,seconds:0,expiresAt:0,startedAt:null,rec:null,mic:null,timer:null,retry:null,restarts:0,phase:'authorizing',abort:new AbortController()};
    this.run=r;this.emit('authorizing',null,'Checking time allowance…');
    try {
      if(!this.d.authority)throw Error('Credit service is not connected. Available time is unknown.');
      const lease=await this.d.authority.openSession();
      r.lease=lease;
      if(!this.current(r)){this.releaseLease(r);return;}
      if(!lease||typeof lease.id!=='string'||!lease.id||!Number.isFinite(lease.remainingSeconds)||lease.remainingSeconds<=0||!Number.isFinite(lease.expiresAt)||lease.expiresAt<=this.d.wallNow())throw Error('No valid time allowance. Check your subscription or credits.');
      r.seconds=lease.remainingSeconds;r.expiresAt=lease.expiresAt;
      r.timer=this.d.setInterval(()=>this.tick(r),250);
      await this.listen(r);
    }catch(error){if(this.current(r))this.stop(error.message);}
  }
  releaseLease(r){if(r.lease&&this.d.authority){const lease=r.lease;r.lease=null;Promise.resolve().then(()=>this.d.authority.closeSession(lease.id)).catch(()=>{if(!this.run&&this.lastStopped===r)this.d.onSettlementError?.();});}}
  tick(r){if(!this.current(r))return;if(this.remaining(r)<=0){this.stop('Time allowance ended. Add credits before continuing.');return;}this.emit(r.phase,r);}
  async listen(r){
    if(!this.current(r))return;
    if(this.remaining(r)<=0){this.stop('Time allowance ended.');return;}
    r.phase='starting';this.emit('starting',r,'Requesting microphone…');
    try{
      const mic=await this.d.openMicrophone(r.abort.signal);
      if(!this.current(r)){mic.close();return;}
      r.mic=mic;mic.activate?.();
      if(this.remaining(r)<=0){this.stop('Time allowance ended.');return;}
      const rec=this.d.createRecognition();r.rec=rec;
      rec.onstart=()=>{if(!this.current(r)||r.rec!==rec||r.phase!=='starting')return;r.startedAt=this.d.now();r.phase='listening';this.emit('listening',r);};
      rec.onresult=event=>{if(!this.current(r)||r.rec!==rec||r.phase!=='listening')return;r.restarts=0;this.d.onResult(event);};
      rec.onerror=event=>{if(!this.current(r)||r.rec!==rec)return; if(['not-allowed','service-not-allowed','language-not-supported','audio-capture'].includes(event.error)){this.stop('Recognition unavailable: '+event.error);return;}r.error=event.error;};
      rec.onend=()=>{
        if(!this.current(r)||r.rec!==rec)return;
        if(r.startedAt!==null){r.seconds=this.remaining(r);r.startedAt=null;}
        r.rec=null;r.mic?.close();r.mic=null;
        if(this.remaining(r)<=0){this.stop('Time allowance ended.');return;}
        if(this.auto&&r.restarts<3){r.restarts++;r.phase='reconnecting';this.emit('reconnecting',r);r.retry=this.d.setTimeout(()=>{r.retry=null;if(this.current(r)&&this.auto)this.listen(r);else if(this.current(r)){r.phase='paused';this.emit('paused',r);}},500);}
        else {r.phase='paused';this.emit('paused',r,r.restarts>=3?'Repeated interruptions. Tap Continue to retry.':'Tap Continue when ready.');}
      };
      rec.start();
    }catch(error){if(this.current(r))this.stop('Could not listen: '+error.message);}
  }
  setAuto(enabled){this.auto=Boolean(enabled);const r=this.run;if(r&&r.phase==='reconnecting'&&!this.auto){if(r.retry)this.d.clearTimeout(r.retry);r.retry=null;r.phase='paused';this.emit('paused',r);} /* Turning on never starts a paused/stopped session. */}
  async continue(){const r=this.run;if(!r||r.phase!=='paused')return;r.restarts=0;await this.listen(r);}
  stop(message='Stopped. Tap Start for a new session.'){
    const r=this.run;this.run=null;
    if(r){this.lastStopped=r;r.cancelled=true;r.abort.abort();if(r.timer)this.d.clearInterval(r.timer);if(r.retry)this.d.clearTimeout(r.retry);if(r.rec){r.rec.onstart=r.rec.onresult=r.rec.onerror=r.rec.onend=null;try{r.rec.abort();}catch(_){}}r.mic?.close();r.mic=null;this.releaseLease(r);}
    this.emit('stopped',null,message);
  }
}
function formatTime(seconds){if(seconds===null||!Number.isFinite(seconds))return 'Unknown';const n=Math.max(0,Math.ceil(seconds));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':');}
if(typeof module==='object'&&module.exports){module.exports={SessionController,formatTime};return;}
root.TranscribeSession={SessionController,formatTime};
})(typeof window==='undefined'?globalThis:window);
