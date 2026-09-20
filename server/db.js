import {MongoClient} from 'mongodb';
import {readConfig} from './config.js';
export async function openDatabase(name=process.env.MONGODB_DATABASE||'badr_his_local') {
 const {mongodbUri}=readConfig();
 const client=new MongoClient(mongodbUri,{serverSelectionTimeoutMS:10000,maxPoolSize:20});await client.connect();const db=client.db(name);
 try {
 await db.collection('departments').createIndex({name:1},{unique:true});
 await db.collection('patients').createIndex({medical_number:1},{unique:true});
 await db.collection('patients').createIndex({national_id:1},{unique:true,partialFilterExpression:{national_id:{$gt:''}}});
 await db.collection('patients').createIndex({department_id:1,slot:1},{unique:true,partialFilterExpression:{status:'active'}});
 await db.collection('patients').createIndex({department_id:1,bed:1},{unique:true,partialFilterExpression:{status:'active',bed:{$gt:''}}});
 await db.collection('patients').createIndex({admitted_at:-1,_id:-1});
 await db.collection('users').createIndex({username_key:1},{unique:true});
 await db.collection('sessions').createIndex({expires_at:1},{expireAfterSeconds:0});
 await db.collection('audit_logs').createIndex({created_at:-1});
 }catch(e){await client.close();throw e;}
 return {db,close:()=>client.close()};
}
export async function nextId(db,name){return (await db.collection('counters').findOneAndUpdate({_id:name},{$inc:{value:1}},{upsert:true,returnDocument:'after'})).value;}
export function publicPatient(p){if(!p)return null;const {_id,events,visits,slot,...rest}=p;return {...rest,id:_id,visit_count:visits?.length||1,discharge_count:visits?.filter(v=>v.discharged_at).length||0};}
