import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assessPrivateSector } from '../dist/prospect-policy.js';

const privateRecord = { name: 'Ada Okafor', company: 'Green Acre Ltd', country: 'Nigeria', website_url: 'https://greenacre.example', private_verified: 'yes' };
const status = record => assessPrivateSector(record).status;

test('unknown ownership needs review for every real ingestion origin', () => {
  for (const origin of ['import', 'discovery', 'manual', 'connector', undefined]) {
    assert.equal(status({ ...privateRecord, origin, private_verified: 'no' }), 'review');
    assert.equal(status({ ...privateRecord, origin }), 'eligible');
  }
  for (const private_verified of [undefined, true, 'true', 'Yes', 'no']) assert.equal(status({ ...privateRecord, private_verified }), 'review');
  assert.equal(status(null), 'review');
});

test('company suffixes, industries, and provider source assertions cannot verify private ownership', () => {
  for (const company of ['Green Acre Ltd', 'Green Acre LLC', 'Green Acre Private Limited', 'Independent Consultant']) {
    assert.equal(status({ company, industry: 'Private healthcare', private_sector_status: 'source-asserted' }), 'review');
  }
});

test('government and statutory employers override an explicit private review', () => {
  for (const company of ['Ministry of Health', 'Federal Ministry of Education', 'Lagos State Ministry of Health', 'Lagos State Government', 'Government of Canada', 'Securities and Exchange Commission', 'National Universities Commission', 'NNPC Limited', 'Central Bank of Nigeria', 'University of Lagos', 'NHS England', 'Guy’s and St Thomas’ NHS Foundation Trust', 'Government-owned Trading Ltd', 'State-owned Energy Ltd', 'Public Hospital']) {
    assert.equal(status({ ...privateRecord, company }), 'excluded', company);
  }
  assert.equal(status({ ...privateRecord, company: 'PenCom' }), 'excluded');
  assert.equal(status({ ...privateRecord, employer_ownership: 'State-owned' }), 'excluded');
  assert.equal(status({ ...privateRecord, entity_type: 'government agency' }), 'excluded');
});

test('government URLs and government email domains override private claims for all URL roles', () => {
  for (const field of ['source_url', 'profile_url', 'website_url', 'business_url', 'contact_url', 'company_url', 'application_url', 'evidence_url', 'linkedin', 'source']) {
    assert.equal(status({ ...privateRecord, [field]: 'https://health.gov.ng/directory' }), 'excluded', field);
  }
  for (const url of ['https://SEC.GOV.NG./', 'https://nuc.edu.ng/', 'https://www.nhs.uk/', 'https://gmc-uk.org/register/', 'https://agency.gouv.fr/', 'https://agency.gob.mx/', 'https://agency.go.jp/', 'https://canada.gc.ca/', 'https://city.lg.jp/', 'https://agency.gov/', 'https://army.mil/', 'https://un.org/']) assert.equal(status({ ...privateRecord, source_url: url }), 'excluded', url);
  for (const field of ['email', 'business_email', 'contact_email', 'email_address']) assert.equal(status({ ...privateRecord, [field]: 'Ada@health.gov.ng' }), 'excluded', field);
  assert.equal(status({ ...privateRecord, source_url: 'sec.gov.ng/directory' }), 'excluded');
  assert.equal(status({ ...privateRecord, source_url: 'sec.gov.ng:443/directory' }), 'excluded');
});

test('hostname parsing neither permits disguised government URLs nor excludes lookalike private hosts', () => {
  for (const url of ['https://private.example@sec.gov.ng/team', 'ftp://sec.gov.ng/file', 'https://sec.gov.ng:443/path']) assert.equal(status({ ...privateRecord, source_url: url }), 'excluded', url);
  for (const url of ['https://sec.gov.ng.private.example/', 'https://notgov.ng/', 'https://gov.com/', 'https://go.com/', 'https://go.co/', 'https://private.example/sec.gov.ng', 'https://private.example/?source=https://sec.gov.ng', 'https://gmc-uk.org.private.example/', 'https://notgmc-uk.org/']) assert.equal(status({ ...privateRecord, source_url: url }), 'eligible', url);
  assert.equal(status({ ...privateRecord, source_url: 'https://sec.gov.ng@private.example/' }), 'review');
  assert.equal(status({ ...privateRecord, email: 'ada@sec.gov.ng.private.example' }), 'eligible');
});

