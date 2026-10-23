import {mkdirSync,openSync,closeSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export function summarizeTests(tap){
  const counts={};
  for(const key of ['tests','pass','fail','cancelled','skipped','todo']){
    const values=[...tap.matchAll(new RegExp('^# '+key+' (\\d+)\\s*$','gm'))];
    if(values.length!==1)return null;
    counts[key]=Number(values[0][1]);
  }
  return counts;
}

// Run from a clean checkout with npm ci --ignore-scripts. No configuration,
// secrets, live provider requests, database migrations or deployment are used.
export function runQuality({root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),output}={}){
  const directory=resolve(root,output||'artifacts/quality');mkdirSync(directory,{recursive:true});
  const startedAt=new Date().toISOString();
  const git=args=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});return r.status===0?r.stdout.trim():null;};
  const dirty=git(['status','--porcelain','--untracked-files=normal']);
  const report={schemaVersion:1,scope:'local_synthetic_verification',startedAt,
    revision:{commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),workingTreeDirty:dirty===null?null:Boolean(dirty)},
    runtime:{node:process.version,platform:process.platform,architecture:process.arch},checks:[],
    externalEvidence:{buyerFindingRate:null,liveProviders:'not_assessed',productionRLS:'not_assessed',visualAndAccessibility:'not_assessed',recoveryAndOperations:'not_assessed'},
    productionReadiness:'not_established'};
  const files=readdirSync(resolve(root,'tests')).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'tests/'+name);
  const commands=[['syntax',['scripts/check.mjs']],['tests',['--test','--test-reporter=tap',...files]],['whitespace',null]];
  for(const [name,args] of commands){
    console.log('Checking '+name+'…');
    const log=name+'.log',fd=openSync(resolve(directory,log),'w'),started=performance.now();
    let result;
    try{result=spawnSync(args?process.execPath:'git',args||['diff','--check','HEAD'],{cwd:root,stdio:['ignore',fd,fd],timeout:180000});}
    finally{closeSync(fd);}
    const entry={name,passed:result.status===0,exitCode:result.status,signal:result.signal||null,durationMs:Math.round(performance.now()-started),log};
    if(result.error)entry.error=result.error.code||'process_error';
    if(name==='tests'){
      entry.summary=summarizeTests(readFileSync(resolve(directory,log),'utf8'));
      entry.passed=entry.passed&&Boolean(entry.summary&&entry.summary.tests>0&&entry.summary.pass===entry.summary.tests&&entry.summary.fail===0&&entry.summary.cancelled===0&&entry.summary.skipped===0&&entry.summary.todo===0);
    }
    report.checks.push(entry);
    console.log(name+': '+(entry.passed?'passed':'failed'));
    if(entry.summary)console.log(JSON.stringify(entry.summary));
    if(!entry.passed)console.error(readFileSync(resolve(directory,log),'utf8').split('\n').slice(-35).join('\n'));
  }
  report.localChecksPassed=report.checks.every(check=>check.passed);
  report.completedAt=new Date().toISOString();
  writeFileSync(resolve(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('Report: '+resolve(directory,'report.json'));
  console.log('Live buyer finding and production readiness remain unassessed.');
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.length&&!(args.length===2&&args[0]==='--output')){console.error('Usage: npm run quality -- [--output directory]');process.exitCode=2;}
  else process.exitCode=runQuality({output:args[1]}).localChecksPassed?0:1;
}
