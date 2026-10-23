import { createHash } from 'node:crypto';
import { researchSourcePage } from './discovery.js';

const destinations = new Set(['hubspot', 'pipedrive']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = value => typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, ' ').trim() : '';
const fail = () => { throw new Error('Review the original business route and offer before preparing an export.'); };

// This only builds a preview. It has no provider credential, network access,
// database write or send path. A later adapter must verify one exact approval.
export function prepareCrmRoutePreview({ ownerId, offer, source, review, destination, now = new Date() }) {
  if (!uuid.test(ownerId || '') || !destinations.has(destination) ||
      !offer || !source || !review || !(now instanceof Date) || !Number.isFinite(now.getTime())) fail();
  const product = clean(offer.product), location = clean(offer.location);
  const business = clean(review.business_name), note = clean(review.reason);
  const checkedAt = new Date(review.checked_at);
  const page = researchSourcePage({ url: source.source_url, title: source.title, description: source.source_excerpt });

  if (offer.owner_id !== ownerId || review.owner_id !== ownerId ||
      !Number.isSafeInteger(offer.version) || offer.version < 1 ||
      review.offer_version !== offer.version || review.source_id !== source.id ||
      source.kind !== 'buying_route' || review.verdict !== 'relevant_route' ||
      review.original_source_opened !== true || !page ||
      review.checked_url !== page.url ||
      !Number.isFinite(checkedAt.getTime()) || checkedAt.getTime() > now.getTime() ||
      checkedAt.getTime() < now.getTime() - 30 * 86400000 ||
      product.length < 3 || product.length > 500 || location.length < 2 || location.length > 120 ||
      business.length < 2 || business.length > 160 || note.length < 12 || note.length > 500) fail();

  const fields = {
    business_name: business,
    offer_product: product,
    offer_location: location,
    source_url: page.url,
    review_reason: note,
    checked_at: checkedAt.toISOString(),
    evidence_label: 'Seller checked original business route; purchasing need and contact permission unconfirmed'
  };
  const fingerprint = createHash('sha256').update(JSON.stringify([
    ownerId, destination, offer.version, source.id, fields
  ])).digest('hex');
  return {
    type: 'reviewed_business_route_preview', destination,
    proposed_object: 'crm_note_or_task', offer_version: offer.version,
    source_id: source.id, fingerprint, fields,
    status: 'preview_only',
    required_before_export: ['provider connection and write scope', 'approved field mapping', 'owner approval of this exact preview']
  };
}
