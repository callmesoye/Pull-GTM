// Optional report exporter. Requires the Codex artifact-tool runtime, not a
// production application dependency. Core JSON/CSV compilation uses Node only.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {compileScenarioLab} from './build-scenario-lab.mjs';
if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw new Error('Use the Codex primary artifact runtime for workbook export.');
const require=createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'__pull_scenario_export__.cjs'));
const {Workbook,SpreadsheetFile}=await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
const out=path.resolve(process.argv[2]||'artifacts/scenario-lab/workbook');await fs.mkdir(out,{recursive:true});
const lab=await compileScenarioLab(),wb=Workbook.create(),sheets={};
for(const name of ['Overview','Seller cases','Stress cases','Mechanisms','Gaps','Sources']){const s=wb.worksheets.add(name);s.showGridLines=false;sheets[name]=s;}
const col=n=>{let x='';for(n++;n;n=Math.floor((n-1)/26))x=String.fromCharCode(65+(n-1)%26)+x;return x;};
const dark='#25334D',purple='#6651A5',ink='#223047',muted='#596579';
function table(name,title,note,headers,rows,widths,{height=100,freeze=2}={}){
  const s=sheets[name],last=col(headers.length-1),end=4+rows.length;
  s.getRange(`A1:${last}${end}`).format.font={name:'Arial',size:11,color:ink};
  s.getRange(`A2:${last}2`).format.rowHeightPx=28;
  s.getRange('A2').values=[[title]];s.getRange('A2').format.font={name:'Arial',size:15,bold:true,color:dark};
  s.getRange('A3').values=[[note]];s.getRange('A3').format.font={name:'Arial',size:11,italic:true,color:muted};
  s.getRange(`A4:${last}${end}`).values=[headers,...rows];
  const t=s.tables.add(`A4:${last}${end}`,true,name.replaceAll(' ','')+'Table');t.showFilterButton=true;
  s.getRange(`A4:${last}4`).format={fill:dark,font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeightPx:38};
  s.getRange(`A5:${last}${end}`).format={fill:'#FFFFFF',font:{name:'Arial',size:11,color:ink},wrapText:true,verticalAlignment:'top',rowHeightPx:height};
  for(let row=5;row<=end;row+=2)s.getRange(`A${row}:${last}${row}`).format.fill='#F3F5F8';
  for(let i=0;i<widths.length;i++)s.getRange(`${col(i)}4:${col(i)}${end}`).format.columnWidthPx=widths[i];
  s.getRange(`A4:${last}4`).format.borders={insideVertical:{style:'thin',color:'#FFFFFF'}};
  s.freezePanes.freezeRows(4);s.freezePanes.freezeColumns(freeze);
  return s;
}
table('Seller cases','520 seller problems · 52 sectors','Research-grounded hypothetical cases; no identified customer, active buyer or measured result is asserted.',
 ['Case','Sector','Seller offer','Place','Problem to solve','Proposed buyer role','Conditional buying trigger','Binding checks','Purchase mechanism','Primary research path','Alternative route','Planned queries','Proof before introduction','Success measure','Background sources','Evidence status'],
 lab.cases.map(c=>[c.id,c.sector.name,c.product,c.location,c.problem,c.buyerRole,c.trigger,c.bindingCheck,c.plan.mechanism.name,c.plan.steps.join(' → '),c.plan.directoryHandoff?'Optional targeted Maps handoff: '+c.plan.directoryHandoff.query:'Authorized briefs, opt-in requests or a buyer-approved pilot; directory search not suggested.',c.plan.input.hypotheses.flatMap(h=>h.queries).join('\n'),c.plan.requiredProof.join('\n'),c.plan.successMetric,c.sourceIds.join(', '),'Hypothetical · buyer outcome not measured']),
 [75,205,245,185,320,290,340,350,250,430,360,420,420,350,150,230],{height:126});
