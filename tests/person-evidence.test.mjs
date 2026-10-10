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

test('real provider title forms retain an explicitly stated employer and role',()=>{
  const comma=personFromSource(page('Tom Krause - CEO, Cloud Software Group','Currently, I serve as Chief Executive Officer at Cloud Software Group. Enterprise software businesses.', 'https://www.linkedin.com/in/thomas-h-krause'),assessment);
  assert.equal(comma.title,'CEO');
  assert.equal(comma.company,'Cloud Software Group');
  const fallback=personFromSource(page('Tom Krause - CEO','Currently, I serve as Chief Executive Officer at Cloud Software Group. Enterprise software businesses.', 'https://www.linkedin.com/in/thomas-h-krause'),assessment);
  assert.equal(fallback.company,'Cloud Software Group');
  assert.equal(personFromSource(page('Daniel Shapero - CEO at LinkedIn'),assessment).company,'LinkedIn');
  assert.equal(personFromSource(page('Adam Guild - Owner','Experience: Owner · Education: Harvard Business School Online'),assessment).company,'Owner');
});

test('past roles and a reported-to executive never become a current role match',()=>{
  assert.equal(personFromSource(page('Ryan Roslansky - Former CEO of LinkedIn, EVP Microsoft','Ryan previously oversaw the group responsible for LinkedIn.'),assessment),null);
  assert.equal(personFromSource(page('Ada Okafor - Ex-CEO at Green Acre Ltd'),assessment),null);
  assert.equal(personFromSource(page('Ada Okafor - Former CEO at Green Acre Ltd','CEO at Green Acre Ltd from 2015 to 2020.'),assessment),null);
  const cfo=personFromSource(page('Ada Okafor - CFO at Green Acre Ltd reporting to CEO','Software in New York'),assessment);
  assert.equal(cfo.title,'CFO');
  assert.equal(cfo.company,'Green Acre Ltd');
  const missing=personFromSource(page('Ada Okafor - CFO reporting to CEO at Green Acre Ltd'),assessment);
  assert.equal(missing.title,'CFO');
  assert.equal(missing.company,'');
});

test('live Lagos title formats use complete employer evidence instead of roles or narrative',()=>{
  const david=personFromSource(page('DAVID JOHNSON - MD/CEO, Realtor in real estate','Currently serving as CEO at KINTRALI HOMES, I lead a dynamic team dedicated to providing unparalleled service in the Lagos, Nigeria real estate market. · Nigeria · Realtor · KINTRALI ALLIED VENTURES','https://ng.linkedin.com/in/dada-david-833a6216b'),assessment);
  assert.equal(david.title,'CEO');
  assert.equal(david.company,'KINTRALI HOMES');
  const emmanuel=personFromSource(page('Emmanuel John - CEO/ Co-Founder, Paragóne Signature ...','Emmanuel John - CEO/ Co-Founder, Paragóne Signature & Associates Ltd. Nigeria Lagos State, Nigeria 1K followers 500+ connections … a Real Estate Brokerage and ... · Lagos State, Nigeria · Chief Executive Officer · Paragone Signature & Associates Ltd','https://ng.linkedin.com/in/emmanuel-john-577a0316a'),assessment);
  assert.equal(emmanuel.title,'CEO/ Co-Founder');
  assert.equal(emmanuel.company,'Paragóne Signature & Associates Ltd');
  const subtitle=personFromSource(page('Olaposi Lawore - Managing Director/CEO CARE ...','Olaposi is the Managing Director and Chief Executive Officer of CARE Properties and developments - a real estate development and consultancy company under ... · Lagos State, Nigeria · Chief Executive Officer · CARE Properties','https://ng.linkedin.com/in/olaposi-lawore-862b99113'),assessment);
  assert.equal(subtitle.company,'CARE Properties');
  const generic=personFromSource(page('Oludayo Sodunke - Real Estate CEO | Helping Clients Buy, ...','Oludayo Sodunke. Real Estate CEO | Helping Clients Buy, Sell & Invest with Confidence | Property Development & Investment Advisor. REAL ESTATE GENERALS NG ...'),assessment);
  assert.equal(generic.company,'');
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
