import {safeUrl} from './engine.js';
export const buyerReviewQuestions=[
  ['requestActive','Is the request still open?'],['productFit','Does the product match?'],['locationFit','Can you serve this location?'],
  ['termsFit','Do the price and other terms fit?'],['contactAllowed','Is this contact method permitted?'],['reachable','Have you confirmed they can be reached?']
];
const states={seller_marked_unsuitable:'You marked this as unsuitable',source_needs_review:'The source conflicts with this assessment',needs_more_checks:'More checks needed',seller_reviewed_match:'You marked this as a potential match'};
const events={contacted:'Contact reported',replied:'Reply reported',not_interested:'Not interested',sale:'Sale reported',correction:'Correction'};
export function renderBuyerReview(state,e){
  const c=state.context;
  if(!c)return '<p role="status">Loading the saved source…</p>';
  const answers=state.draft?.answers||c.review?.answers||{},note=state.draft?.note??c.review?.note??'';
  const observations=c.candidate.sourceCheck?.assessment,url=safeUrl(c.candidate.source_url),corrected=new Set(c.outcomes.filter(o=>o.supersedesId).map(o=>o.supersedesId));
  const choice=(name,label,options)=>`<div class="field"><label for="buyer-review-${name}">${label}</label><select id="buyer-review-${name}" name="${name}">${options.map(([value,text])=>`<option value="${value}" ${(answers[name]||'unknown')===value?'selected':''}>${text}</option>`).join('')}</select></div>`;
  return `<div class="buyer-review-panel"><p><strong>${e(c.offer.fields.product)}</strong> · ${e(c.offer.fields.location)} · saved version ${e(c.offer.version)}</p><h3>${e(c.candidate.title)}</h3>${url?`<a href="${e(url)}" target="_blank" rel="noopener noreferrer">Open the original source ↗</a>`:''}
    ${observations?.requestQuote?`<details><summary>What Pull found on the page</summary><blockquote>${e(observations.requestQuote)}</blockquote><p class="small-print">Source text; the author and current need still need checking.</p></details>`:''}
    ${observations?.conflicts?.length?`<p role="status">Check the ${e(observations.conflicts.map(x=>x.field).join(' and '))}: the original request differs from your offer.</p>`:''}
    ${observations&&['closure_language_found','seller_language_found'].includes(observations.state)?'<p role="status">This page includes closed-request or selling language. Review it carefully.</p>':''}
    <p class="small-print">${e(c.notice)}</p>${c.review?`<p role="status">${e(states[c.review.assessment.state]||'Review saved')} · review version ${e(c.review.revision)}</p>`:''}
    <form id="buyer-review-form" class="account-form" aria-busy="${Boolean(state.busy)}"><fieldset ${state.busy?'disabled':''}>
      ${choice('actorRole','Who appears to have posted this?',[['unknown','Not sure yet'],['buyer','A buyer'],['seller','A seller'],['intermediary','A dealer or partner']])}
      <div class="section-grid">${buyerReviewQuestions.map(([name,label])=>choice(name,label,[['unknown','Not sure yet'],['yes','Yes'],['no','No']])).join('')}</div>
      <div class="field"><label for="buyer-review-note">What did you check?</label><textarea id="buyer-review-note" name="note" maxlength="1000" rows="3">${e(note)}</textarea></div>
      <button type="submit" class="button primary" ${state.busy?'disabled':''}>${state.busy?'Saving…':'Save my assessment'}</button>
    </fieldset></form>
    ${c.review?`<details ${state.correctionId?'open':''}><summary>Record what happened</summary><p class="small-print">This records your report. It does not send a message or verify a sale.</p>
      <form id="buyer-outcome-form" class="account-form"><fieldset ${state.busy?'disabled':''}><div class="field"><label for="buyer-outcome-kind">Outcome</label><select id="buyer-outcome-kind" name="kind" ${state.correctionId?'disabled':''}>${(state.correctionId?[['correction','Correct an earlier report']]:[['contacted','I contacted them'],['replied','They replied'],['not_interested','They are not interested'],['sale','A sale happened']]).map(([v,l])=>`<option value="${v}" ${state.outcomeDraft?.kind===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="field"><label for="buyer-outcome-note">Describe what happened</label><textarea id="buyer-outcome-note" name="note" minlength="10" maxlength="1000" rows="3" required>${e(state.outcomeDraft?.note||'')}</textarea></div><button type="submit" class="button secondary" ${state.busy?'disabled':''}>Save report</button>${state.correctionId?'<button type="button" class="link-button" data-buyer-cancel-correction>Cancel correction</button>':''}</fieldset></form></details>
      ${c.outcomes.length?`<details><summary>Your reported activity (${c.outcomes.length})</summary><ul>${c.outcomes.map(o=>`<li><strong>${e(events[o.kind]||o.kind)}${corrected.has(o.id)?' · corrected':''}</strong><p>${e(o.note)}</p><small>Reported ${e(new Date(o.reportedAt).toLocaleString())}</small>${!corrected.has(o.id)?`<button class="link-button" data-buyer-correct="${e(o.id)}">Correct this report</button>`:''}</li>`).join('')}</ul></details>`:''}`:''}
    ${state.error?`<p class="form-error" role="alert">${e(state.error)}</p>`:''}${state.message?`<p role="status">${e(state.message)}</p>`:''}
    </div>`;
}
