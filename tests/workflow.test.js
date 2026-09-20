import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/db.js';
import {createApp} from '../server/app.js';
import {transliterateArabicName} from '../shared/transliterate.js';
import {birthDateFromNationalId} from '../shared/nationalId.js';
test('Arabic names are transliterated phonetically using only the first three names',()=>{
 assert.equal(transliterateArabicName('محب أحمد علي محمد'),'Moheb Ahmed Ali');
 assert.equal(transliterateArabicName('هبة مزيد خلف مزيد'),'Heba Mazeed Khalaf');
});
test('Egyptian national IDs produce a valid birth date',()=>{
 assert.equal(birthDateFromNationalId('٢٩٨١٠١١٠١٠٠٠٠١'),'1998-10-11');
 assert.equal(birthDateFromNationalId('39902300100001'),'');
 assert.equal(birthDateFromNationalId('49810110100001'),'');
});
test('MongoDB: manual/automatic numbers, readmissions, atomic history, capacity and durable data',async()=>{
 const name='badr_his_test_'+randomUUID().replaceAll('-',''),connection=await openDatabase(name),db=connection.db;
 const server=createApp(db).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const makeRequester=()=>{let cookie='';return async(path,body)=>{const headers={};if(body)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;const r=await fetch(base+path,body?{method:'POST',headers,body:JSON.stringify(body)}:{headers});const setCookie=r.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];return {status:r.status,data:await r.json()};};};
 const req=makeRequester();
 try{
 assert.equal((await req('/state')).status,401);
 const initialStatus=await req('/auth/status');assert.equal(initialStatus.data.needsSetup,true);
 const setup=await req('/auth/setup',{name:'مدير الاختبار',username:'admin_test',password:'StrongPass123'});assert.equal(setup.status,201);assert.equal(setup.data.user.role,'admin');
 const a=(await req('/departments',{name:'اختبار أ',capacity:1})).data.id,b=(await req('/departments',{name:'اختبار ب',capacity:3})).data.id;
 const input={name:'مريض اختبار',english:'Test Patient',dob:'',gender:'female',department_id:a,bed:'1',national_id:'٢٩٨١٠١١٠١٠٠٠٠١',medical_number:'custom-001'};
 assert.equal((await req('/patients',{...input,national_id:'123'})).status,400);
 assert.equal((await req('/patients',{...input,dob:'2020-02-31'})).status,400);
 const first=await req('/patients',input);assert.equal(first.status,201);const id=first.data.id;
 assert.equal(first.data.medical_number,'CUSTOM-001');assert.equal(first.data.national_id,'29810110100001');assert.equal(first.data.dob,'1998-10-11');
 const edited=await req('/patients/'+id+'/edit',{medical_number:'custom-009',national_id:'29810110100001',name:'مريض معدل',english:'Edited Patient',dob:'1997-01-02',gender:'male',phone:'01000000000'});assert.equal(edited.status,200);assert.equal(edited.data.medical_number,'CUSTOM-009');assert.equal(edited.data.name,'مريض معدل');assert.equal(edited.data.phone,'01000000000');
 assert.equal((await req('/patients/lookup?medical_number=custom-001')).data.patient,null);
 assert.equal((await req('/patients/lookup?medical_number=custom-009')).data.patient.id,id);
 assert.equal((await req('/patients/lookup?national_id=٢٩٨١٠١١٠١٠٠٠٠١')).data.patient.id,id);
 assert.equal((await req('/patients/lookup?national_id=123')).status,400);
 input.medical_number='CUSTOM-009';input.name='مريض معدل';input.english='Edited Patient';input.dob='1997-01-02';input.gender='male';input.phone='01000000000';
 assert.equal((await req('/patients',input)).status,409);
 assert.equal((await req('/patients',{...input,medical_number:'OTHER',department_id:b})).status,409);
 assert.equal((await req('/patients',{...input,medical_number:'NEW',national_id:''})).status,400);
 assert.equal((await req('/patients/'+id+'/transfer',{department_id:b,bed:'2'})).status,200);
 assert.equal((await req('/patients',{...input,medical_number:'NEW',national_id:'',department_id:b,bed:'2'})).status,400);
 assert.equal((await req('/patients/'+id+'/discharge',{note:'الخروج الأول'})).status,200);
 const oldVisit=(await req('/patients/'+id+'/visits')).data[0];assert.ok(oldVisit.discharged_at);
 assert.equal((await req('/patients',{medical_number:'CUSTOM-009',department_id:a})).status,409);
 const re=await req('/patients',{medical_number:'CUSTOM-009',existing_patient_id:String(id),department_id:a,bed:'7',notes:'الزيارة الثانية'});
 assert.equal(re.status,201);assert.equal(re.data.id,id);assert.equal(re.data.visit_count,2);assert.equal(re.data.name,input.name);assert.equal(re.data.national_id,'29810110100001');
 const visits=(await req('/patients/'+id+'/visits')).data;assert.equal(visits.length,2);assert.deepEqual(visits[1],oldVisit);assert.equal(visits[0].notes,'الزيارة الثانية');
 assert.equal((await req('/patients/'+id+'/events')).data.length,5);
 // Automatic numbering follows the largest existing numeric medical number, including a manual one.
 assert.equal((await req('/patients',{...input,medical_number:'BADR65490',national_id:'',department_id:b})).status,201);
 const auto=await req('/patients',{...input,medical_number:'',national_id:'',department_id:b,bed:'3'});assert.equal(auto.status,201);assert.equal(auto.data.medical_number,'BADR65491');
 assert.equal((await req('/departments/'+b+'/edit',{name:'اختبار ب',english:'',capacity:1})).status,409);
 assert.equal((await req('/departments/'+b+'/edit',{name:'اختبار أ',english:'',capacity:4})).status,409);
 const departmentEdit=await req('/departments/'+b+'/edit',{name:'اختبار ب معدل',english:'Edited Ward',capacity:4});assert.equal(departmentEdit.status,200);assert.equal(departmentEdit.data.name,'اختبار ب معدل');assert.equal(departmentEdit.data.capacity,4);
 const stateAfterDepartmentEdit=(await req('/state')).data;assert.equal(stateAfterDepartmentEdit.departments.find(d=>d.id===b).name,'اختبار ب معدل');
 const autoVisits=(await req('/patients/'+auto.data.id+'/visits')).data;assert.equal(autoVisits[0].department_name,'اختبار ب معدل');
 const race=await Promise.all([req('/patients',{...input,medical_number:'RACE1',national_id:'',department_id:b,bed:'4'}),req('/patients',{...input,medical_number:'RACE2',national_id:'',department_id:b,bed:'4'})]);assert.equal(race.filter(r=>r.status===201).length,1);
 const phonetic=await req('/patients',{...input,name:'محب أحمد علي محمد',english:'',medical_number:'PHONETIC',national_id:'',department_id:b,bed:'5'});assert.equal(phonetic.status,201);assert.equal(phonetic.data.english,'Moheb Ahmed Ali');
 assert.equal((await req('/patients/'+phonetic.data.id+'/discharge',{note:'اختبار الحذف المؤقت'})).status,200);
 const recordSearch=await req('/records?query=PHONETIC&limit=30&offset=0');assert.equal(recordSearch.status,200);assert.equal(recordSearch.data.records.length,1);assert.equal(recordSearch.data.records[0].status,'discharged');assert.equal(recordSearch.data.records[0].medical_number,'PHONETIC');
 const recordPage=await req('/records?limit=2&offset=0');assert.equal(recordPage.status,200);assert.equal(recordPage.data.records.length,2);assert.equal(recordPage.data.has_more,true);assert.ok(recordPage.data.total>=4);
 assert.equal((await req('/patients/'+phonetic.data.id+'/delete',{})).status,200);
 assert.equal((await req('/state')).data.patients.some(p=>p.id===phonetic.data.id),false);
 let archive=(await req('/admin/archive')).data;assert.equal(archive.patients.some(p=>p.id===phonetic.data.id),true);
 assert.equal((await req('/admin/patients/'+phonetic.data.id+'/restore',{})).status,200);
 const c=(await req('/departments',{name:'قسم للحذف',capacity:2})).data.id;assert.equal((await req('/departments/'+c+'/delete',{})).status,200);archive=(await req('/admin/archive')).data;assert.equal(archive.departments.some(d=>d.id===c),true);assert.equal((await req('/admin/departments/'+c+'/restore',{})).status,200);
 const createdUser=await req('/admin/users',{name:'مستخدم اختبار',username:'staff_test',password:'StaffPass123',role:'user'});assert.equal(createdUser.status,201);
 const normalReq=makeRequester();assert.equal((await normalReq('/auth/login',{username:'staff_test',password:'StaffPass123'})).status,200);assert.equal((await normalReq('/admin/audit')).status,403);assert.equal((await normalReq('/records?query=CUSTOM-009&limit=30&offset=0')).status,200);assert.equal((await normalReq('/departments',{name:'قسم غير مسموح',capacity:3})).status,403);assert.equal((await normalReq('/departments/'+a+'/edit',{name:'تعديل غير مسموح',capacity:2})).status,403);assert.ok((await normalReq('/state')).data.departments.length>0);
 const logs=(await req('/admin/audit')).data;assert.ok(logs.some(log=>log.action==='patient.edit'&&log.username==='admin_test'));assert.ok(logs.some(log=>log.action==='patient.delete'));
 const auditPage=(await req('/admin/audit?limit=2&offset=0')).data;assert.equal(auditPage.logs.length,2);assert.equal(auditPage.has_more,true);assert.ok(auditPage.total>2);
 assert.equal((await req('/admin/users/'+createdUser.data.user.id+'/status',{active:false})).status,200);assert.equal((await normalReq('/state')).status,401);
 const other=await openDatabase(name);try{const saved=await other.db.collection('patients').findOne({_id:id});assert.equal(saved.visits.length,2);assert.equal(saved.medical_number,'CUSTOM-009');assert.equal(saved.events.length,5);}finally{await other.close();}
 }finally{await new Promise(r=>server.close(r));if(!name.startsWith('badr_his_test_'))throw Error('Unsafe test database');await db.dropDatabase();await connection.close();}
});
