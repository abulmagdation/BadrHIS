import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import express from 'express';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import {existsSync} from 'node:fs';
import {readConfig} from './config.js';
const root=fileURLToPath(new URL('../',import.meta.url));
if(existsSync(resolve(root,'.env')))process.loadEnvFile(resolve(root,'.env'));
const config=readConfig();
const connection=await openDatabase();
const db=connection.db;
const app=createApp(db,config);
if(process.argv.includes('--dev')) {
  const {createServer}=await import('vite');
  const vite=await createServer({root,server:{middlewareMode:true},appType:'spa'});
  app.use(vite.middlewares);
} else {
  app.use(express.static(resolve(root,'dist')));
  app.get('/{*path}',(req,res)=>res.sendFile(resolve(root,'dist/index.html')));
}
const server=app.listen(config.port,config.host,()=>console.log(`Badr HIS listening on ${config.host}:${server.address().port}`));
let stopping=false;
async function shutdown(){
 if(stopping)return;stopping=true;
 const timeout=setTimeout(()=>process.exit(1),8000);timeout.unref();
 server.close(async()=>{await connection.close();clearTimeout(timeout);process.exit(0);});
 server.closeIdleConnections();
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
