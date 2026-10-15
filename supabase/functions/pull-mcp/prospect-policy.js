// This policy is shared by the browser, server, and edge qualification engines.
// A source claim or a business-sounding name never establishes private ownership.
const clean = value => String(value ?? '').normalize('NFKC').trim().toLowerCase();
const atDomain = (host, domain) => host === domain || host.endsWith('.' + domain);

// Public bodies sometimes use ordinary commercial or nonprofit domains. Keep
// these exact domain boundaries: a name appearing in a path is not the host.
const publicDomains = [
  'nuc.edu.ng', 'nnpcgroup.com', 'nnpc.com', 'nsia.com.ng', 'boi.ng',
  'nigerianports.gov.ng', 'nigerianstat.gov.ng', 'secnigeria.com',
  'nhs.uk', 'police.uk', 'parliament.uk', 'mod.uk', 'gov.scot', 'gov.wales',
  'go.jp', 'go.kr', 'go.id', 'go.th', 'go.ke', 'go.tz', 'go.ug', 'go.zm',
  'go.zw', 'go.bw', 'go.na', 'go.sz', 'go.mw', 'go.cr', 'gc.ca', 'lg.jp',
  'gmc-uk.org', 'nmc.org.uk', 'sra.org.uk', 'hcpc-uk.org',
  'europa.eu', 'worldbank.org', 'imf.org', 'un.org', 'who.int', 'unesco.org',
  'unicef.org', 'oecd.org', 'ifc.org',
  'unilag.edu.ng', 'ui.edu.ng', 'oauife.edu.ng', 'unn.edu.ng', 'abu.edu.ng',
  'berkeley.edu', 'ucla.edu'
];

function publicHostname(host) {
  host = clean(host).replace(/\.$/, '');
  // Country government suffixes have a country-code TLD. This deliberately
  // does not interpret go.com, gov.com, or agency.gov.ng.example as government.
  return /(?:^|\.)(?:gov|mil|int)$/.test(host)
    || /(?:^|\.)(?:gov|mil|gouv|gob|govt)\.[a-z]{2}$/.test(host)
    || /(?:^|\.)(?:state|ci|co|k12)\.[a-z]{2}\.us$/.test(host)
    || publicDomains.some(domain => atDomain(host, domain));
}

function privateNetworkHostname(host) {
  host = clean(host).replace(/\.$/, '');
  if (!host || !host.includes('.') && !host.includes(':')) return true;
  if (['localhost', 'local', 'internal', 'lan', 'home', 'home.arpa'].some(domain => atDomain(host, domain))) return true;
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [, a, b, c] = ipv4.map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31
      || a === 192 && (b === 168 || b === 0 && c === 0)
      || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19);
  }
  if (host.startsWith('[')) {
    const ipv6 = host.slice(1, -1);
    // IPv4-mapped IPv6 can encode loopback/private addresses without dots.
    const mapped = ipv6.match(/^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/);
    if (mapped) {
      const first = parseInt(mapped[1], 16), last = parseInt(mapped[2], 16);
      return privateNetworkHostname(`${first >> 8}.${first & 255}.${last >> 8}.${last & 255}`);
    }
    return /^::(?:0|1)?$/.test(ipv6) || /^(?:f[cd]|fe[89ab]|ff)/.test(ipv6);
  }
  return false;
}

function inspectUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return {};
  try {
    // Bare business hostnames are common in imports; parse their actual host.
    let url;
    try { url = new URL(raw); } catch { url = new URL('https://' + raw); }
    if (!url.hostname) url = new URL('https://' + raw);
    if (publicHostname(url.hostname)) return { public: true };
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || privateNetworkHostname(url.hostname)) return { unsafe: true };
    return {};
  } catch {
    return { unsafe: true };
  }
}

const publicEntityNames = new Set([
  'central bank of nigeria', 'nigerian national petroleum company',
  'nigerian national petroleum company limited', 'nigerian national petroleum corporation',
  'nnpc', 'nnpc limited', 'nnpc ltd', 'nnpc ltd.', 'nnpc group',
  'nigerian sovereign investment authority', 'bank of industry',
  'securities and exchange commission', 'securities and exchange commission nigeria',
  'national pension commission', 'national universities commission',
  'national board for technical education', 'national commission for colleges of education',
  'national film and video censors board', 'national identity management commission',
  'nigeria health facility registry', 'health facility registry',
  'nigerian ports authority', 'nigerian railway corporation', 'nigeria customs service',
  'nigeria immigration service', 'nigeria police force',
  'university of lagos', 'university of ibadan', 'university of nigeria',
  'ahmadu bello university', 'obafemi awolowo university',
  'university of california', 'university of california berkeley',
  'university of california los angeles',
  'national health service', 'nhs england', 'nhs scotland', 'nhs wales',
  'world bank', 'international monetary fund', 'international finance corporation',
  'united nations', 'world health organization', 'unesco', 'unicef',
  'european commission', 'european parliament', 'european central bank',
  'bank of england', 'reserve bank of india', 'federal reserve',
  'general medical council', 'nursing and midwifery council',
  'solicitors regulation authority', 'health and care professions council'
]);
const nigeriaPublicAbbreviations = new Set(['cbn', 'pencom', 'nuc', 'nbte', 'ncce', 'nfvcb', 'nimc', 'nsia']);
const explicitPublicOwnership = /\b(?:government[ -]owned|state[ -]owned|publicly[ -]owned|government[ -]controlled|state[ -]controlled|public[ -]sector|public institution|statutory (?:body|register|regulator|council)|government (?:agency|department|body)|public (?:hospital|school|university|agency))\b/;