test('private network and invalid URLs cannot serve as business evidence', () => {
  for (const website_url of ['http://localhost:3000/', 'http://service.internal/', 'http://router.home.arpa/', 'http://10.0.0.1/', 'http://127.1/', 'http://2130706433/', 'http://192.168.1.1/', 'http://172.31.0.1/', 'http://169.254.169.254/', 'http://100.64.0.1/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[fc00::1]/', 'http://[fe80::1]/', 'javascript:alert(1)', 'not a website']) assert.equal(status({ ...privateRecord, website_url }), 'review', website_url);
  assert.equal(status({ ...privateRecord, website_url: 'https://172.32.0.1/' }), 'eligible');
});

test('education and former public employment in excerpts do not become current employers', () => {
  for (const source_excerpt of ['CEO at Green Acre Ltd. Education: University of Lagos.', 'Education: University of Lagos · Previous experience: Ministry of Health.', 'Former CEO at NNPC Limited. Currently CEO at Green Acre Ltd.', 'Studied at University of Lagos, now builds software for public relations teams.', 'Clients include the Ministry of Health. A privately owned agency.']) assert.equal(status({ ...privateRecord, source_excerpt }), 'eligible', source_excerpt);
  assert.equal(status({ ...privateRecord, source_excerpt: 'Currently works at Ministry of Health.' }), 'excluded');
  assert.equal(status({ ...privateRecord, source_excerpt: 'Current employer: Central Bank of Nigeria.' }), 'excluded');
  assert.equal(status({ ...privateRecord, title: 'Director at Ministry of Health' }), 'excluded');
  assert.equal(status({ ...privateRecord, source_title: 'Ada Okafor - Director at Ministry of Health | LinkedIn' }), 'excluded');
  assert.equal(status({ ...privateRecord, source_title: 'Ada Okafor - Lecturer - University of Lagos | LinkedIn' }), 'excluded');
  assert.equal(status({ ...privateRecord, source_title: 'Ada Okafor - University of Lagos | LinkedIn' }), 'eligible');
  assert.equal(status({ ...privateRecord, source_title: 'Ada Okafor - Alumni - University of Lagos | LinkedIn' }), 'eligible');
});

test('legitimate private-company names and private universities avoid broad public-sector keyword matches', () => {
  for (const company of ['Public Storage', 'Publicis Groupe', 'State Farm', 'National Instruments', 'Federal Express', 'Government Technology Ltd', 'Ministry of Sound', 'Ministry of Design', 'Public Relations Partners', 'Harvard University', 'Stanford University']) assert.equal(status({ ...privateRecord, company }), 'eligible', company);
  assert.equal(status({ ...privateRecord, company: 'Harvard University', website_url: 'https://harvard.edu/' }), 'eligible');
  assert.equal(status({ ...privateRecord, company: 'Public Storage', ownership: 'publicly traded' }), 'eligible');
  assert.equal(status({ company: 'Public Relations Partners', source_excerpt: 'We do public relations for private businesses.' }), 'review');
});

test('examples are visibly fictional and never bypass government restrictions', () => {
  assert.equal(status({ origin: 'example', company: 'Green Acre (example)' }), 'eligible');
  assert.equal(status({ origin: 'example', company: 'Unverified real company' }), 'review');
  assert.equal(status({ origin: 'example', company: 'Fictional private studio', source_url: 'https://health.gov.ng' }), 'excluded');
  assert.equal(status({ origin: 'example', company: 'Ministry of Health (example)' }), 'excluded');
  assert.equal(status({ origin: 'example', company: 'NNPC Limited (example)' }), 'excluded');
  assert.equal(status({ origin: 'example', company: 'Fictional University of Lagos' }), 'excluded');
  assert.equal(status({ origin: 'example', company: 'State-owned Studio (example)' }), 'excluded');
});

test('browser and edge engines use identical policy files', async () => {
  assert.equal(await readFile(new URL('../dist/prospect-policy.js', import.meta.url), 'utf8'), await readFile(new URL('../supabase/functions/pull-mcp/prospect-policy.js', import.meta.url), 'utf8'));
});
