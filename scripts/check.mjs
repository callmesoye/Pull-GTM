import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
async function check(path){for(const file of await readdir(path,{withFileTypes:true})){const name=path+'/'+file.name;if(file.isDirectory())await check(name);else if(/\.(js|mjs)$/.test(name)){const result=spawnSync(process.execPath,['--check',name],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}}}
for(const folder of ['dist','api','server','scripts','supabase/functions'])await check(folder);
console.log('All application and server files pass syntax checks.');
