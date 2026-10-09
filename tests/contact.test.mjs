import test from 'node:test';
import assert from 'node:assert/strict';
import {contactOptions,displayIdentity,validContactUrl} from '../dist/contact.js';

test('review offers only supplied, safe contact paths and does not claim to send',()=>{
  const person={name:'Ada Okafor',email:'ada@example.com',profile_url:'https://www.linkedin.com/in/ada-okafor/',x_url:'https://x.com/ada',instagram_url:'javascript:alert(1)',source_url:'https://private.example/team/ada'};
  const actions=contactOptions(person);
  assert.deepEqual(actions.map(a=>a.label),['Write email','Open LinkedIn profile','Open X profile']);
  assert.ok(actions.every(a=>!a.url.includes('private.example')),'evidence is not assumed to be a contact path');
  assert.equal(contactOptions({...person,suppressed:true}).length,0);
  assert.equal(contactOptions({...person,origin:'example'}).length,0);
});

test('platform-specific links cannot point to a different site or a public institution',()=>{
  assert.equal(validContactUrl('x_url','https://evil.example/not-x'),'');
  assert.equal(validContactUrl('jiji_url','https://jiji.ng/cars/123'),'https://jiji.ng/cars/123');
  assert.equal(validContactUrl('profile_url','https://school.gov.ng/staff'),'');
  assert.equal(validContactUrl('profile_url','http://linkedin.com/in/ada'),'');
});

test('an unnamed imported profile is identified as a link, not a fabricated name',()=>{
  assert.equal(displayIdentity({profile_url:'https://x.com/ada'}),'X: ada');
  assert.equal(displayIdentity({}), 'Identity missing');
});
