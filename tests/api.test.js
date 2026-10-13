import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

async function portFree() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);s.listen(0, '127.0.0.1', () => {const p = s.address().port;s.close(() => resolve(p));});
  });
}
async function request(root, route, body, cookie='', origin) {
  const opts = {method:body === undefined?'GET':'POST',headers:{'content-type':'application/json'}};
  if (body !== undefined) opts.body = JSON.stringify(body);
  if (cookie) opts.headers.cookie = cookie;
  if (origin) opts.headers.origin = origin;
  const res=await fetch(root+route,opts);
  return { status:res.status, body:await res.json(), cookie:res.headers.get('set-cookie') };
}

test('Hosted demo protects management APIs and supports public simulated sales', async t => {
  const port = await portFree();
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'decisiongap-cloud-test-'));
  const root=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server/index.js'],{
    cwd:path.resolve(''),
    env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_FILE:path.join(dir,'state.json'),OPENAI_API_KEY:'',NODE_ENV:'test',ADMIN_PASSWORD:'long-admin-test-password',SESSION_SECRET:'this-is-a-long-test-secret-at-least-32-chars'},
  });
  t.after(()=>{child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});});
  let running=false;
  for(let i=0;i<60;i++){
    try{if((await request(root,'/api/health')).status===200){running=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,60));
  }
  assert.ok(running,'server should start');
  const publicStore=await request(root,'/api/storefront');
  assert.equal(publicStore.status,200);
  assert.equal(publicStore.body.products.length,3);
  assert.equal('cost' in publicStore.body.products[0],false);
  assert.equal('orders' in publicStore.body,false);
  assert.equal('feedback' in publicStore.body,false);
  assert.equal((await request(root,'/api/bootstrap')).status,401);
  assert.equal((await request(root,'/api/settings',{aiEnabled:false})).status,401);
  assert.equal((await request(root,'/api/reset',{})).status,401);
  assert.equal((await request(root,'/api/auth/login',{password:'wrong'})).status,401);
  const login=await request(root,'/api/auth/login',{password:'long-admin-test-password'});
  assert.equal(login.status,200);
  assert.match(login.cookie,/HttpOnly/);
  assert.match(login.cookie,/SameSite=Strict/);
  const cookie=login.cookie.split(';')[0];
  const first=await request(root,'/api/bootstrap',undefined,cookie);
  assert.equal(first.status,200);
  const original=first.body.insights.find(x=>x.key==='shipping').count;
  assert.equal((await request(root,'/api/feedback',{text:'The delivery shipping charges are unclear during checkout.'},cookie)).status,201);
  const second=await request(root,'/api/bootstrap',undefined,cookie);
  assert.equal(second.body.insights.find(x=>x.key==='shipping').count,original+1);
  const sid='public-test-user-session';
  const chat=await request(root,'/api/chat',{message:'Please add these headphones to my cart',sessionId:sid,productId:'nova-pro'});
  assert.equal(chat.status,200);
  assert.equal(chat.body.action,'add_to_cart');
  const order=await request(root,'/api/checkout',{sessionId:sid,items:[{productId:'nova-pro',quantity:1}]});
  assert.equal(order.status,201);
  assert.equal(order.body.paymentCollected,false);
  assert.equal(order.body.order.amount,149);
  assert.equal((await request(root,'/api/settings',{aiEnabled:false},cookie,'https://evil.example')).status,403);
  assert.equal((await request(root,'/api/settings',{aiEnabled:false},cookie)).body.policy.aiEnabled,false);
  assert.equal((await request(root,'/api/chat',{message:'What about shipping?',sessionId:sid})).status,403);
  const reset=await request(root,'/api/reset',{},cookie);
  assert.equal(reset.status,200);
  assert.equal(reset.body.orders.length,0);
  assert.equal((await request(root,'/api/checkout',{sessionId:sid,items:[{productId:'fake',quantity:1}]})).status,400);
  assert.equal((await request(root,'/api/auth/logout',{},cookie)).status,200);
  assert.equal((await request(root,'/api/bootstrap',undefined,cookie)).status,401); // invalidated even if old cookie is reused
});