table('Stress cases','10 adversarial cases · T521–T530','These are engineering challenge specifications; their presence does not mean every underlying gap is fixed.',
 ['Case','Offer','Place','Failure to catch','Required behavior','System gap','Mechanism'],lab.stress.map(c=>[c.id,c.offer,c.location,c.failure,c.expected,c.gap,c.mechanism]),[80,265,205,420,480,200,130],{height:116});
table('Mechanisms','20 purchase mechanisms','Mechanisms shape research and qualification. They do not infer a person’s wealth or make someone a buyer.',
 ['ID','Mechanism','Buyer job','Workflow','Required proof','Success measure','Gaps exposed','Maps alternative'],lab.mechanisms.map(m=>[m.id,m.name,m.job,m.steps.map((s,i)=>(i+1)+'. '+s).join('\n'),m.proof,m.metric,m.gaps.join(', '),m.directoryUseful?'Optional business-route handoff only':'Not suggested']),[80,285,350,480,420,380,300,250],{height:128});
table('Gaps','38 system gaps · counted across scenario mechanisms','Counts overlap. They measure designed case coverage, not frequency among real sellers or severity in production.',
 ['Gap','Cases affected','Current status','Build or verification needed'],lab.gaps.map(g=>[g.gap,g.affectedCases,g.status.replaceAll('_',' '),g.action]),[245,130,270,680],{height:76,freeze:1});
table('Sources','51 current research checks','Checked 23 October 2026. Publication dates vary. Sources support background or technical capability, not each imagined local transaction.',
 ['ID','Source title','URL','Published date','Checked date','Scope','What this source supports','Review depth'],lab.sources.map(s=>[s.id,s.title,s.url,s.publishedDate||'Not established',s.checkedAt,s.scope.replaceAll('_',' '),s.supports,'Retrieved search content; not a full audit']),[75,410,570,150,150,310,550,270],{height:90,freeze:1});
