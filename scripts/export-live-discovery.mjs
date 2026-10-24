import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {scenarioCatalog} from '../server/scenario-planner.js';
const require=createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'__pull_live_export__.cjs'));
const {Workbook,SpreadsheetFile}=await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
const root=new URL('../research/scenario-lab/live-2026-10-24/',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
const cases=(await fs.readFile(new URL('cases.jsonl',root),'utf8')).trim().split('\n').map(JSON.parse);
const sources=(await fs.readFile(new URL('sources.jsonl',root),'utf8')).trim().split('\n').map(JSON.parse);
const reviews=JSON.parse(await fs.readFile(new URL('reviews.json',root),'utf8'));
const stress=JSON.parse(await fs.readFile(new URL('../stress.json',root),'utf8'));
const scenarios=new Map(scenarioCatalog().map(c=>[c.id,c]));
const out=path.resolve(process.argv[2]);await fs.mkdir(out,{recursive:true});
const wb=Workbook.create(),sheets={};for(const n of ['Overview','Investigations 520','Stress 10','Original checks','Source index']){sheets[n]=wb.worksheets.add(n);sheets[n].showGridLines=false;}
const col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const navy='#25334D',ink='#233047';
function table(name,title,note,headers,rows,widths,height=125){
  const s=sheets[name],last=col(headers.length-1),end=rows.length+4;
  s.getRange(`A1:${last}${end}`).format.font={name:'Arial',size:11,color:ink};
  s.getRange('A2').values=[[title]];s.getRange('A2').format.font={name:'Arial',size:15,bold:true,color:navy};s.getRange(`A2:${last}2`).format.rowHeightPx=30;
  s.getRange('A3').values=[[note]];s.getRange('A3').format.font={name:'Arial',size:11,italic:true,color:'#596579'};
  s.getRange(`A4:${last}${end}`).values=[headers,...rows];s.tables.add(`A4:${last}${end}`,true,name.replaceAll(' ','')+'Table').showFilterButton=true;
  s.getRange(`A5:${last}${end}`).format={fill:'#FFFFFF',font:{name:'Arial',size:11,color:ink},wrapText:true,verticalAlignment:'top',rowHeightPx:height};
  for(let r=5;r<=end;r+=2)s.getRange(`A${r}:${last}${r}`).format.fill='#F3F5F8';
  s.getRange(`A4:${last}4`).format={fill:navy,font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeightPx:42};
  s.getRange(`A4:${last}4`).format.borders={insideVertical:{style:'thin',color:'#FFFFFF'}};
  for(const [i,width] of widths.entries())s.getRange(`${col(i)}4:${col(i)}${end}`).format.columnWidthPx=width;
  s.freezePanes.freezeRows(4);s.freezePanes.freezeColumns(2);return s;
}
table('Investigations 520','520 individually researched discovery cases','Hypothetical seller inputs; recorded public-web searches. Machine observations are unverified source matches, not buyers.',
 ['Case','Seller offer','Place','Seller problem','Buyer-job hypothesis','Executed first query','First-pass observations','Adaptive observations','Executed adaptive query','Source references','Required qualification','Next investigation','Buyer status'],
 cases.map(c=>[c.caseId,c.product,c.location,scenarios.get(c.caseId).problem,c.buyerRole,c.query,c.machineAcceptedObservations,c.adaptive?.machineAcceptedObservations??null,c.adaptive?.query||'Not executed',
   [...new Set([...c.sourceObservations,...(c.adaptive?.sourceObservations||[])].map(s=>s.sourceId))].join('\n'),c.requiredChecks,
   c.nextInvestigation.actions.map(a=>a.reason).join('\n'),'Unconfirmed; buyer finding not measured']),
 [80,270,205,360,330,470,140,140,470,250,420,520,300],180);
// Explicit row height, rather than a guessed autofit across long source lists.
sheets['Investigations 520'].getRange('A5:M524').format.rowHeightPx=180;
table('Stress 10','10 cross-system stress cases','Engineering challenge specifications; their presence does not establish an end-to-end pass.',
 ['Case','Offer','Place','Failure to catch','Required behavior','Gap'],stress.map(c=>[c.id,c.offer,c.location,c.failure,c.expected,c.gap]),[80,320,210,490,560,220],125);
table('Original checks','9 selected original-page checks','Original pages can confirm a published business activity; they do not by themselves establish a current buying requirement.',
 ['Cases','Source URL','Check result','Observed','Still unknown','Next action'],reviews.reviews.map(r=>[r.caseIds.join(', '),r.url,r.status.replaceAll('_',' '),r.observed,r.doesNotEstablish,r.next]),[150,560,270,550,550,550],145);
table('Source index','Public source index · deduplicated URLs','Short excerpts only. Checked 24 October 2026; request date, ownership, contact permission and current buying need remain unverified.',
 ['Reference','Source title','URL','Short captured excerpt','Checked date','Review depth','Current buying need'],sources.map(s=>[s.id,s.title,s.url,s.excerpt,new Date(s.retrievedAt),s.reviewLevel.replaceAll('_',' '),'Unconfirmed']),[200,430,620,600,145,230,220],110);
sheets['Source index'].getRange(`E5:E${sources.length+4}`).setNumberFormat('yyyy-mm-dd');
const s=sheets.Overview;s.tabColor=navy;s.getRange('A1:F27').format.font={name:'Arial',size:11,color:ink};
s.getRange('A2').values=[['PULL GTM / LIVE DISCOVERY RESEARCH']];s.getRange('A2').format.font={name:'Arial',size:15,bold:true,color:navy};s.getRange('A3').values=[['24 October 2026 · 520 seller scenarios + 10 stress cases']];
s.getRange('A5:C5').values=[['Research activity','Count','Interpretation']];
s.getRange('A6:C16').values=[['Seller cases investigated',null,'Hypothetical offers, individually searched'],['Adaptive buyer-job searches',null,'Selected from first-pass gaps and sector samples'],['Total recorded case searches',null,'First plus adaptive passes'],['Unique admitted source URLs',null,'Source policy admission is not verified relevance'],['Excluded retained source occurrences',manifest.summary.policyExcludedRetainedSources,'Public-sector or other policy exclusions'],['Cases with first-pass observations',manifest.summary.casesWithMachineAcceptedObservations,'Lexical/source observations only'],['Recovered observation cases',manifest.summary.recoveredLexicalObservationCases,'Previously zero-observation cases; not confirmed buyers'],['Confirmed buyers',0,'No buyer interaction or independent qualification'],['Live buyer-finding rate',null,'Not measured'],['Independent relevance precision',null,'Not measured'],['Target buyer relevance',.98,'Target only; no accuracy claim']];
s.getRange('B6').formulas=[["=COUNTA('Investigations 520'!A5:A524)"]];s.getRange('B7').formulas=[["=COUNT('Investigations 520'!H5:H524)"]];s.getRange('B8').formulas=[['=B6+B7']];s.getRange('B9').formulas=[[`=COUNTA('Source index'!A5:A${sources.length+4})`]];s.getRange('B16').setNumberFormat('0%');s.getRange('B16').format.fill='#FFF1C8';
s.getRange('E5:F5').values=[['What changed in V2','Practical effect']];s.getRange('E6:F11').values=[['Evidence-chain feedback','Carries the offer, buyer job, business route, need and commercial-fit states into the reasoning layer.'],['Downstream refinement','Supply-heavy or empty results suggest a different buyer-job investigation within the original allowance.'],['More specific source matching','Generic buyer/company words no longer substitute for a product or useful role.'],['Supply-copy detection','Stock and ordering language prevents a retail advertisement from becoming a buying request.'],['Source ordering','Within an evidence tier, unexcluded routes and explicit geography take priority over excluded supply results.'],['Conditional commercial bridges','Reasoning must establish input form, partner capability, approval and economics before proposing an intermediate route.']];
s.getRange('A19:F19').values=[['Case','Offer','Research finding','Commercial implication','Must verify','Outcome']];
s.getRange('A20:F22').values=[['S001','Fresh yam / Ojuelegba','Ayoola describes yam-cake sourcing.','A preparation or aggregation route may be worth investigating.','Current specification, intake, partner, seller approval and delivered economics.','Hypothesis; no buyer confirmed'],['S061','Corporate shirts / Ojuelegba','Initial results were mainly clothing suppliers.','Investigate real uniform requirements or an approved finishing/reseller route.','An authorized buyer brief, sizes, fabric, branding, quantities and deadline.','Hypothesis; no buyer confirmed'],['S101','2026 C300 / Lagos','Official dealer locations are published; a seller-pathway fetch failed.','A dealer directory does not establish stock acquisition or an end buyer.','Vehicle identity, inspection, current acquisition mandate and permission.','Hypothesis; no buyer confirmed']];
for(const range of ['A5:C5','E5:F5','A19:F19'])s.getRange(range).format={fill:navy,font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeightPx:38};
s.getRange('A6:C16').format={wrapText:true,verticalAlignment:'top',rowHeightPx:63};s.getRange('E6:F11').format={wrapText:true,verticalAlignment:'top',rowHeightPx:63};s.getRange('A20:F22').format={wrapText:true,verticalAlignment:'top',rowHeightPx:130};
for(const [i,width] of [260,200,420,420,420,500].entries())s.getRange(`${col(i)}1:${col(i)}27`).format.columnWidthPx=width;
wb.recalculate();console.log((await wb.inspect({kind:'region',sheetId:'Overview',range:'A5:C16',tableMaxRows:12,tableMaxCols:3,maxChars:3000})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#VALUE!|#DIV/0!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:10},maxChars:900})).ndjson);
for(const [name,range] of [['Overview','A1:C16'],['Investigations 520','A2:E7'],['Stress 10','A2:D6'],['Original checks','A2:D6'],['Source index','A2:D7']]){const blob=await wb.render({sheetName:name,range,scale:1,format:'png'});await fs.writeFile(path.join(out,name.replaceAll(' ','-')+'.png'),new Uint8Array(await blob.arrayBuffer()));}
await (await SpreadsheetFile.exportXlsx(wb)).save(path.join(out,'Pull_GTM_520_Live_Discovery_Research.xlsx'));console.log(JSON.stringify({file:path.join(out,'Pull_GTM_520_Live_Discovery_Research.xlsx'),summary:manifest.summary}));
