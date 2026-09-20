import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase} from './db.js';

export async function migrate(db,file){
 const marker=db.collection('migrations');if(await marker.findOne({_id:'sqlite-v1'}))return {alreadyMigrated:true};
 if(!existsSync(file))return {noSource:true};
 const sqlite=new DatabaseSync(file,{readOnly:true});
 try {
 const ds=sqlite.prepare('SELECT * FROM departments ORDER BY id').all(),ps=sqlite.prepare('SELECT * FROM patients ORDER BY id').all();
 // Refuse to merge into an unrelated database. A migration started by this script can be resumed safely.
 let progress=await marker.findOne({_id:'sqlite-v1-progress'});
 if(!progress){if(await db.collection('patients').countDocuments()||await db.collection('departments').countDocuments())throw Error('Target database is not empty; migration stopped to protect existing records.');await marker.insertOne({_id:'sqlite-v1-progress',started_at:new Date().toISOString()});}
 for(const {id,...d} of ds)await db.collection('departments').updateOne({_id:id},{$setOnInsert:d},{upsert:true});
 const slots=new Map();
 for(const {id,...p} of ps){const slot=(slots.get(p.department_id)||0)+1;if(p.status==='active')slots.set(p.department_id,slot);const visit_id='legacy-'+id;
 const events=sqlite.prepare('SELECT * FROM events WHERE patient_id=? ORDER BY id').all(id).map(({id:ev,patient_id,...e})=>({...e,id:'legacy-'+ev,visit_id}));
 const visit={id:visit_id,admitted_at:p.admitted_at,discharged_at:p.discharged_at,department_id:p.department_id,department_name:ds.find(d=>d.id===p.department_id)?.name||'',bed:p.bed,notes:p.notes};
 await db.collection('patients').updateOne({_id:id},{$setOnInsert:{...p,medical_number:'BADR'+String(id).padStart(5,'0'),national_id:'',slot,current_visit_id:visit_id,events,visits:[visit]}},{upsert:true});}
 const maxPatient=Math.max(0,...ps.map(p=>p.id)),maxDept=Math.max(0,...ds.map(d=>d.id));
 for(const [name,value] of [['patients',maxPatient],['medical',maxPatient],['departments',maxDept]])await db.collection('counters').updateOne({_id:name},{$max:{value}},{upsert:true});
 const result={patients:ps.length,departments:ds.length,completed_at:new Date().toISOString()};await marker.insertOne({_id:'sqlite-v1',...result});return result;
 }finally{sqlite.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const connection=await openDatabase();try{console.log(JSON.stringify(await migrate(connection.db,resolve('data/hospital.sqlite'))));}finally{await connection.close();}}
