import {cpSync,mkdirSync} from 'node:fs';
for(const path of ['prompts','content']) {mkdirSync('public/'+path,{recursive:true});cpSync(path,'public/'+path,{recursive:true});}
