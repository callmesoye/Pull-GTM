import test from 'node:test';
import assert from 'node:assert/strict';
import {personFromSource,parseSourceIdentity} from '../server/person-evidence.js';

const assessment={score:8,reason:'Audience and industry match',missing:['Location']};
const page=(title,description='',url='https://www.linkedin.com/in/ada-okafor/')=>({title,description,url,source:new URL(url).hostname});

test('normal public-search LinkedIn titles produce a named person and actual profile path',()=>{
  for(const [title,role] of [
    ['Ada Okafor - Founder & CEO - Green Acre Ltd | LinkedIn','Founder & CEO'],
    ['Ada Okafor - founder/ceo at Green Acre Ltd | LinkedIn','founder/ceo'],
    ['Ada Okafor — chief executive officer at Green Acre Ltd','chief executive officer'],
    ['Ada Okafor | Co-founder | Green Acre Ltd | LinkedIn','Co-founder'],
    ['Ada Okafor—CEO at Green Acre Ltd','CEO'],
    ['Ada Okafor - Head of Growth at Green Acre Ltd','Head of Growth'],
    ['Ada Okafor - CTO at Green Acre Ltd','CTO']
  ]){
    const found=personFromSource(page(title,'Agribusiness in Lagos'),assessment);
    assert.equal(found.name,'Ada Okafor');
    assert.equal(found.title,role);
    assert.equal(found.company,'Green Acre Ltd');
    assert.equal(found.profile_url,'https://www.linkedin.com/in/ada-okafor/');
    assert.equal(found.contact_status,'public-profile');
    assert.equal(found.identity_status,'source-asserted');
    assert.deepEqual(found.missing,['Location']);
    assert.equal(found.relevance,8);
  }
});

test('profile snippet supplies explicit professional role and company when title is just a name',()=>{
  const found=personFromSource(page('Ada Okafor | LinkedIn','Ada Okafor. CEO at Green Acre Ltd. Location: Lagos, Nigeria.'),assessment);
  assert.deepEqual({name:found.name,title:found.title,company:found.company},{name:'Ada Okafor',title:'CEO',company:'Green Acre Ltd'});
  const experience=personFromSource(page('Ada Okafor | LinkedIn','Founder/CEO · Agribusiness · Experience: Green Acre Ltd · Location: Lagos'),assessment);
  assert.equal(experience.company,'Green Acre Ltd');
  assert.equal(experience.title,'Founder/CEO');
});

test('source identity can be screened before prospect creation and never guesses a missing employer',()=>{
  const input=page('Ada Okafor - CEO | LinkedIn','Agribusiness in Lagos');
  assert.deepEqual(parseSourceIdentity(input),{name:'Ada Okafor',title:'CEO',company:''});
  const found=personFromSource(input,assessment);
  assert.equal(found.company,'');
  assert.deepEqual(found.missing,['Location','Company']);
  assert.equal(personFromSource(page('Ada Okafor - CEO','','https://company.example/team/ada'),assessment),null);
});

test('Unicode and lower-case profile names remain exactly as stated by the source',()=>{
  const unicode=personFromSource(page('María O’Connor - Managing Director at Ocean Farms Ltd','', 'https://oceanfarms.example/team/maria'),assessment);
  assert.equal(unicode.name,'María O’Connor');
  assert.equal(unicode.company,'Ocean Farms Ltd');
  assert.equal(unicode.contact_status,'unknown');
  const lowercase=personFromSource(page('ada okafor - ceo at Green Acre Ltd'),assessment);
  assert.equal(lowercase.name,'ada okafor');
  assert.equal(lowercase.title,'ceo');
});

test('only actual social profile routes become contact paths, never posts, search or company pages',()=>{
  const cases=[
    ['https://x.com/adaokafor','x_url'],
    ['https://www.instagram.com/ada.okafor/','instagram_url'],
    ['https://www.facebook.com/people/Ada-Okafor/123456789/','facebook_url']
  ];
  for(const [url,field] of cases){
    const found=personFromSource(page('Ada Okafor - Founder at Green Acre Ltd','Agribusiness in Lagos',url),assessment);
    assert.equal(found[field],url);
    assert.equal(found.contact_status,'public-profile');
  }
  for(const url of ['https://www.linkedin.com/posts/ada-activity-123','https://www.linkedin.com/company/green-acre/','https://x.com/adaokafor/status/123','https://www.instagram.com/p/abc/','https://www.facebook.com/groups/123/','https://x.com/search?q=CEO']){
    const found=personFromSource(page('Ada Okafor - Founder at Green Acre Ltd','Agribusiness in Lagos',url),assessment);
    assert.equal(found.contact_status,'unknown');
    assert.equal(found.profile_url,undefined);
    assert.equal(found.x_url,undefined);
    assert.equal(found.instagram_url,undefined);
    assert.equal(found.facebook_url,undefined);
  }
});

test('X and Instagram displayed-name wrappers preserve real identity and explicit contact evidence',()=>{
  for(const [title,url,field] of [
    ['Ada Okafor (@adaokafor) / X','https://x.com/adaokafor','x_url'],
    ['Ada Okafor (@ada.okafor) • Instagram photos and videos','https://www.instagram.com/ada.okafor/','instagram_url'],
    ['Ada Okafor | Facebook','https://www.facebook.com/ada.okafor/','facebook_url']
  ]){
    const found=personFromSource(page(title,'Software engineer at Green Acre Ltd. Business email: ada@greenacre.example',url),assessment);
    assert.equal(found.name,'Ada Okafor');
    assert.equal(found.title,'Software engineer');
    assert.equal(found.company,'Green Acre Ltd');
    assert.equal(found.email,'ada@greenacre.example');
    assert.equal(found[field],url);
  }
  const source=personFromSource(page('Ada Okafor - CEO at Green Acre Ltd','Business email: info@greenacre.example','https://greenacre.example/team/ada'),assessment);
  assert.equal(source.email,'info@greenacre.example');
  assert.equal(source.contact_status,'public-email');
  const absent=personFromSource(page('Ada Okafor - CEO at Green Acre Ltd','For business enquiries use our website'),assessment);
  assert.equal(absent.email,undefined);
});

test('generic pages, nonexistent identities and platform branding do not become people',()=>{
  for(const title of ['Founders in Lagos | LinkedIn','Green Acre Ltd - CEO','CEO profiles in Lagos','Private Business - Owner at Green Acre','Meet Ada Okafor - Founder at Green Acre','Ada Okafor | Founder | LinkedIn','Ada Okafor | LinkedIn']){
    const found=personFromSource(page(title,'Agribusiness in Lagos'),assessment);
    if(title==='Ada Okafor | Founder | LinkedIn')assert.equal(found.company,'');
    else assert.equal(found,null,title);
  }
  assert.equal(personFromSource({...page('Ada Okafor - Founder at Green Acre Ltd'),url:'javascript:alert(1)'},assessment),null);
  assert.equal(personFromSource({...page('Ada Okafor - Founder at Green Acre Ltd'),source:'unrelated.example'},assessment),null);
});
