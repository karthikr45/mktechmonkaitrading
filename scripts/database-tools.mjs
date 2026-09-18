import {spawnSync} from 'node:child_process';
import {mkdirSync,chmodSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {userInfo} from 'node:os';
import {loadEnvFile} from 'node:process';
try{loadEnvFile('.env');}catch{}
const admin=new URL(process.env.PG_ADMIN_URL??`postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:5432/postgres`);
const env={...process.env,PGHOST:admin.hostname,PGPORT:admin.port||'5432',PGUSER:decodeURIComponent(admin.username),PGPASSWORD:decodeURIComponent(admin.password)};
function run(cmd,args,extra={}){const r=spawnSync(cmd,args,{env,encoding:'utf8',...extra});if(r.status!==0)throw new Error(`${cmd} failed: ${r.stderr??'command unavailable'}`);return r.stdout.trim();}
function counts(db){return run('psql',['-X','-d',db,'-Atc',"SELECT json_build_object('orders',(SELECT count(*) FROM paper_orders),'audit',(SELECT count(*) FROM paper_audit),'executions',(SELECT count(*) FROM paper_executions),'cash',(SELECT COALESCE(sum(cash),0)::text FROM paper_accounts));"]);}
const mode=process.argv[2];
try{
 if(mode==='backup'){mkdirSync('backups',{recursive:true,mode:0o700});const file=resolve('backups',`mktechmonk-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`);const before=counts('mktechmonk_local');run('pg_dump',['-Fc','--no-owner','-d','mktechmonk_local','-f',file]);chmodSync(file,0o600);writeFileSync(file+'.json',JSON.stringify({database:'mktechmonk_local',counts:JSON.parse(before),createdAt:new Date().toISOString()},null,2),{mode:0o600});console.log('Backup created:',file);}
 else if(mode==='restore'){const file=process.argv[3];if(!file||!existsSync(file))throw new Error('Pass a backup file to restore into an isolated verification database');const db='mktechmonk_restore_'+Date.now();run('createdb',[db]);run('pg_restore',['--no-owner','--exit-on-error','-d',db,file]);const actual=JSON.parse(counts(db));if(existsSync(file+'.json')){const expected=JSON.parse(readFileSync(file+'.json','utf8')).counts;if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Restored counts/balance differ from backup manifest');}console.log('Restore verified:',db,JSON.stringify(actual));console.log('The original database was not modified.');}
 else throw new Error('Use backup or restore');
}catch(e){console.error(e.message);process.exitCode=1;}
