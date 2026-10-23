const positive='qualified_opportunity';
const tiers=new Set([positive,'verified_request','buying_route','market_context','research_lead','excluded']);

function wilsonLower(successes,total,z=1.96){
  if(total===0)return null;
  const p=successes/total,z2=z*z,denominator=1+z2/total;
  return (p+z2/(2*total)-z*Math.sqrt(p*(1-p)/total+z2/(4*total*total)))/denominator;
}

// Rows must be independently adjudicated. Unknown ground truth is reported,
// never counted as a correct prediction or hidden in an accuracy percentage.
export function evaluateOpportunityLabels(rows){
  if(!Array.isArray(rows))throw new Error('Supply labelled opportunities.');
  let tp=0,fp=0,fn=0,tn=0,unknown=0;
  const segments=new Map();
  for(const row of rows){
    if(!row||!tiers.has(row.predictedTier)||typeof row.category!=='string'||!row.category||typeof row.geography!=='string'||!row.geography)throw new Error('Invalid evaluation row.');
    if(row.truthQualified!==null&&typeof row.truthQualified!=='boolean')throw new Error('Truth must be adjudicated or explicitly unknown.');
    const predicted=row.predictedTier===positive;
    const bucket=row.truthQualified===null?'unknown':predicted?row.truthQualified?'tp':'fp':row.truthQualified?'fn':'tn';
    if(bucket==='tp')tp++;else if(bucket==='fp')fp++;else if(bucket==='fn')fn++;else if(bucket==='tn')tn++;else unknown++;
    const key=JSON.stringify([row.category,row.geography]);
    if(!segments.has(key))segments.set(key,{category:row.category,geography:row.geography,tp:0,fp:0,fn:0,tn:0,unknown:0});
    segments.get(key)[bucket]++;
  }
  const metrics=counts=>({
    ...counts,
    labelled:counts.tp+counts.fp+counts.fn+counts.tn,
    precision:counts.tp+counts.fp?counts.tp/(counts.tp+counts.fp):null,
    precisionLower95:counts.tp+counts.fp?wilsonLower(counts.tp,counts.tp+counts.fp):null,
    recall:counts.tp+counts.fn?counts.tp/(counts.tp+counts.fn):null,
    qualifiedCoverage:counts.tp+counts.fp+counts.fn+counts.tn?(counts.tp+counts.fp)/(counts.tp+counts.fp+counts.fn+counts.tn):null
  });
  return {total:rows.length,overall:metrics({tp,fp,fn,tn,unknown}),byCategoryAndGeography:[...segments.values()].map(metrics)};
}

// A buyer finding result belongs to an offer, rather than to an individual
// opportunity card. Eligibility must be adjudicated before research starts.
export function evaluateBuyerFinding(offers,{asOf,windowDays=14}={}){
  if(!Array.isArray(offers))throw new Error('Supply submitted offers.');
  if(!Number.isInteger(windowDays)||windowDays<1)throw new Error('Invalid observation window.');
  const evaluatedAt=new Date(asOf);
  if(!Number.isFinite(evaluatedAt.getTime()))throw new Error('Supply a valid asOf time.');
  const seen=new Set(),segments=new Map();
  const totals={submitted:0,submittedMatured:0,eligible:0,ineligible:0,pending:0,matured:0,found:0,qualifiedBuyers:0,notFound:0,unknown:0};
  for(const offer of offers){
    if(!offer||typeof offer.offerId!=='string'||!offer.offerId||seen.has(offer.offerId)
      ||typeof offer.category!=='string'||!offer.category||typeof offer.geography!=='string'||!offer.geography
      ||typeof offer.eligible!=='boolean'||!Array.isArray(offer.buyerEvidence))throw new Error('Invalid or duplicate offer.');
    const submittedAt=new Date(offer.submittedAt);
    if(!Number.isFinite(submittedAt.getTime())||submittedAt>evaluatedAt)throw new Error('Invalid submission time.');
    if(!offer.eligible&&(!offer.ineligibilityReason||typeof offer.ineligibilityReason!=='string'))throw new Error('Explain ineligibility.');
    seen.add(offer.offerId);
    const key=JSON.stringify([offer.category,offer.geography]);
    if(!segments.has(key))segments.set(key,{category:offer.category,geography:offer.geography,submitted:0,submittedMatured:0,eligible:0,ineligible:0,pending:0,matured:0,found:0,qualifiedBuyers:0,notFound:0,unknown:0});
    const counters=[totals,segments.get(key)];
    for(const c of counters)c.submitted++;
    const deadline=submittedAt.getTime()+windowDays*86400000;
    if(evaluatedAt.getTime()>=deadline)for(const c of counters)c.submittedMatured++;
    if(!offer.eligible){for(const c of counters)c.ineligible++;continue;}
    for(const c of counters)c.eligible++;
    if(evaluatedAt.getTime()<deadline){for(const c of counters)c.pending++;continue;}
    for(const c of counters)c.matured++;
    let found=false,unknown=false;
    const buyers=new Set();
    for(const event of offer.buyerEvidence){
      if(!event||typeof event.buyerId!=='string'||!event.buyerId)throw new Error('Invalid buyer evidence.');
      const at=new Date(event.qualifiedAt);
      if(!Number.isFinite(at.getTime())||at<submittedAt)throw new Error('Invalid buyer qualification time.');
      if(at.getTime()>deadline)continue;
      if(event.truthQualified!==true&&event.truthQualified!==false&&event.truthQualified!==null)throw new Error('Buyer truth must be adjudicated or unknown.');
      if(event.truthQualified===null){unknown=true;continue;}
      if(event.truthQualified===true&&event.reachable===true&&event.contactPermitted===true)buyers.add(event.buyerId);
    }
    found=buyers.size>0;
    for(const c of counters){
      c.qualifiedBuyers+=buyers.size;
      c[found?'found':unknown?'unknown':'notFound']++;
    }
  }
  const metrics=c=>({
    ...c,
    buyerFindingRate:c.matured?c.found/c.matured:null,
    buyerFindingLower95:c.matured?wilsonLower(c.found,c.matured):null,
    allSubmittedRate:c.submittedMatured?c.found/c.submittedMatured:null,
    resolvedRate:c.matured-c.unknown?c.found/(c.matured-c.unknown):null
  });
  return {asOf:evaluatedAt.toISOString(),windowDays,overall:metrics(totals),byCategoryAndGeography:[...segments.values()].map(metrics)};
}
