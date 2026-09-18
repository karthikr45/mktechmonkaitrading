import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:4200/v1';const proofPath='work/restart-check.json';
async function call(path,token,body){const r=await fetch(base+'/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const v=await r.json();assert.ok(r.ok,`${path}: ${r.status}`);return v;}
try{
 if(process.argv[2]==='seed'){
  const session=await call('demo-session',null,{});const token=session.token;
  const d=await call('dashboard',token);const order=await call('orders',token,{instrument:'DEMO-NIFTY',side:'BUY',quantity:1,limitPrice:d.ticks.at(-1).price,idempotencyKey:randomUUID()});assert.equal(order.state,'pending_approval');assert.equal((await call('orders/'+order.id+'/approve',token,{})).state,'filled');
  const strategy=await call('strategies',token,{version:1,name:'Restart verification strategy',instrument:'DEMO-NIFTY',timeframe:'1m',entry:{indicator:'SMA',period:20,operator:'price_above'},quantity:1,stopLossPct:1,targetPct:2,enabled:false});
  const journal=await call('journal',token,{note:'Automated local restart verification. Synthetic paper data.',orderId:order.id,tags:['verification']});
  const research=await call('research/backtests',token,{prices:d.ticks.map(t=>t.price),period:5});assert.ok(research.trades.length>0);
  const options=await call('research/options',token,{spot:100,strike:100,years:1,rate:.05,volatility:.2,kind:'call'});assert.ok(options.price>10&&options.price<11);
  const snap=await call('dashboard',token);mkdirSync('work',{recursive:true});writeFileSync(proofPath,JSON.stringify({token,order:order.id,strategy:strategy.id,journal:journal.id,research:research.runId,funds:snap.funds}),{mode:0o600});
  console.log('PASS: paper fill, strategy, order-linked journal, backtest and option calculation saved. Restart the services, then run this script with check.');
 }else{
  const p=JSON.parse(readFileSync(proofPath,'utf8'));const d=await call('dashboard',p.token);assert.equal(d.funds,p.funds);assert.equal(d.orders.find(o=>o.id===p.order).state,'filled');assert.ok((await call('strategies',p.token)).some(s=>s.id===p.strategy));assert.ok((await call('journal',p.token)).some(s=>s.id===p.journal));assert.ok((await call('research',p.token)).some(s=>s.id===p.research));assert.equal((await call('operations',p.token)).analytics,'configured');console.log('PASS: session, order, exact cash balance, strategy, journal and research history survived actual service restart.');
 }
}catch(e){console.error(e.message);process.exitCode=1;}
