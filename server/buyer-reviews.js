import {loadConfirmedOffer} from './offers.js';
import {validateBuyerReview,assessBuyerReview} from './buyer-assessment.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sourceId=/^buyer-source-[a-f0-9]{20}$/;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function databaseError(result){
  if(!result.error)return;
  const code=result.error.code;
  throw fail(code==='42501'?'This saved research or review is unavailable.':code==='40001'?'The product or review changed. Reload it before saving.':code==='22023'?'Check your review details.':code==='P0001'?'The daily review allowance is reached.':'Buyer reviews are temporarily unavailable.',code==='42501'?404:code==='40001'?409:code==='22023'?400:code==='P0001'?429:503);
}
function reviewResult(row,ownerId){
  if(!row||row.user_id!==ownerId||row.basis!=='seller_reported')throw fail('The saved review could not be read.',503);
  return {id:row.id,revision:row.revision,runId:row.run_id,sourceId:row.source_id,offerId:row.offer_id,offerVersion:row.offer_version,
    sourceTitle:row.candidate.title,answers:row.answers,note:row.note,basis:'seller_reported',createdAt:row.created_at,assessment:assessBuyerReview(row.candidate,row.answers)};
}
const outcomeResult=row=>({id:row.id,reviewId:row.review_id,kind:row.kind,note:row.note,basis:'seller_reported',reportedAt:row.reported_at,supersedesId:row.supersedes_id});
export async function buyerReviewsRequest({request,body,db,ownerId,env,now=()=>new Date()}){
  if(env.PULL_OFFERS_ENABLED!=='true'||env.PULL_BUYER_REVIEWS_ENABLED!=='true'||env.PULL_RESEARCH_DURABLE_ENABLED!=='true')throw fail('Saved buyer reviews need the V2 review and research storage setup.',503);
  if(request.method==='GET'){
    const url=new URL(request.url),runId=url.searchParams.get('runId'),source=url.searchParams.get('sourceId');
    if(url.searchParams.has('offerId')){
      const id=url.searchParams.get('offerId'),version=Number(url.searchParams.get('offerVersion'));
      if(!uuid.test(id||'')||!Number.isInteger(version)||version<1)throw fail('Choose a current saved offer.');
      await loadConfirmedOffer({db,ownerId,reference:{id,version},env});
      const rows=await db.from('pull_buyer_reviews').select('id,user_id,revision,run_id,source_id,offer_id,offer_version,answers,note,candidate,basis,created_at').eq('user_id',ownerId).eq('offer_id',id).eq('offer_version',version).order('created_at',{ascending:false}).limit(100).all();
      databaseError(rows);
      const latest=new Map();
      for(const row of rows.data||[]){const key=JSON.stringify([row.run_id,row.source_id]);if(!latest.has(key)||latest.get(key).revision<row.revision)latest.set(key,reviewResult(row,ownerId));}
      return {reviews:[...latest.values()],limit:100,notice:'Latest assessments from the 100 most recent review versions for this product version.'};
    }
    if(!uuid.test(runId||'')||!sourceId.test(source||''))throw fail('Choose a source from saved product research.');
    const run=await db.from('pull_research_runs').select('id,user_id,status,snapshot,retain_until').eq('user_id',ownerId).eq('id',runId).maybeSingle();
    databaseError(run);
    if(!run.data||run.data.user_id!==ownerId||run.data.status!=='complete'||!(new Date(run.data.retain_until)>now()))throw fail('This research is incomplete, expired or unavailable.',404);
    const result=run.data.snapshot?.result,candidate=result?.opportunities?.find(item=>item.id===source);
    if(!candidate||!result.offerReference)throw fail('This source is not part of the saved product research.',404);
    const offer=await loadConfirmedOffer({db,ownerId,reference:result.offerReference,env});
    const saved=await db.from('pull_buyer_reviews').select('id,user_id,revision,run_id,source_id,offer_id,offer_version,answers,note,candidate,basis,created_at').eq('user_id',ownerId).eq('run_id',runId).eq('source_id',source).order('revision',{ascending:false}).limit(1).maybeSingle();
    databaseError(saved);
    const outcomes=await db.from('pull_buyer_outcomes').select('id,review_id,kind,note,basis,reported_at,supersedes_id').eq('user_id',ownerId).eq('run_id',runId).eq('source_id',source).order('reported_at',{ascending:false}).limit(100).all();
    databaseError(outcomes);
    return {candidate,offer:{id:offer.id,version:offer.version,fields:offer.fields},review:saved.data?reviewResult(saved.data,ownerId):null,outcomes:(outcomes.data||[]).map(outcomeResult),notice:'Reviews and outcomes here are seller reports. They do not count as independently verified buyers.'};
  }
  if(body?.action==='review'){
    if(Object.keys(body).some(k=>!['action','runId','sourceId','expectedRevision','requestKey','answers','note'].includes(k))||!uuid.test(body.runId||'')||!sourceId.test(body.sourceId||'')||!uuid.test(body.requestKey||'')||!Number.isInteger(body.expectedRevision)||body.expectedRevision<0||body.expectedRevision>=100)throw fail('Choose a saved source and current review version.');
    let input;try{input=validateBuyerReview(body.answers,body.note);}catch(error){throw fail(error.message);}
    const result=await db.rpc('save_pull_buyer_review',{p_run:body.runId,p_source:body.sourceId,p_expected_revision:body.expectedRevision,p_request_key:body.requestKey,p_answers:input.answers,p_note:input.note});
    databaseError(result);
    return {review:reviewResult(result.data,ownerId)};
  }
  if(body?.action==='outcome'){
    if(Object.keys(body).some(k=>!['action','reviewId','requestKey','kind','note','supersedesId'].includes(k))||!uuid.test(body.reviewId||'')||!uuid.test(body.requestKey||'')||!['contacted','replied','not_interested','sale','correction'].includes(body.kind)
      ||typeof body.note!=='string'||body.note.trim().length<10||body.note.trim().length>1000||(body.kind==='correction')!==(body.supersedesId!==undefined)||body.supersedesId!==undefined&&!uuid.test(body.supersedesId))throw fail('Choose an outcome and describe what happened.');
    const result=await db.rpc('record_pull_buyer_outcome',{p_review:body.reviewId,p_request_key:body.requestKey,p_kind:body.kind,p_note:body.note.trim(),p_supersedes:body.supersedesId||null});
    databaseError(result);
    if(!result.data||result.data.user_id!==ownerId)throw fail('The reported outcome could not be read.',503);
    return {outcome:outcomeResult(result.data)};
  }
  throw fail('Choose review or outcome.');
}
