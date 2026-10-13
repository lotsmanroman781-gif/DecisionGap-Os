import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function portFree() {
  return await new Promise((resolve,reject)=>{
    const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});
  });
}

test('Vercel adapter forwards health, authenticated bootstrap and shopping chat requests', async t => {
  const port = await portFree();
  const code = `import http from 'node:http';import handler from './api/index.js';http.createServer((req,res)=>{const original = new URL(req.url,'http://localhost');req.query={path:original.pathname.replace(/^\\/api\\//,'')};return handler(req,res)}).listen(${port},'127.0.0.1');`;
  const child=spawn(process.execPath,['--input-type=module','-e',code], {cwd:root, env:{...process.env,VERCEL:'1',NODE_ENV:'production',ADMIN_PASSWORD:'correct horse battery elephant',SESSION_SECRET:'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',OPENAI_API_KEY:''}});
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  t.after(()=>{child.kill('SIGTERM');});
  const base=`http://127.0.0.1:${port}`;
  let response;
  for(let i=0;i<70;i++){
    try{response=await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,50));}
  }
  assert.ok(response?.ok,`serverless handler didn't start ${stdout} ${stderr}`);
  const health=await response.json();assert.equal(health.ok,true);
  assert.equal((await fetch(base+'/api/bootstrap')).status,401);
  const store =await(await fetch(base+'/api/storefront')).json();assert.equal(store.demo,true);assert.ok(store.products.length>=1);
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'correct horse battery elephant'})});
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const admin=await fetch(base+'/api/bootstrap',{headers:{cookie}});assert.equal(admin.status,200);
  const chat=await fetch(base+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Tell me about the headphones',sessionId:'test-visitor-234567'})});
  assert.equal(chat.status,200);assert.ok((await chat.json()).reply);
});
