import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadEnvFile} from 'node:process';
const root=process.cwd();if(existsSync('.env'))loadEnvFile('.env');
const mode=process.argv[2]??'dev';
const web=process.env.WEB_PORT??'3200',api=process.env.API_PORT??'4200',analytics=process.env.ANALYTICS_PORT??'8200';
const env={...process.env,PORT:api,API_URL:`http://127.0.0.1:${api}`,WEB_ORIGIN:`http://127.0.0.1:${web}`,ANALYTICS_PORT:analytics,WATCHPACK_POLLING:'true'};
const children=[];let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)try{child.kill('SIGTERM');}catch{}setTimeout(()=>process.exit(code),700);}
function launch(command,args,cwd=root){const child=spawn(command,args,{cwd,env,stdio:'inherit'});children.push(child);child.once('error',()=>{console.error('Could not launch local service. Run pnpm setup:local.');stop(1);});child.once('exit',code=>{if(!stopping)stop(code??1);});return child;}
if(mode==='build'){const child=spawn('pnpm',['exec','turbo','build'],{env,stdio:'inherit'});child.on('exit',code=>process.exit(code??1));}
else {
 if(!existsSync('.env'))throw new Error('Run pnpm setup:local to configure PostgreSQL');
 const python=resolve(root,'apps/analytics/.venv/bin/python');if(!existsSync(python))throw new Error('Run pnpm setup:local to install analytics');
 const ready=await new Promise(resolveCheck=>{
  const check=spawn('pnpm',['--filter','@mk/api','exec','tsx','src/check-startup.ts'],{cwd:root,env,stdio:'inherit'});
  check.once('error',()=>resolveCheck(false));check.once('exit',code=>resolveCheck(code===0));
 });
 if(!ready)process.exit(1);
 launch(python,['-m','uvicorn','analytics.main:app','--host','127.0.0.1','--port',analytics],resolve(root,'apps/analytics'));
 launch('pnpm',['--filter','@mk/api',mode==='start'?'start':'dev']);
 launch('pnpm',['--filter','@mk/web','exec','next',mode==='start'?'start':'dev','--hostname','127.0.0.1','--port',web]);
 console.log(`Local workspace: http://127.0.0.1:${web} | API: ${api} | Analytics: ${analytics} | PostgreSQL: native local service`);
 process.once('SIGINT',()=>stop());process.once('SIGTERM',()=>stop());
}