function publicEntity(value, country) {
  const raw = clean(value);
  if (explicitPublicOwnership.test(raw)) return true;
  const name = raw.replace(/^(?:fictional|example)\s*[:–—-]?\s+/, '').replace(/(?:\s*\([^)]*\))+$/, '').replace(/[.,]+$/, '').replace(/^the\s+/, '');
  if (!name) return false;
  if (publicEntityNames.has(name)) return true;
  if (/^(?:federal|state|provincial|municipal) ministry(?:$| of )/.test(name)) return true;
  if (['nigeria', 'ng', 'nga'].includes(clean(country)) && nigeriaPublicAbbreviations.has(name)) return true;
  if (/\b(?:government of|federal government|state government|municipal government|provincial government|local government (?:area|council))\b/.test(name)) return true;
  if (/^(?:federal |national |[\p{L} -]+ state |(?:united states|us|u\.s\.|uk) )?(?:ministry|department) of (?:health|education|finance|defen[cs]e|justice|interior|agriculture|foreign affairs|labou?r|transport|commerce|environment|works|information|energy|petroleum|housing|aviation|trade|communications|science|youth|women)(?:\b|$)/u.test(name)) return true;
  return /^(?:federal|state|municipal|provincial|county|city) (?:public )?(?:hospital|university|school|council|authority|police|civil service)(?:\b|$)/.test(name)
    || /^(?:nhs .+ (?:trust|board)|.+ nhs (?:foundation )?trust)$/.test(name);
}

function explicitCurrentEmployers(record) {
  const employers = [];
  // Education and former experience in a search excerpt are not a current
  // employer claim. Only inspect text explicitly identifying current work.
  for (const text of [record.source_excerpt, record.description]) {
    for (const sentence of String(text ?? '').split(/[;\n·]|\.(?=\s)/)) {
      const current = sentence.match(/\b(?:current (?:employer|company|organization|organisation)\s*:\s*|currently\s+(?:(?:works?|working|employed|serves?|serving)\b[^.!?]{0,80}?\b(?:at|by|for)|(?:the\s+)?(?:ceo|founder|director|minister|head|manager)\b[^.!?]{0,60}?\bat)\s+)([^.!?]+)/i);
      if (current) employers.push(current[1]);
    }
  }
  // A title can include its employer, but school history must stay separate.
  for (const title of [record.title, record.source_title].map(value => String(value ?? ''))) {
    if (/\b(?:former|previous|previously|ex[- ]|education|studied|alumn)/i.test(title)) continue;
    const employer = title.match(/\bat\s+(.+?)(?=\s*[|·]\s*|$)/i);
    if (employer) employers.push(employer[1]);
    const segments = title.split(/\s+-\s+|\s*[–—|·]\s*/);
    for (let index = 2; index < segments.length; index++) {
      if (/\b(?:founder|ceo|director|head|manager|analyst|officer|minister|professor|lecturer|consultant|specialist|principal|secretary|engineer|nurse|doctor|employee|chair(?:man|person)?)\b/i.test(segments[index - 1])) employers.push(segments[index]);
    }
  }
  return employers;
}

export function assessPrivateSector(record = {}) {
  record = record && typeof record === 'object' ? record : {};
  let unsafeUrl = false;
  for (const [field, value] of Object.entries(record)) {
    // Inspect every supplied source/contact/business URL, including aliases
    // used by connectors. Unrelated prose is not treated as a URL.
    if (!/(?:^|_)(?:url|uri|link)$/.test(field) && !['website', 'business_website', 'linkedin', 'profile', 'source'].includes(field)) continue;
    if (field === 'source' && !/^(?:https?:\/\/)?[^\s/]+\.[^\s/]+(?:\/.*)?$/i.test(String(value ?? ''))) continue;
    const result = inspectUrl(value);
    if (result.public) return { status: 'excluded', reason: 'Government or public-institution source/contact URLs are outside private-sector scope.' };
    unsafeUrl ||= Boolean(result.unsafe);
  }
  for (const [field, value] of Object.entries(record)) {
    if (!/(?:^|_)email(?:_address)?$/.test(field)) continue;
    const email = clean(value).replace(/^mailto:/, '').match(/@([^\s>,;?]+)/);
    if (email && publicHostname(email[1])) return { status: 'excluded', reason: 'Government or public-institution email domains are outside private-sector scope.' };
  }
  const employers = ['company', 'employer', 'organization', 'organisation', 'business_name', 'company_name', 'employer_name', 'name'].map(field => record[field]);
  employers.push(...explicitCurrentEmployers(record));
  if (employers.some(value => publicEntity(value, record.country))) return { status: 'excluded', reason: 'Government, publicly owned, or statutory institutions are outside private-sector scope.' };
  for (const field of ['ownership', 'employer_ownership', 'company_ownership', 'entity_type', 'employer_type', 'company_type', 'organization_type', 'organisation_type', 'private_sector_status', 'sector']) {
    const value = clean(record[field]);
    if (explicitPublicOwnership.test(value) || /^(?:government|governmental|public institution|statutory|government-owned|state-owned)$/.test(value)) return { status: 'excluded', reason: 'The recorded ownership is government, publicly owned, or statutory.' };
  }
  if (unsafeUrl) return { status: 'review', reason: 'Replace invalid or private-network source/contact URLs before confirming private-sector eligibility.' };
  if (record.origin === 'example' && /\b(?:example|fictional)\b/.test(clean(record.company) + ' ' + clean(record.name))) return { status: 'eligible', reason: 'Fictional private-sector example; this is not a verified real prospect.' };
  if (record.private_verified === 'yes') return { status: 'eligible', reason: 'Private-sector ownership confirmed in the owner’s review.' };
  return { status: 'review', reason: 'Confirm this is a current private-sector person and business.' };
}
