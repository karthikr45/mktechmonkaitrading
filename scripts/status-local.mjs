import {loadEnvFile} from 'node:process';
try{loadEnvFile('.env');}catch{}
for(const [name,url] of [['Web',`http://127.0.0.1:${process.env.WEB_PORT??3200}`],['API',`http://127.0.0.1:${process.env.API_PORT??4200}/v1/health`],['Analytics',`http://127.0.0.1:${process.env.ANALYTICS_PORT??8200}/health`]]){try{const r=await fetch(url,{signal:AbortSignal.timeout(3000)});console.log(name,r.ok?'OK':'UNAVAILABLE',url);}catch{console.log(name,'UNAVAILABLE',url);process.exitCode=1;}}
