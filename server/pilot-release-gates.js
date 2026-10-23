import {evaluateOpportunityLabels,evaluateBuyerFinding} from './v2-evaluation.js';

// This offline review aid is not an authorization to deploy or a verifier of
// submitted evidence. Independent adjudication and a registered cohort remain
// human review requirements. Scenario fixtures are never pilot observations.
export function assessPrecisionPilot(rows,{target=.98,minPredicted=200}={}){
  if(!Number.isFinite(target)||target<=0||target>=1||!Number.isInteger(minPredicted)||minPredicted<1)throw new Error('Invalid precision review threshold.');
  const metrics=evaluateOpportunityLabels(rows),reasons=[];
  if(metrics.overall.tp+metrics.overall.fp<minPredicted)reasons.push('insufficient_independently_labelled_positive_predictions');
  if(metrics.overall.unknown)reasons.push('unresolved_ground_truth');
  if(metrics.overall.precisionLower95===null||metrics.overall.precisionLower95<target)reasons.push('lower_95_precision_bound_below_target');
  return {version:1,scope:'supplied_cohort_only',target,minPredicted,metrics,statisticalCriteriaMet:reasons.length===0,reasons,
    independentEvidenceVerified:false,releaseAuthorized:false,buyerFindingRate:null,salesConversionRate:null,
    notice:'This is opportunity precision in the supplied independently adjudicated cohort. It is not a buyer-finding rate, sales probability or a universal product claim. Human review of independence, inclusion rules, segment coverage and source rights is required.'};
}

export function assessBuyerFindingPilot(offers,{asOf,windowDays=14,target=.98,minMatured=200}={}){
  if(!Number.isFinite(target)||target<=0||target>=1||!Number.isInteger(minMatured)||minMatured<1)throw new Error('Invalid buyer-finding review threshold.');
  const metrics=evaluateBuyerFinding(offers,{asOf,windowDays}),c=metrics.overall,reasons=[];
  if(c.matured<minMatured)reasons.push('insufficient_matured_eligible_offers');
  if(c.unknown||c.pending)reasons.push('unresolved_or_unfinished_offer_outcomes');
  if(c.buyerFindingLower95===null||c.buyerFindingLower95<target)reasons.push('lower_95_buyer_finding_bound_below_target');
  return {version:1,scope:'registered_cohort_only',target,minMatured,metrics,statisticalCriteriaMet:reasons.length===0,reasons,
    independentEvidenceVerified:false,releaseAuthorized:false,salesConversionRate:null,
    notice:'Buyer finding requires an independently adjudicated relevant, reachable and contact-permitted buyer for a specific offer within the window. Eligibility must precede research; exclusions and all-submitted rates remain visible. This review does not authenticate the supplied evidence or authorize a universal claim.'};
}
