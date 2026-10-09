import {createHash} from 'node:crypto';

const rolePattern=/\b(co[- ]?founder|founder|chief executive officer|ceo|owner|director|head of [\p{L} ]{2,35}|president|managing partner|hiring manager|principal|teacher|agent|dealer)\b/iu;
const personTitle=/^([\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+){1,3})\s*(?:[-–—|·:]\s*)(.+)$/u;
const companyAfterRole=/\b(?:at|of|with)\s+([\p{L}\p{N}][\p{L}\p{N}&'’., -]{1,70})/iu;
const genericNames=/^(private|school|car|business|company|real estate|new|best|top|the)\b/i;
const restrictedPlatforms=/(^|\.)(linkedin\.com|facebook\.com|instagram\.com|jiji\.ng|jumia\.com\.ng|x\.com|twitter\.com|amazon\.[a-z.]+|ebay\.[a-z.]+)$/i;

export function personFromSource(page,assessment) {
  if(restrictedPlatforms.test(page.source))return null;
  const match=page.title.match(personTitle);
  if(!match||genericNames.test(match[1]))return null;
  const role=match[2].match(rolePattern)?.[0];
  if(!role)return null;
  const segments=match[2].split(/\s+[-–—|·]\s+/u).map(value=>value.trim()).filter(Boolean);
  const company=(match[2].match(companyAfterRole)?.[1]||segments[1]||'').replace(/\s*[-–—|·:].*$/u,'').trim();
  if(!company||/^(linkedin|facebook|instagram|x|profile|team|about)$/i.test(company)||rolePattern.test(company))return null;
  const name=match[1].trim();
  const sourceText=(page.title+' '+page.description).toLowerCase();
  if(!sourceText.includes(name.toLowerCase())||!sourceText.includes(company.toLowerCase()))return null;
  const id='source-'+createHash('sha256').update(page.url+'|'+name.toLowerCase()).digest('hex').slice(0,20);
  return {id,name,title:role,company,source_url:page.url,source_title:page.title,source_excerpt:page.description,source:page.source,relevance:assessment.score,reason:assessment.reason,missing:assessment.missing,identity_status:'source-asserted',contact_status:'unknown',private_sector_status:'source-asserted'};
}