const ov=sheets.Overview;ov.tabColor=dark;
ov.getRange('A1:H31').format.font={name:'Arial',size:11,color:ink};
ov.getRange('A2').values=[['PULL GTM / SCENARIO LAB']];ov.getRange('A2').format.font={name:'Arial',size:15,bold:true,color:dark};ov.getRange('A2:H2').format.rowHeightPx=30;
ov.getRange('A3').values=[['520 distinct offers + 10 adversarial cases | research checked 23 October 2026']];ov.getRange('A3').format.font={name:'Arial',size:11,color:muted};
ov.getRange('A5:C5').values=[['Coverage','Count','Meaning']];ov.getRange('A6:C11').values=[['Seller scenarios',null,'Original hypothetical cases'],['Stress cases',null,'Engineering challenge specifications'],['Sectors',52,'Ten offers per sector'],['Purchase mechanisms',null,'Shared reusable buying workflows'],['Sources reviewed',null,'Background and technical sources'],['System gaps',null,'Overlapping mechanism requirements']];
ov.getRange('B6').formulas=[["=COUNTA('Seller cases'!A5:A524)"]];ov.getRange('B7').formulas=[["=COUNTA('Stress cases'!A5:A14)"]];ov.getRange('B9').formulas=[["=COUNTA(Mechanisms!A5:A24)"]];ov.getRange('B10').formulas=[["=COUNTA(Sources!A5:A55)"]];ov.getRange('B11').formulas=[["=COUNTA(Gaps!A5:A42)"]];
ov.getRange('E5:H5').values=[['Performance measure','Value','State','Interpretation']];
ov.getRange('E6:H10').values=[['Target opportunity precision',.98,'Target only','Not an observed result'],['Target offer-level buyer finding',.98,'Target only','Separate from card precision'],['Live opportunity precision',null,'Not measured','Requires independent labelled outcomes'],['Live buyer-finding rate',null,'Not measured','Requires a registered matured offer cohort'],['Verified buyers found',0,'None in this research','Scenarios and sources are not buyers']];ov.getRange('F6:F7').setNumberFormat('0%');
ov.getRange('A14:H14').values=[['Example','Offer','Place','Problem','Buyer hypothesis','Must establish','Mechanism','Result today']];
const featured=[lab.cases[0],lab.cases[60],lab.cases[100]];
ov.getRange('A15:H17').values=featured.map(c=>[c.id,c.product,c.location,c.problem,c.buyerRole,c.bindingCheck,c.plan.mechanism.name,'Research plan prepared; no buyer confirmed']);
ov.getRange('A20:C20').values=[['Built in this V2 increment','Where it helps','Limits']];
ov.getRange('A21:C25').values=[['Scenario-guided research','Use-specific buyer hypotheses','At most two matched cases; actual seller geography retained'],['Quantity and minimum-order checks','Avoid impossible wholesale matches','Only explicit comparable units; no bag or density guesses'],['Unit-price subtotal checks','Expose goods cost above buyer budget','Delivered fit remains unconfirmed'],['Optional targeted Maps links','Investigate a relevant business role nearby','Manual navigation; listing presence is not demand'],['98% pilot review gates','Separate precision from offer-level buyer finding','Confidence bounds and human evidence review; no release authority']];
ov.getRange('E20:H20').values=[['Read the lab','Purpose','Evidence','Next step']];
ov.getRange('E21:H25').values=[['Seller cases','Filter real product problems','Hypotheses','Select a pilot offer'],['Stress cases','Find dangerous false matches','Adversarial specifications','Implement and verify missing gates'],['Mechanisms','Reuse commercial logic','Designed workflows','Test against the actual buyer job'],['Gaps','Prioritize engineering','Case coverage counts','Add specific-offer buyer responses'],['Sources','Audit research provenance','Published material','Verify current local demand separately']];
for(const r of [5,14,20])ov.getRange(`A${r}:${r===14?'H':'C'}${r}`).format={fill:dark,font:{name:'Arial',size:11,color:'#FFFFFF',bold:true},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeightPx:36};
for(const r of [5,20])ov.getRange(`E${r}:H${r}`).format={fill:dark,font:{name:'Arial',size:11,color:'#FFFFFF',bold:true},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeightPx:36};
for(const range of ['A6:C11','E6:H10','A15:H17','A21:C25','E21:H25'])ov.getRange(range).format={wrapText:true,verticalAlignment:'top',rowHeightPx:68};
ov.getRange('A6:C11').format.rowHeightPx=48;ov.getRange('E6:H10').format.rowHeightPx=65;
ov.getRange('A15:H17').format.rowHeightPx=145;ov.getRange('A21:H25').format.rowHeightPx=95;
ov.getRange('B6:B11').setNumberFormat('0');ov.getRange('F10').setNumberFormat('0');
ov.getRange('F6:F7').format.fill='#FFF1C8';ov.getRange('G6:G9').format.font={name:'Arial',size:11,bold:true,color:purple};
for(const [i,width] of [200,220,285,300,260,300,240,290].entries())ov.getRange(`${col(i)}1:${col(i)}31`).format.columnWidthPx=width;
wb.recalculate();
console.log((await wb.inspect({kind:'region',sheetId:'Overview',range:'A5:C11',maxChars:2200,tableMaxRows:7,tableMaxCols:3})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#VALUE!|#DIV/0!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:10},maxChars:1000})).ndjson);
for(const [name,range] of [['Overview','A1:C11'],['Seller cases','A2:E7'],['Stress cases','A2:D6'],['Mechanisms','A2:D6'],['Gaps','A2:D7'],['Sources','A2:C7']]){
  const blob=await wb.render({sheetName:name,range,scale:1.25,format:'png'});await fs.writeFile(path.join(out,name.replaceAll(' ','-')+'.png'),new Uint8Array(await blob.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(wb)).save(path.join(out,'Pull_GTM_530_Scenario_Lab.xlsx'));
console.log(JSON.stringify({file:path.join(out,'Pull_GTM_530_Scenario_Lab.xlsx'),scope:lab.scope}));
