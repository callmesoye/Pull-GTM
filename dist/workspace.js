// Shared validation keeps browser restores and cloud saves on the same format.
const fields = ['version','prospects','shortlist','drafts','audit','mode','identity','context','website','offer','setup','rules','duplicates'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const modes = ['empty','import','example'];

export function validateWorkspace(value) {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.prospects) || !Array.isArray(value.shortlist) || !Array.isArray(value.audit) || !object(value.drafts) || !object(value.rules)) throw new Error('Invalid workspace format.');
  if (!modes.includes(value.mode) || !['company','personal'].includes(value.context) || !['identity','website','offer'].every(k => typeof value[k] === 'string') || typeof value.setup !== 'boolean' || !Number.isSafeInteger(value.duplicates) || value.duplicates < 0) throw new Error('Invalid workspace details.');
  const ids = new Set();
  for (const p of value.prospects) {
    if (!object(p) || typeof p.id !== 'string' || !p.id || p.id in Object.prototype || ids.has(p.id)) throw new Error('Prospects need unique valid IDs.');
    for (const [key,entry] of Object.entries(p)) {
      if (key === 'suppressed') { if (typeof entry !== 'boolean') throw new Error('Invalid contact preference.'); }
      else if (key === 'conflicts') { if (!Array.isArray(entry) || !entry.every(v => typeof v === 'string')) throw new Error('Invalid duplicate details.'); }
      else if (typeof entry !== 'string') throw new Error('Prospect fields must contain text.');
    }
    ids.add(p.id);
  }
  if (!value.shortlist.every(id => typeof id === 'string' && ids.has(id)) || !Object.keys(value.drafts).every(id => ids.has(id))) throw new Error('Workspace contains unknown prospect references.');
  if (new Set(value.shortlist).size !== value.shortlist.length) throw new Error('Shortlist contains duplicate references.');
  if (!Object.values(value.drafts).every(d => object(d) && typeof d.body === 'string' && typeof d.subject === 'string' && ['email','personal','company'].includes(d.channel) && typeof d.ready === 'boolean')) throw new Error('Invalid outreach draft.');
  if (!value.audit.every(a => object(a) && typeof a.action === 'string' && typeof a.detail === 'string' && typeof a.at === 'string' && Number.isFinite(Date.parse(a.at)) && (a.mode === undefined || modes.includes(a.mode)))) throw new Error('Invalid activity record.');
  if (!['roles','industries','countries','min','max','signals','days'].every(k => typeof value.rules[k] === 'string') || typeof value.rules.evidence !== 'boolean') throw new Error('Invalid audience criteria.');
  const r = value.rules;
  if (!['30','60','90','180','365'].includes(r.days) || ![r.min,r.max].every(n => n === '' || (n.trim() !== '' && Number.isFinite(Number(n)) && Number(n) >= 0)) || (r.min !== '' && r.max !== '' && Number(r.min) > Number(r.max))) throw new Error('Invalid audience range.');
  const payload = Object.fromEntries(fields.map(k => [k, structuredClone(value[k])]));
  payload.remember = false;
  return payload;
}
