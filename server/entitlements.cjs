'use strict';
// TEST-ONLY domain component. No HTTP listener, payment verifier or production adapter.
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const PRODUCT = 'transcribe';
function fail(message) { throw new Error(message); }
function text(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value); }
function integer(value, min = 0) { return Number.isSafeInteger(value) && value >= min; }
function price(quantity) {
  if (!integer(quantity, 1) || !Number.isSafeInteger(quantity * 3600000) || !Number.isSafeInteger(quantity * 1000)) fail('Invalid R10 quantity');
  return { amountCents: quantity * 1000, allowanceMs: quantity * 3600000, currency: 'ZAR' };
}
class TestEntitlements {
  constructor({ environment, filename = ':memory:', clock, authenticate, verifyPayment, verifyMeter, policy } = {}) {
    if (environment !== 'test') fail('Only isolated test environment is supported');
    if (![clock, authenticate, verifyPayment, verifyMeter].every(fn => typeof fn === 'function')) fail('Trusted test adapters required');
    this.clock = clock; this.authenticate = authenticate; this.verifyPayment = verifyPayment; this.verifyMeter = verifyMeter;
    this.policy = policy; this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS grants(id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, total INTEGER NOT NULL, available INTEGER NOT NULL, starts INTEGER NOT NULL, expires INTEGER NOT NULL, fingerprint TEXT NOT NULL, policy_version TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS leases(id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_key TEXT NOT NULL, grant_id TEXT NOT NULL REFERENCES grants(id), reserved INTEGER NOT NULL, expires INTEGER NOT NULL, state TEXT NOT NULL, used INTEGER, receipt TEXT UNIQUE, policy_version TEXT NOT NULL, UNIQUE(owner,request_key));
      CREATE TABLE IF NOT EXISTS clock_guard(id INTEGER PRIMARY KEY CHECK(id=1), observed INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_lease ON leases(owner) WHERE state='active';`);
  }
  now() {
    const n = this.clock(); if (!integer(n)) fail('Invalid server clock');
    const accepted = this.db.prepare('INSERT INTO clock_guard VALUES(1,?) ON CONFLICT(id) DO UPDATE SET observed=excluded.observed WHERE excluded.observed>=clock_guard.observed RETURNING observed').get(n);
    if (!accepted) fail('Server clock moved backwards; reconciliation required');
    return n;
  }
  ready() {
    const p = this.policy;
    if (!p || p.testFixture !== true || !text(p.version) || !p.timeZone || !text(p.meteringPolicy) || !text(p.failurePolicy) || !text(p.refundPolicy) || !integer(p.leaseMs, 1) || typeof p.prepaidExpiry !== 'function' || typeof p.unlimitedPeriod !== 'function') fail('Unresolved policy: paid entitlements disabled');
    try { new Intl.DateTimeFormat('en', { timeZone: p.timeZone }); } catch { fail('Invalid timezone'); }
    return p;
  }
  owner(credential) {
    // Adapter resolves a separate Transcribe server session. Never accept owner IDs from HTTP JSON.
    const identity = this.authenticate(credential);
    if (!identity || identity.product !== PRODUCT || identity.verified !== true || !text(identity.id)) fail('Verified Transcribe identity required');
    return identity.id;
  }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  expire(now) { this.db.prepare("UPDATE leases SET state='expired' WHERE state='active' AND expires<=?").run(now); }
  grant(envelope) {
    const p = this.ready();
    // Future verifier must authenticate central Payments outbox, merchant confirmation,
    // audience, environment, owner, immutable order, exact amount and replay identity.
    const event = this.verifyPayment(envelope);
    if (!event || event.environment !== 'test' || event.product !== PRODUCT || event.policyVersion !== p.version || !text(event.id) || !text(event.owner) || event.currency !== 'ZAR' || !integer(event.paidAt)) fail('Invalid verified test payment');
    const now = this.now(); if (event.paidAt > now) fail('Future payment rejected');
    let total, starts, expires;
    if (event.kind === 'prepaid') {
      const q = price(event.quantity); if (event.amountCents !== q.amountCents) fail('Amount mismatch'); total = q.allowanceMs; starts = event.paidAt; expires = p.prepaidExpiry(event.paidAt, p.timeZone);
    } else if (event.kind === 'unlimited') {
      if (event.amountCents !== 30000 || event.quantity !== 1) fail('Unlimited amount mismatch');
      ({ starts, expires } = p.unlimitedPeriod(event)); total = 0;
    } else fail('Unknown entitlement');
    if (!integer(starts) || !integer(expires) || starts < event.paidAt || expires <= starts) fail('Invalid explicit entitlement period');
    const fingerprint = JSON.stringify([event.owner,event.kind,event.amountCents,total,starts,expires,p.version]);
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT fingerprint FROM grants WHERE id=?').get(event.id);
      if (existing) { if (existing.fingerprint !== fingerprint) fail('Conflicting payment replay'); return { duplicate: true }; }
      this.db.prepare('INSERT INTO grants VALUES(?,?,?,?,?,?,?,?,?,?)').run(event.id,event.owner,event.kind,event.amountCents,total,total,starts,expires,fingerprint,p.version);
      return { duplicate: false, environment: 'test' };
    });
  }
  balance(credential) {
    this.ready(); const owner = this.owner(credential), now = this.now();
    const rows = this.db.prepare('SELECT kind,available,expires FROM grants WHERE owner=? AND starts<=? AND expires>?').all(owner,now,now);
    const remainingMs = rows.filter(r=>r.kind==='prepaid').reduce((s,r)=>s+BigInt(r.available),0n);
    // BigInt converted to string to avoid unsafe large multi-purchase totals.
    return { product: PRODUCT, prepaidAvailableMs: String(remainingMs), unlimited: rows.some(r=>r.kind==='unlimited'), environment:'test' };
  }
  openSession(credential, requestKey) {
    const p = this.ready(), owner = this.owner(credential), now = this.now(); if (!text(requestKey)) fail('Idempotency key required');
    return this.transaction(() => {
      this.expire(now);
      const prior = this.db.prepare('SELECT * FROM leases WHERE owner=? AND request_key=?').get(owner,requestKey);
      if (prior) { if (prior.state !== 'active') fail('Request has ended; explicit new Start required'); return this.allowance(prior,now); }
      if (this.db.prepare("SELECT id FROM leases WHERE owner=? AND state='active'").get(owner)) fail('Another session is active');
      const grant = this.db.prepare("SELECT * FROM grants WHERE owner=? AND starts<=? AND expires>? AND (kind='unlimited' OR available>0) ORDER BY CASE kind WHEN 'unlimited' THEN 0 ELSE 1 END,expires,id LIMIT 1").get(owner,now,now);
      if (!grant) fail('No valid allowance');
      if (grant.policy_version !== p.version) fail('Entitlement policy migration required');
      const reserved = Math.min(p.leaseMs,grant.expires-now,grant.kind==='unlimited'?p.leaseMs:grant.available);
      const row = { id:randomUUID(), owner, expires:now+reserved, reserved, state:'active' };
      if (grant.kind==='prepaid') this.db.prepare('UPDATE grants SET available=available-? WHERE id=?').run(reserved,grant.id);
      this.db.prepare('INSERT INTO leases(id,owner,request_key,grant_id,reserved,expires,state,policy_version) VALUES(?,?,?,?,?,?,?,?)').run(row.id,owner,requestKey,grant.id,reserved,row.expires,row.state,p.version);
      return this.allowance(row,now);
    });
  }
  allowance(row, now) { return { id:row.id, remainingSeconds:Math.min(row.reserved,row.expires-now)/1000, expiresAt:row.expires }; }
  closeSession(credential,id) {
    const owner=this.owner(credential);
    return this.transaction(() => {
      const row=this.db.prepare('SELECT * FROM leases WHERE id=? AND owner=?').get(id,owner); if(!row) fail('Unknown owned lease');
      if(row.state==='active') this.db.prepare("UPDATE leases SET state='stopped' WHERE id=?").run(id);
      // Stop revokes immediately; NEVER refund based on client time, tab closing or silence.
      return { stopped:true, reconciliationPending:row.used===null };
    });
  }
  isActive(id, owner) { this.ready(); const now=this.now(); const row=this.db.prepare("SELECT id FROM leases WHERE id=? AND owner=? AND state='active' AND expires>?").get(id,owner,now); return Boolean(row); }
  settle(envelope) {
    const p=this.ready(), receipt=this.verifyMeter(envelope);
    if(!receipt || receipt.environment!=='test' || receipt.product!==PRODUCT || !text(receipt.policyVersion) || !text(receipt.id) || typeof receipt.leaseId!=='string' || !text(receipt.owner) || !integer(receipt.usedMs) || receipt.final!==true) fail('Invalid trusted final metering receipt');
    return this.transaction(() => {
      const row=this.db.prepare('SELECT * FROM leases WHERE id=? AND owner=?').get(receipt.leaseId,receipt.owner);
      if(!row || receipt.policyVersion!==row.policy_version || receipt.usedMs>row.reserved) fail('Receipt exceeds owned reservation');
      if(row.used!==null) { if(row.receipt!==receipt.id || row.used!==receipt.usedMs) fail('Conflicting settlement'); return {duplicate:true}; }
      const grant=this.db.prepare('SELECT * FROM grants WHERE id=?').get(row.grant_id);
      if(grant.kind==='prepaid') this.db.prepare('UPDATE grants SET available=available+? WHERE id=?').run(row.reserved-receipt.usedMs,grant.id);
      // Expired grant refunds remain expired. Settling cannot reactivate a stopped lease.
      this.db.prepare("UPDATE leases SET state='settled',used=?,receipt=? WHERE id=?").run(receipt.usedMs,receipt.id,row.id);
      return {duplicate:false};
    });
  }
  close() { this.db.close(); }
}
module.exports={TestEntitlements,price};
