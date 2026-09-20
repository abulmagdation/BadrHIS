import express from 'express';
import {randomUUID} from 'node:crypto';
import {readConfig,originAllowed} from './config.js';
import {nextId,publicPatient} from './db.js';
import {transliterateArabicName} from '../shared/transliterate.js';
import {birthDateFromNationalId} from '../shared/nationalId.js';
import {SESSION_COOKIE,activeQuery,cleanText,createSession,expireSessionCookie,hashPassword,hashToken,publicUser,readCookie,usernameKey,validatePassword,validateUsername,verifyPassword} from './auth.js';
export function createApp(db,config=readConfig()){
 const app=express(),patients=db.collection('patients'),departments=db.collection('departments'),users=db.collection('users'),sessions=db.collection('sessions'),auditLogs=db.collection('audit_logs');
 app.disable('x-powered-by');
 app.locals.secureCookies=config.production;
 app.get('/healthz',(req,res)=>res.json({status:'ok'}));
 app.use(express.json({limit:'32kb'}));
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');if(!originAllowed(req.headers.origin,req.get('host'),config))return res.status(403).json({error:'مصدر الطلب غير مسموح'});next();});
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
 const str=(v,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';
 const digits=v=>str(v).replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?1632:1776)));
 const medical=v=>digits(v).toUpperCase(),now=()=>new Date().toISOString();
 const patient=async id=>await patients.findOne({_id:Number(id)||0,...activeQuery})||fail('المريض غير موجود',404);
 // Patient, visit and event updates are a single atomic write, including on standalone MongoDB.
 // Unique active department slots enforce capacity even if another server competes for a place.
 let queue=Promise.resolve();const write=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 const event=(type,description,visit_id)=>({id:randomUUID(),type,description,visit_id,created_at:now()});
 const audit=(user,action,entity_type,entity_id,description,details={})=>auditLogs.insertOne({_id:randomUUID(),user_id:user._id,username:user.username,user_name:user.name,role:user.role,action,entity_type,entity_id,description,details,created_at:now()});
 async function sessionUser(req){const token=readCookie(req,SESSION_COOKIE);if(!token)return null;const session=await sessions.findOne({_id:hashToken(token),revoked_at:null,expires_at:{$gt:new Date()}});if(!session)return null;return await users.findOne({_id:session.user_id,...activeQuery});}
 const requireAdmin=(req,res,next)=>req.user.role==='admin'?next():res.status(403).json({error:'هذه الصفحة متاحة للمدير فقط'});
 async function nextMedicalNumber(){
  const existing=patients.find({medical_number:{$type:'string'}},{projection:{medical_number:1}});let maximum=0n;
  for await(const p of existing){const match=p.medical_number.match(/^(?:BADR)?(\d+)$/);if(match){const value=BigInt(match[1]);if(value>maximum)maximum=value;}}
  const next=String(maximum+1n).padStart(5,'0');if(next.length>12)fail('تعذر إنشاء رقم طبي جديد: تم الوصول للحد الأقصى');
  return 'BADR'+next;
 }
 async function place(id,bed,excluding=0){
  const d=await departments.findOne({_id:Number(id)||0,...activeQuery});if(!d)fail('اختر قسمًا صحيحًا');
  const occupied=await patients.find({department_id:d._id,status:'active',deleted_at:null,_id:{$ne:excluding}},{projection:{slot:1,bed:1}}).toArray();
  if(occupied.length>=d.capacity)fail('القسم مكتمل العدد');if(bed&&occupied.some(p=>p.bed===bed))fail('هذا السرير مشغول بالفعل');
  const slots=new Set(occupied.map(p=>p.slot));let slot=1;while(slots.has(slot))slot++;if(slot>d.capacity)fail('القسم مكتمل العدد');return {d,slot};
 }
 app.get('/api/auth/status',async(req,res)=>{const needsSetup=await users.countDocuments({})===0,user=needsSetup?null:await sessionUser(req);res.json({needsSetup,setupTokenRequired:needsSetup&&!!config.setupToken,user:publicUser(user)});});
 app.post('/api/auth/setup',async(req,res)=>res.status(201).json(await write(async()=>{
  if(await users.countDocuments({})>0)fail('تم إنشاء حساب المدير بالفعل',409);
  if(config.setupToken&&hashToken(String(req.body.setup_token||''))!==hashToken(config.setupToken))fail('رمز تهيئة النظام غير صحيح',403);
  const name=cleanText(req.body.name,80),username=cleanText(req.body.username,40),password=req.body.password;
  if(!name)fail('اسم المدير مطلوب');if(!validateUsername(username))fail('اسم المستخدم من 3 إلى 40 حرفًا أو رقمًا');if(!validatePassword(password))fail('كلمة المرور يجب ألا تقل عن 8 أحرف');
  await db.collection('counters').updateOne({_id:'users'},{$max:{value:1}},{upsert:true});
  const user={_id:1,name,username,username_key:usernameKey(username),role:'admin',password_hash:await hashPassword(password),created_at:now(),created_by:null,deleted_at:null,deleted_by:null};
  await users.insertOne(user);await createSession(db,user,req,res);await audit(user,'setup','user',user._id,'إنشاء حساب المدير الأول');return {user:publicUser(user)};
 })));
 app.post('/api/auth/login',async(req,res)=>{
  const key=usernameKey(req.body.username),user=key?await users.findOne({username_key:key,...activeQuery}):null;
  if(!user||!await verifyPassword(req.body.password,user.password_hash))fail('اسم المستخدم أو كلمة المرور غير صحيحة',401);
  await createSession(db,user,req,res);await audit(user,'login','session',null,'تسجيل الدخول إلى النظام');res.json({user:publicUser(user)});
 });
 app.post('/api/auth/logout',async(req,res)=>{const token=readCookie(req,SESSION_COOKIE),user=await sessionUser(req);if(token)await sessions.updateOne({_id:hashToken(token)},{$set:{revoked_at:new Date()}});expireSessionCookie(res);if(user)await audit(user,'logout','session',null,'تسجيل الخروج من النظام');res.json({ok:true});});
 app.use('/api',async(req,res,next)=>{const user=await sessionUser(req);if(!user)return res.status(401).json({error:'سجّل الدخول للمتابعة'});req.user=user;next();});

 app.get('/api/admin/users',requireAdmin,async(req,res)=>{const rows=await users.find({},{projection:{password_hash:0,username_key:0}}).sort({_id:1}).toArray();res.json(rows.map(publicUser));});
 app.post('/api/admin/users',requireAdmin,async(req,res)=>res.status(201).json(await write(async()=>{
  const name=cleanText(req.body.name,80),username=cleanText(req.body.username,40),password=req.body.password,role=cleanText(req.body.role,10);
  if(!name)fail('اسم المستخدم مطلوب');if(!validateUsername(username))fail('اسم الدخول من 3 إلى 40 حرفًا أو رقمًا');if(!validatePassword(password))fail('كلمة المرور يجب ألا تقل عن 8 أحرف');if(!['admin','user'].includes(role))fail('اختر صلاحية صحيحة');
  const user={_id:await nextId(db,'users'),name,username,username_key:usernameKey(username),role,password_hash:await hashPassword(password),created_at:now(),created_by:req.user._id,deleted_at:null,deleted_by:null};
  await users.insertOne(user);await audit(req.user,'user.create','user',user._id,`إضافة المستخدم ${user.name} بصلاحية ${role==='admin'?'مدير':'مستخدم'}`,{username:user.username,role});return {user:publicUser(user)};
 })));
 app.post('/api/admin/users/:id/status',requireAdmin,async(req,res)=>res.json(await write(async()=>{
  const id=Number(req.params.id)||0,target=await users.findOne({_id:id});if(!target)fail('المستخدم غير موجود',404);const active=req.body.active===true;
  if(!active&&target._id===req.user._id)fail('لا يمكنك تعطيل حسابك الحالي',409);
  if(!active&&target.role==='admin'&&await users.countDocuments({role:'admin',...activeQuery})<=1)fail('يجب أن يظل مدير واحد على الأقل فعالًا',409);
  if(active){await users.updateOne({_id:id},{$set:{deleted_at:null,deleted_by:null,updated_at:now()}});}else{await users.updateOne({_id:id},{$set:{deleted_at:now(),deleted_by:req.user._id,updated_at:now()}});await sessions.updateMany({user_id:id,revoked_at:null},{$set:{revoked_at:new Date()}});}
  await audit(req.user,active?'user.restore':'user.delete','user',id,`${active?'إعادة تفعيل':'تعطيل'} المستخدم ${target.name}`,{username:target.username});return {ok:true};
 })));
 app.get('/api/admin/audit',requireAdmin,async(req,res)=>{const limit=Math.min(100,Math.max(1,Number(req.query.limit)||200)),hasOffset=Object.hasOwn(req.query,'offset'),offset=Math.max(0,Number(req.query.offset)||0),rows=await auditLogs.find().sort({created_at:-1}).skip(offset).limit(limit+1).toArray(),has_more=rows.length>limit,entries=rows.slice(0,limit).map(({_id,...row})=>({...row,id:_id}));if(!hasOffset)return res.json(entries);res.json({logs:entries,has_more,next_offset:offset+entries.length,total:await auditLogs.countDocuments()});});

 app.get('/api/state',async(req,res)=>{const dailyCutoff=new Date(Date.now()-86400000).toISOString(),[ds,ps]=await Promise.all([departments.find(activeQuery).sort({_id:1}).toArray(),patients.find({...activeQuery,$or:[{status:'active'},{status:'discharged',discharged_at:{$gte:dailyCutoff}}]},{projection:{events:0,slot:0}}).sort({_id:-1}).toArray()]);res.json({departments:ds.map(({_id,...d})=>({...d,id:_id})),patients:ps.map(publicPatient)});});
 app.get('/api/records',async(req,res)=>{
  const limit=Math.min(60,Math.max(1,Number(req.query.limit)||30)),offset=Math.max(0,Number(req.query.offset)||0),raw=str(req.query.query,32),normalizedMedical=medical(raw),normalizedDigits=digits(raw),escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const filter={...activeQuery};
  if(raw){const choices=[];if(normalizedMedical)choices.push({medical_number:{$regex:'^'+escape(normalizedMedical)}});if(normalizedDigits)choices.push({national_id:{$regex:'^'+escape(normalizedDigits)}});filter.$or=choices;}
  const [rows,total]=await Promise.all([patients.find(filter,{projection:{events:0,slot:0}}).sort({admitted_at:-1,_id:-1}).skip(offset).limit(limit+1).toArray(),patients.countDocuments(filter)]),has_more=rows.length>limit;
  const records=rows.slice(0,limit).map(p=>({...publicPatient(p),last_department_name:p.visits?.at(-1)?.department_name||''}));
  res.json({records,has_more,next_offset:offset+records.length,total});
 });
 app.get('/api/patients/lookup',async(req,res)=>{
  const number=medical(req.query.medical_number),national_id=digits(req.query.national_id);
  if(national_id&&!/^\d{14}$/.test(national_id))fail('الرقم القومي يجب أن يتكون من 14 رقمًا');
  const query=number?{medical_number:number}:national_id?{national_id}:null;
  res.json({patient:query?publicPatient(await patients.findOne({...query,...activeQuery})):null});
 });
 app.post('/api/departments',requireAdmin,async(req,res)=>res.status(201).json(await write(async()=>{
  const name=str(req.body.name,60),english=str(req.body.english,60),capacity=Number(req.body.capacity);if(!name||!Number.isInteger(capacity)||capacity<1||capacity>10000)fail('أدخل اسم القسم وعدد أسرّة صحيحًا');if(await departments.findOne({name}))fail('اسم القسم موجود بالفعل');
  const id=await nextId(db,'departments');await departments.insertOne({_id:id,name,english,capacity,created_at:now(),created_by:req.user._id,deleted_at:null,deleted_by:null});await audit(req.user,'department.create','department',id,`إضافة القسم ${name}`,{capacity});return {id};
 })));
 app.post('/api/departments/:id/edit',requireAdmin,async(req,res)=>res.json(await write(async()=>{
  const id=Number(req.params.id)||0,current=await departments.findOne({_id:id});if(!current)fail('القسم غير موجود',404);
  const name=str(req.body.name,60),english=str(req.body.english,60),capacity=Number(req.body.capacity);
  if(!name||!Number.isInteger(capacity)||capacity<1||capacity>10000)fail('أدخل اسم القسم وعدد أسرّة صحيحًا');
  if(await departments.findOne({name,_id:{$ne:id}}))fail('اسم القسم موجود بالفعل',409);
  const occupied=await patients.countDocuments({department_id:id,status:'active',deleted_at:null});
  if(capacity<occupied)fail(`لا يمكن تقليل السعة إلى ${capacity}؛ يوجد ${occupied} مريضًا مقيمًا في القسم`,409);
  if(current.name===name&&current.english===english&&current.capacity===capacity)fail('لم يتم تغيير أي بيانات');
  if(current.name!==name)await patients.updateMany(
   {department_id:id,status:'active'},
   {$set:{'visits.$[visit].department_name':name}},
   {arrayFilters:[{'visit.department_id':id,'visit.discharged_at':null}]}
  );
  const updated=await departments.findOneAndUpdate({_id:id},{$set:{name,english,capacity,updated_at:now()}},{returnDocument:'after'});
  await audit(req.user,'department.edit','department',id,`تعديل بيانات القسم ${current.name}`,{before:{name:current.name,english:current.english,capacity:current.capacity},after:{name,english,capacity}});const {_id,...result}=updated;return {...result,id:_id,occupied};
 })));
 app.post('/api/departments/:id/delete',requireAdmin,async(req,res)=>res.json(await write(async()=>{
  const id=Number(req.params.id)||0,target=await departments.findOne({_id:id,...activeQuery});if(!target)fail('القسم غير موجود',404);const occupied=await patients.countDocuments({department_id:id,status:'active',deleted_at:null});if(occupied)fail('لا يمكن حذف قسم يحتوي على مرضى مقيمين',409);
  await departments.updateOne({_id:id},{$set:{deleted_at:now(),deleted_by:req.user._id,updated_at:now()}});await audit(req.user,'department.delete','department',id,`حذف القسم ${target.name} حذفًا مؤقتًا`);return {ok:true};
 })));
 app.post('/api/patients',async(req,res)=>res.status(201).json(await write(async()=>{
  const b=req.body,number=medical(b.medical_number),bed=str(b.bed,20);if(number&&!/^[A-Z0-9-]{1,16}$/.test(number))fail('الرقم الطبي: من 1 إلى 16 حرفًا إنجليزيًا أو رقمًا أو شرطة');
  const existing=number?await patients.findOne({medical_number:number}):null;
  if(existing?.status==='active')fail('المريض بهذا الرقم الطبي مقيم بالفعل. استخدم النقل لتغيير القسم.',409);
  if(existing&&b.existing_patient_id!==String(existing._id))fail('الرقم الطبي يخص مريضًا مسجلًا. راجع بياناته قبل تأكيد إعادة الدخول.',409);
  if(!existing&&b.existing_patient_id)fail('تغيّر الرقم الطبي. ابحث عنه مرة أخرى قبل الحفظ.',409);
  let national_id=digits(b.national_id);if(national_id&&!/^\d{14}$/.test(national_id))fail('الرقم القومي يجب أن يتكون من 14 رقمًا');
  if(existing?.national_id&&national_id&&national_id!==existing.national_id)fail('الرقم القومي لا يطابق ملف المريض');national_id=existing?.national_id||national_id;
  if(national_id&&await patients.findOne({national_id,_id:{$ne:existing?._id??0}}))fail('الرقم القومي مسجل برقم طبي آخر. استخدم البحث للوصول للملف الموجود.',409);
  const name=existing?.name||str(b.name),english=existing?.english||str(b.english)||transliterateArabicName(name),dob=existing?.dob||str(b.dob,10)||birthDateFromNationalId(national_id),gender=existing?.gender||str(b.gender);
  if(!name)fail('اسم المريض مطلوب');const parsed=new Date(dob+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dob)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==dob||dob<'1900-01-01'||parsed>Date.now())fail('تاريخ الميلاد غير صحيح');if(!['male','female'].includes(gender))fail('حدد النوع');
  const {d,slot}=await place(b.department_id,bed),time=now(),visit_id=randomUUID();
  const visit={id:visit_id,admitted_at:time,discharged_at:null,department_id:d._id,department_name:d.name,bed,notes:str(b.notes,1000)};
  const current={name,english,dob,gender,national_id,phone:existing?.phone??str(b.phone,30),department_id:d._id,slot,bed,notes:visit.notes,status:'active',admitted_at:time,discharged_at:null,current_visit_id:visit_id};
  const ev=event(existing?'readmit':'admit',`${existing?'إعادة دخول':'دخول وتسكين'} في ${d.name}${bed?' • سرير '+bed:''}`,visit_id);
  if(existing){if(existing.deleted_at)fail('هذا الملف محذوف مؤقتًا. اطلب من المدير استعادته أولًا.',409);const p=await patients.findOneAndUpdate({_id:existing._id,status:'discharged',deleted_at:null},{$set:current,$push:{visits:visit,events:ev}},{returnDocument:'after'});if(!p)fail('تم تغيير حالة المريض. حدّث الصفحة وحاول مرة أخرى.',409);await audit(req.user,'patient.readmit','patient',p._id,`إعادة دخول المريض ${p.name}`,{medical_number:p.medical_number,department:d.name});return publicPatient(p);}
  const generated=number||await nextMedicalNumber();
  const p={_id:await nextId(db,'patients'),medical_number:generated,...current,visits:[visit],events:[ev],created_at:time,created_by:req.user._id,deleted_at:null,deleted_by:null};await patients.insertOne(p);await audit(req.user,'patient.create','patient',p._id,`إضافة المريض ${p.name}`,{medical_number:p.medical_number,department:d.name});return publicPatient(p);
 })));
 app.post('/api/patients/:id/edit',async(req,res)=>res.json(await write(async()=>{
  const p=await patient(req.params.id),b=req.body,number=medical(b.medical_number),national_id=digits(b.national_id),name=str(b.name),english=str(b.english)||transliterateArabicName(name),dob=str(b.dob,10)||birthDateFromNationalId(national_id),gender=str(b.gender),phone=str(b.phone,30);
  if(!/^[A-Z0-9-]{1,16}$/.test(number))fail('الرقم الطبي: من 1 إلى 16 حرفًا إنجليزيًا أو رقمًا أو شرطة');
  if(national_id&&!/^\d{14}$/.test(national_id))fail('الرقم القومي يجب أن يتكون من 14 رقمًا');
  if(!name)fail('اسم المريض مطلوب');const parsed=new Date(dob+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dob)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==dob||dob<'1900-01-01'||parsed>Date.now())fail('تاريخ الميلاد غير صحيح');
  if(!['male','female'].includes(gender))fail('حدد النوع');
  if(await patients.findOne({medical_number:number,_id:{$ne:p._id}}))fail('الرقم الطبي مسجل لمريض آخر',409);
  if(national_id&&await patients.findOne({national_id,_id:{$ne:p._id}}))fail('الرقم القومي مسجل لمريض آخر',409);
  const labels={medical_number:'الرقم الطبي',national_id:'الرقم القومي',name:'الاسم العربي',english:'الاسم الإنجليزي',dob:'تاريخ الميلاد',gender:'النوع',phone:'الهاتف'};
  const values={medical_number:number,national_id,name,english,dob,gender,phone};
  const changed=Object.keys(values).filter(key=>(p[key]??'')!==values[key]);if(!changed.length)fail('لم يتم تغيير أي بيانات');
  const updated=await patients.findOneAndUpdate({_id:p._id},{$set:values,$push:{events:event('edit',`تعديل بيانات المريض: ${changed.map(key=>labels[key]).join('، ')}`,p.current_visit_id)}},{returnDocument:'after'});
  await audit(req.user,'patient.edit','patient',p._id,`تعديل بيانات المريض ${p.name}: ${changed.map(key=>labels[key]).join('، ')}`,{medical_number:updated.medical_number,fields:changed});return publicPatient(updated);
 })));
 app.get('/api/patients/:id/events',async(req,res)=>res.json([...(await patient(req.params.id)).events].reverse()));
 app.get('/api/patients/:id/visits',async(req,res)=>res.json([...(await patient(req.params.id)).visits].reverse()));
 app.post('/api/patients/:id/transfer',async(req,res)=>res.json(await write(async()=>{
  const p=await patient(req.params.id);if(p.status!=='active')fail('لا يمكن نقل مريض تم تسجيل خروجه');const bed=str(req.body.bed,20),{d,slot}=await place(req.body.department_id,bed,p._id);if(d._id===p.department_id&&bed===p.bed)fail('اختر قسمًا أو سريرًا مختلفًا');const from=await departments.findOne({_id:p.department_id});
  const updated=await patients.findOneAndUpdate({_id:p._id,status:'active',deleted_at:null,current_visit_id:p.current_visit_id,department_id:p.department_id,bed:p.bed},{$set:{department_id:d._id,slot,bed,'visits.$[v].department_id':d._id,'visits.$[v].department_name':d.name,'visits.$[v].bed':bed},$push:{events:event('transfer',`نقل من ${from.name}${p.bed?' • سرير '+p.bed:''} إلى ${d.name}${bed?' • سرير '+bed:''}`,p.current_visit_id)}},{arrayFilters:[{'v.id':p.current_visit_id}],returnDocument:'after'});if(!updated)fail('تغيّرت حالة المريض. حدّث الصفحة.',409);await audit(req.user,'patient.transfer','patient',p._id,`نقل المريض ${p.name} من ${from.name} إلى ${d.name}`,{medical_number:p.medical_number,from_department:from.name,to_department:d.name,bed});return publicPatient(updated);
 })));
 app.post('/api/patients/:id/discharge',async(req,res)=>res.json(await write(async()=>{
  const p=await patient(req.params.id);if(p.status!=='active')fail('تم تسجيل خروج المريض بالفعل');const time=now(),note=str(req.body.note,500);
  const updated=await patients.findOneAndUpdate({_id:p._id,status:'active',current_visit_id:p.current_visit_id,deleted_at:null},{$set:{status:'discharged',discharged_at:time,'visits.$[v].discharged_at':time,'visits.$[v].discharge_note':note},$push:{events:event('discharge','تسجيل خروج المريض'+(note?' • '+note:''),p.current_visit_id)}},{arrayFilters:[{'v.id':p.current_visit_id}],returnDocument:'after'});if(!updated)fail('تم تغيير حالة المريض. حدّث الصفحة.',409);await audit(req.user,'patient.discharge','patient',p._id,`تسجيل خروج المريض ${p.name}`,{medical_number:p.medical_number,note});return publicPatient(updated);
 })));
 app.post('/api/patients/:id/delete',requireAdmin,async(req,res)=>res.json(await write(async()=>{
  const p=await patient(req.params.id);if(p.status==='active')fail('سجّل خروج المريض قبل حذفه',409);await patients.updateOne({_id:p._id,deleted_at:null},{$set:{deleted_at:now(),deleted_by:req.user._id,updated_at:now()}});await audit(req.user,'patient.delete','patient',p._id,`حذف ملف المريض ${p.name} حذفًا مؤقتًا`,{medical_number:p.medical_number});return {ok:true};
 })));
 app.get('/api/admin/archive',requireAdmin,async(req,res)=>{const [ps,ds]=await Promise.all([patients.find({deleted_at:{$ne:null}},{projection:{events:0,visits:0,slot:0}}).sort({deleted_at:-1}).toArray(),departments.find({deleted_at:{$ne:null}}).sort({deleted_at:-1}).toArray()]);res.json({patients:ps.map(publicPatient),departments:ds.map(({_id,...d})=>({...d,id:_id}))});});
 app.post('/api/admin/patients/:id/restore',requireAdmin,async(req,res)=>res.json(await write(async()=>{const id=Number(req.params.id)||0,p=await patients.findOne({_id:id,deleted_at:{$ne:null}});if(!p)fail('الملف المحذوف غير موجود',404);await patients.updateOne({_id:id},{$set:{deleted_at:null,deleted_by:null,updated_at:now()}});await audit(req.user,'patient.restore','patient',id,`استعادة ملف المريض ${p.name}`,{medical_number:p.medical_number});return {ok:true};})));
 app.post('/api/admin/departments/:id/restore',requireAdmin,async(req,res)=>res.json(await write(async()=>{const id=Number(req.params.id)||0,d=await departments.findOne({_id:id,deleted_at:{$ne:null}});if(!d)fail('القسم المحذوف غير موجود',404);await departments.updateOne({_id:id},{$set:{deleted_at:null,deleted_by:null,updated_at:now()}});await audit(req.user,'department.restore','department',id,`استعادة القسم ${d.name}`);return {ok:true};})));
 app.use('/api',(req,res)=>res.status(404).json({error:'الطلب غير موجود'}));
 app.use((err,req,res,next)=>{if(err.code===11000){if(err.keyPattern?.username_key)return res.status(409).json({error:'اسم المستخدم موجود بالفعل'});if(err.keyPattern?.name)return res.status(409).json({error:'اسم القسم موجود بالفعل'});return res.status(409).json({error:'الرقم الطبي أو القومي موجود بالفعل، أو تم حجز السرير للتو. حدّث البيانات وحاول مرة أخرى.'});}res.status(err.status||500).json({error:err.status?err.message:'تعذر الاتصال بقاعدة البيانات أو حفظ البيانات. حاول مرة أخرى.'});});return app;
}
