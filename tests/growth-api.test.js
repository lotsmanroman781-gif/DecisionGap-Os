import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import net from 'node:net';
function freePort(){return new Promise(res=>{const l=net.createServer();l.listen(0,'127.0.0.1',()=>{const port=l.address().port;l.close(()=>res(port));});});}
async function rpc(root, route, body, cookie='') {
 const opt={method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',cookie}};
 if(body!==undefined)opt.body=JSON.stringify(body);
 const r=await fetch(root+route,opt);return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};
}
test('growth approvals and SQLite persistence survive a server restart',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'decisiongap-sqlite-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let child;
 t.after(()=>child?.kill());
 const port=await freePort(),root=`http://127.0.0.1:${port}`;
 const launch=async()=>{
  child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',NODE_ENV:'test',SQLITE_FILE:path.join(dir,'state.sqlite'),ADMIN_PASSWORD:'test-production-password',SESSION_SECRET:'0123456789-a-good-32-plus-character-testing-secret',SHOPIFY_SHOP_DOMAIN:'',SHOPIFY_STOREFRONT_TOKEN:'',OPENAI_API_KEY:''},stdio:'ignore'});
  for(let i=0;i<70;i++){
   try{if((await rpc(root,'/api/health')).status===200)return;}catch{}
   await new Promise(r=>setTimeout(r,60));
  }
  assert.fail('server failed to start');
 };
 await launch();
 assert.equal((await rpc(root,'/api/growth/experiments',{playbookId:'playbook-shipping'})).status,401);
 assert.equal((await rpc(root,'/api/commerce/sync',{})).status,401);
 const login=await rpc(root,'/api/auth/login',{password:'test-production-password'}),cookie=login.cookie.split(';')[0];
 assert.equal((await rpc(root,'/api/commerce/sync',{},cookie)).status,409);
 const before=await rpc(root,'/api/bootstrap',undefined,cookie);
 assert.ok(before.data.growth.find(p=>p.id==='playbook-shipping'));
 const draft=await rpc(root,'/api/growth/experiments',{playbookId:'playbook-shipping'},cookie);
 assert.equal(draft.status,201);assert.equal(draft.data.experiment.status,'draft');
 const id=draft.data.experiment.id;
 const approved=await rpc(root,'/api/growth/experiments/approve',{id},cookie);
 assert.equal(approved.data.experiment.status,'approved');
 assert.equal((await rpc(root,'/api/growth/experiments/approve',{id},cookie)).status,404);
 child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));
 await launch();
 const loginAgain=await rpc(root,'/api/auth/login',{password:'test-production-password'});
 const boot=await rpc(root,'/api/bootstrap',undefined,loginAgain.cookie.split(';')[0]);
 assert.equal(boot.data.experiments.find(x=>x.id===id).status,'approved');
});
