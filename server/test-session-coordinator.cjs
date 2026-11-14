'use strict';
// Isolated lifecycle contract, NOT an HTTP endpoint or production authority.
class TestSessionCoordinator {
  constructor({environment,authority,worker}={}){
    if(environment!=='test'||!authority||!worker)throw Error('Isolated test adapters required');
    this.authority=authority;this.worker=worker;this.run=null;this.pendingCleanup=new Map();
  }
  async start(credential){
    if(this.run)throw Error('Session already active');
    const run={credential,cancelled:false,lease:null,renewing:false,phase:'acquiring'};this.run=run;
    try{return await this.acquire(run);}catch(e){if(this.run===run)await this.stop().catch(()=>{});throw e;}
  }
  async acquire(run){
    run.phase='acquiring';
    const lease=await this.authority.open(run.credential);
    if(!lease||typeof lease.id!=='string'||!lease.id)throw Error('Invalid trusted lease');
    if(run.cancelled||this.run!==run){await this.cleanup(run,lease.id);return null;}
    run.lease=lease;
    // Worker must enforce expiry itself. Frontend clocks are never usage evidence.
    await this.worker.begin(run.credential,lease);
    if(run.cancelled||this.run!==run||run.lease!==lease){await this.cleanup(run,lease.id);return null;}
    run.phase='active';
    return lease;
  }
  async renew(){
    const run=this.run;
    if(!run||run.cancelled||!run.lease)throw Error('No active lease');
    if(run.renewing)throw Error('Renewal already pending');
    if(run.phase!=='active')throw Error('Allowance not active yet');
    run.renewing=true;
    try{
      const old=run.lease;
      await this.cleanup(run,old.id);
      run.lease=null;
      if(run.cancelled||this.run!==run)return null;
      return await this.acquire(run);
    }catch(e){if(this.run===run)await this.stop().catch(()=>{});throw e;}
    finally{run.renewing=false;}
  }
  async cleanup(run,id){
    this.pendingCleanup.set(id,run);
    // Halt must be attempted even if revocation fails. Hold accounting until both succeed.
    const [revoked,halted]=await Promise.allSettled([
      Promise.resolve().then(()=>this.authority.revoke(run.credential,id)),
      Promise.resolve().then(()=>this.worker.halt(id))
    ]);
    if(revoked.status==='rejected'||halted.status==='rejected')throw Error('Cleanup pending; durable reconciliation required');
    await this.authority.settle(halted.value);
    this.pendingCleanup.delete(id);
  }
  async retryCleanup(id){const run=this.pendingCleanup.get(id);if(run)await this.cleanup(run,id);}
  async stop(){
    const run=this.run;if(!run)return;
    run.cancelled=true;this.run=null;
    if(run.lease){
      const id=run.lease.id;
      // Mark stopped immediately, but never report settlement success without receipt.
      await this.cleanup(run,id);
    }
  }
}
module.exports={TestSessionCoordinator};
