import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readConfig,originAllowed} from '../server/config.js';
import {openDatabase} from '../server/db.js';
import {createApp} from '../server/app.js';

const cloudEnv={NODE_ENV:'production',MONGODB_URI:'mongodb+srv://example.invalid/',SETUP_TOKEN:'test-bootstrap-token-with-more-than-32-characters',PORT:'8080'};
test('Cloud Run configuration supports external MongoDB and validates required settings',()=>{
 const config=readConfig(cloudEnv);
 assert.equal(config.host,'0.0.0.0');assert.equal(config.port,8080);
 assert.equal(config.mongodbUri,cloudEnv.MONGODB_URI);
 assert.throws(()=>readConfig({...cloudEnv,MONGODB_URI:''}),/MONGODB_URI/);
 assert.throws(()=>readConfig({...cloudEnv,SETUP_TOKEN:''}),/SETUP_TOKEN/);
 assert.throws(()=>readConfig({...cloudEnv,PORT:'1.5'}),/PORT/);
 assert.equal(readConfig({}).host,'127.0.0.1');
 assert.equal(originAllowed('https://badrhis.run.app','badrhis.run.app',config),true);
 assert.equal(originAllowed('https://other.run.app','badrhis.run.app',config),false);
 assert.equal(originAllowed('http://badrhis.run.app','badrhis.run.app',config),false);
 assert.equal(originAllowed('null','badrhis.run.app',config),false);
 const custom=readConfig({...cloudEnv,APP_ORIGIN:'https://his.example.com'});
 assert.equal(originAllowed('https://his.example.com','badrhis.run.app',custom),true);
 assert.equal(originAllowed('https://badrhis.run.app','badrhis.run.app',custom),false);
});

test('Cloud deployment protects first admin setup, enforces origins and secures cookies',async()=>{
 const name='badr_his_test_deploy_'+randomUUID().replaceAll('-','');
 const connection=await openDatabase(name),config=readConfig(cloudEnv);
 const server=createApp(connection.db,config).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const call=(path,body,origin=base.replace('http:','https:'))=>fetch(base+path,{method:body?'POST':'GET',headers:{origin,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.equal((await call('/healthz')).status,200);
  assert.equal((await (await call('/api/auth/status')).json()).setupTokenRequired,true);
  assert.equal((await call('/api/auth/status',undefined,'https://attacker.example')).status,403);
  const admin={name:'Cloud QA',username:'cloud_admin',password:'CloudTest123!'};
  assert.equal((await call('/api/auth/setup',admin)).status,403);
  assert.equal(await connection.db.collection('users').countDocuments(),0);
  const setup=await call('/api/auth/setup',{...admin,setup_token:config.setupToken});
  assert.equal(setup.status,201);assert.match(setup.headers.get('set-cookie'),/; Secure/);
  assert.equal((await call('/api/auth/setup',{...admin,setup_token:config.setupToken})).status,409);
  assert.equal((await (await call('/api/auth/status')).json()).needsSetup,false);
  const login=await call('/api/auth/login',admin);assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly.*Secure/);
  const logout=await call('/api/auth/logout',{});assert.match(logout.headers.get('set-cookie'),/Max-Age=0; Secure/);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  if(!name.startsWith('badr_his_test_deploy_'))throw Error('Unsafe test database');
  await connection.db.dropDatabase();await connection.close();
 }
});
