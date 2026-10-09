import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV, deduplicate, qualify, csvExport, draftFor} from '../dist/engine.js';

const now = new Date('2026-10-08T12:00:00Z');
const rules = {roles:'CEO', industries:'SaaS', countries:'', min:'', max:'', signals:'', evidence:true, days:'90'};
const complete = {name:'Ada Example', company:'Example, Inc.', email:'ada@example.test', title:'CEO', industry:'SaaS', country:'Nigeria', employees:'20', signal:'Hiring a growth team\nNew position open', signal_date:'2026-10-01', source_url:'https://example.test/jobs', profile_url:'https://example.test/ada', suppressed:false};

test('Import, qualify, draft and export preserve the selected prospect and editable message', () => {
  const fields = Object.keys(complete);
  const imported = deduplicate(parseCSV(csvExport([complete], fields))).prospects;
  assert.equal(imported.length, 1);
  const prospect = qualify(imported[0], rules, now);
  assert.equal(prospect.status, 'fit');
  const message = draftFor(prospect, 'make buyer research faster', 'Pull GTM') + '\n\nA personal note, "in my voice".';
  const exported = parseCSV(csvExport([{...prospect, body:message, ready:true, delivery_status:'not_sent'}], ['name','company','email','body','ready','delivery_status']));
  assert.equal(exported[0].name, complete.name);
  assert.equal(exported[0].company, complete.company);
  assert.equal(exported[0].email, complete.email);
  assert.equal(exported[0].body, message);
  assert.equal(exported[0].ready, 'true');
  assert.equal(exported[0].delivery_status, 'not_sent');
});

test('A later complete duplicate enriches a partial row without depending on import order', () => {
  const partial = {...complete, title:'', industry:'', employees:'', signal:'', signal_date:'', source_url:'', profile_url:''};
  for (const input of [[partial, complete], [complete, partial]]) {
    const result = deduplicate(input);
    assert.equal(result.duplicates, 1);
    assert.equal(result.prospects.length, 1);
    assert.equal(result.prospects[0].title, complete.title);
    assert.equal(result.prospects[0].signal, complete.signal);
    assert.equal(result.prospects[0].source_url, complete.source_url);
    assert.equal(qualify(result.prospects[0], rules, now).status, 'fit');
  }
});

test('Duplicate enrichment never overrides conflicting supplied evidence or do-not-contact', () => {
  const conflicting = {...complete, source_url:'https://example.test/conflicting', suppressed:true};
  const result = deduplicate([complete, conflicting]);
  assert.equal(result.prospects[0].source_url, complete.source_url);
  assert.ok(result.prospects[0].conflicts.includes('source_url'));
  assert.equal(result.prospects[0].suppressed, true);
  assert.equal(qualify(result.prospects[0], rules, now).status, 'excluded');
});

test('Exported do-not-contact survives reimport and still blocks audience qualification', () => {
  const original = {...complete, suppressed:true};
  const imported = parseCSV(csvExport([original], Object.keys(original)))[0];
  assert.equal(imported.suppressed, true);
  assert.equal(qualify(imported, rules, now).status, 'excluded');
});
