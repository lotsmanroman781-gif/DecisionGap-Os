import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../server/data.js';
import { insightsFromFeedback } from '../server/engine.js';
import { proposePlaybooks, newExperiment, sanitizedExperiment } from '../server/growth.js';

test('Growth Studio builds real feedback-based hypotheses with evidence counts',()=>{
  const proposals=proposePlaybooks(insightsFromFeedback(initialState().feedback));
  assert.ok(proposals.length>2);
  assert.ok(proposals.some(x=>x.id==='playbook-shipping'&&x.evidenceCount>0));
  assert.ok(proposals.every(x=>x.source.includes('not proven causes')));
});
test('Experiments start as drafts and cannot use arbitrary payloads',()=>{
  const proposals=proposePlaybooks(insightsFromFeedback(initialState().feedback));
  const created=newExperiment({playbookId:'playbook-shipping',status:'approved',name:'Fraudulent label'},proposals);
  assert.equal(created.status,'draft');
  assert.equal(created.name,'Show delivery clarity earlier');
  assert.match(sanitizedExperiment(created).evidenceNotice,/No causal lift claimed/);
  assert.throws(()=>newExperiment({playbookId:'missing'},proposals),/supported playbook/);
});
test('Empty or positive-only feedback does not create a sales-objection playbook',()=>{
  const proposals=proposePlaybooks(insightsFromFeedback([{text:'I loved the experience',category:'positive'}]));
  assert.equal(proposals.length,0);
});
