import {parseSourceIdentity} from './person-evidence.js';

// Only server-screened source candidates belong here. This cannot approve,
// qualify, enrich, or authorize contact with a person.
const REQUIRED_GAPS = new Set(['Industry or need', 'Location']);
const round = n => Math.round(n * 100) / 100;
const short = (value,max) => String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
function publicSource(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (!url.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|test)$/.test(url.hostname)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}
const personKey = p => (short(p.name,120)+'|'+short(p.company,120)).normalize('NFKC').toLowerCase();
const nonnegative = v => Number.isSafeInteger(v) && v >= 0 ? v : 0;

// Triage is strictly subordinate to discoverPrivatePages' existing source,
// private-sector, audience and geography checks. These records never enter
// people, shortlists, drafts, or delivery permissions.
export function buildResearchTriage({input={},people=[],candidates=[],diagnostics={},requestsUsed=0}={}) {
  const target = Math.max(0,Math.min(50,nonnegative(Number(input.limit))));
  const verifiedKeys = new Set(people.map(personKey));
  const knownURLs = new Set(people.map(p=>publicSource(p.source_url)).filter(Boolean));
  const seen = new Set(),reviewQueue=[];
  const queueCap = Math.min(12,target || 12);
  for (const candidate of candidates) {
    if (reviewQueue.length>=queueCap) break;
    if (!candidate || !candidate.private_sector_basis || !Array.isArray(candidate.matched) || !Array.isArray(candidate.missing)) continue;
    // A matching role is mandatory; a source mismatch is not a review lead.
    if (!candidate.matched.some(m=>m?.label==='Audience') || candidate.missing.includes('Audience') || candidate.missing.includes('Preferred source')) continue;
    const missing = [...new Set(candidate.missing.filter(gap=>REQUIRED_GAPS.has(gap)))];
    if (!missing.length) continue;
    const person = parseSourceIdentity(candidate);
    if (!person?.name || !person?.title || !person?.company) continue;
    const sourceUrl = publicSource(candidate.url);
    if (!sourceUrl) continue;
    const key = personKey(person);
    if (knownURLs.has(sourceUrl) || verifiedKeys.has(key) || seen.has(key) || seen.has(sourceUrl)) continue;
    seen.add(key);seen.add(sourceUrl);
    reviewQueue.push({
      kind:'person',status:'needs_research',evidence_status:'source-asserted',
      name:short(person.name,120),title:short(person.title,120),company:short(person.company,160),
      source_url:sourceUrl,source_title:short(candidate.title,200),source_excerpt:short(candidate.description,350),
      missing,required_action:'Verify missing facts on an authorized original source before prospect review.',
      eligible_for_outreach:false
    });
  }
  const qualified = nonnegative(people.length),providerResults=nonnegative(diagnostics.providerResults),used=nonnegative(requestsUsed);
  const blockers=['missingTargetEvidence','missingIdentity','excludedSectorOrSource','unrelatedSources','duplicateSources','ambiguousIdentity']
    .map(code=>({code,observations:nonnegative(diagnostics[code])}))
    .filter(x=>x.observations>0)
    .sort((a,b)=>b.observations-a.observations||a.code.localeCompare(b.code));
  const researchQuality={
    schema_version:1,requested:target,qualified,needs_research:reviewQueue.length,
    shortfall:Math.max(0,target-qualified),provider_results:providerResults,requests_used:used,
    qualified_per_request:used?round(qualified/used):null,
    qualified_per_100_results:providerResults?round(qualified*100/providerResults):null,
    dominant_observed_blocker:blockers[0]||null,
    // Stage observations overlap: do not sum into a fabricated rejection total.
    stage_observations_not_exclusive:true,
    note:'Research candidates are unverified and do not count toward qualified results or authorize contact.'
  };
  return {reviewQueue,researchQuality};
}
