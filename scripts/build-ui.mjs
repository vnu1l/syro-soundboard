import { cp, mkdir, rm, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const dist=resolve(root,'dist');
await rm(dist,{recursive:true,force:true}); await mkdir(dist,{recursive:true});
for(const file of ['index.html','styles.css','app.js','manifest.webmanifest']) await copyFile(resolve(root,file),resolve(dist,file));
for(const dir of ['css','js','fragments','assets']) await cp(resolve(root,dir),resolve(dist,dir),{recursive:true});
console.log('Syro UI built -> dist/');
