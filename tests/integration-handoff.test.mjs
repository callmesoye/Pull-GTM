import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCrmRoutePreview } from '../server/integration-handoff.js';

const owner = '12345678-1234-4234-8234-123456789abc';
const other = '87654321-1234-4234-8234-123456789abc';
const now = new Date('2026-10-23T09:00:00Z');
const source = {
  id: 'buyer-source-example', kind: 'buying_route',
  title: 'Independent car dealer Lagos',
  source_url: 'https://dealer.example/stock',
  source_excerpt: 'Independent dealership accepts vehicle sourcing enquiries in Lagos.',
  contact_permission: 'unknown', affordability_status: 'unknown',
  private_phone: 'SHOULD_NOT_EXPORT'
};
const offer = { owner_id: owner, version: 2, product: 'Mercedes Benz C300 2026', location: 'Lagos' };
const review = {
  owner_id: owner, offer_version: 2, source_id: source.id,
  verdict: 'relevant_route', original_source_opened: true,
  checked_url: source.source_url, checked_at: '2026-10-23T08:00:00Z',
  business_name: 'Independent Car Dealer',
  reason: 'The site says the dealership accepts vehicle sourcing enquiries.'
};
const make = overrides => prepareCrmRoutePreview({ ownerId: owner, offer, source, review, destination: 'hubspot', now, ...overrides });

test('seller-checked route yields a stable, bounded CRM preview without contact data or an external action', () => {
  const result = make();
  assert.equal(result.status, 'preview_only');
  assert.equal(result.proposed_object, 'crm_note_or_task');
  assert.equal(result.fields.source_url, source.source_url);
  assert.equal(result.fingerprint, make().fingerprint);
  assert.ok(!JSON.stringify(result).includes('SHOULD_NOT_EXPORT'));
  assert.ok(!JSON.stringify(result).includes('email'));
  assert.notEqual(result.fingerprint, make({ review: { ...review, reason: review.reason + ' Updated.' } }).fingerprint);
});

test('unreviewed sources, market context, other owners and unchecked URLs cannot prepare exports', () => {
  for (const patch of [
    { offer: { ...offer, owner_id: other } },
    { review: { ...review, owner_id: other } },
    { review: { ...review, offer_version: 1 } },
    { review: { ...review, source_id: 'other' } },
    { review: { ...review, verdict: 'unreviewed' } },
    { review: { ...review, original_source_opened: false } },
    { review: { ...review, checked_url: 'https://other.example/' } },
    { review: { ...review, checked_at: '2025-01-01T00:00:00Z' } },
    { source: { ...source, kind: 'market_context' } },
    { source: { ...source, source_url: 'https://127.0.0.1/secret' } },
    { destination: 'send_email' }
  ]) assert.throws(() => make(patch), /Review the original business route/);
});
