import React,{useEffect,useState} from 'react';
import {transliterateArabicName} from '../shared/transliterate.js';
import {birthDateFromNationalId} from '../shared/nationalId.js';
const normalize=v=>v.trim().replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?1632:1776))).toUpperCase();
export default function AdmissionFields({onBlocked}){
 const [number,setNumber]=useState(''),[nationalId,setNationalId]=useState(''),[found,setFound]=useState(null),[nationalMatch,setNationalMatch]=useState(null);
 const [state,setState]=useState('auto'),[nationalState,setNationalState]=useState('idle'),[error,setError]=useState('');
 const [arabicName,setArabicName]=useState(''),[englishName,setEnglishName]=useState(''),[englishEdited,setEnglishEdited]=useState(false);
 const [dob,setDob]=useState(''),[dobEdited,setDobEdited]=useState(false),automaticDob=birthDateFromNationalId(nationalId);
 useEffect(()=>{let cancelled=false;const medical=normalize(number);setError('');
  if(!medical){setState('auto');if(found)setFound(null);return;}
  if(found&&medical===found.medical_number){setState('found');return;}
  setState('loading');setFound(null);
  const timer=setTimeout(async()=>{try{if(!/^[A-Z0-9-]{1,16}$/.test(medical))throw Error('اكتب حتى 16 حرفًا إنجليزيًا أو رقمًا أو شرطة.');const r=await fetch('/api/patients/lookup?medical_number='+encodeURIComponent(medical));if(!r.ok)throw Error('تعذر البحث عن الرقم الطبي. حاول مرة أخرى.');const data=await r.json();if(cancelled)return;setFound(data.patient);if(data.patient){if(data.patient.national_id)setNationalId(data.patient.national_id);setArabicName(data.patient.name||'');setEnglishName(data.patient.english||transliterateArabicName(data.patient.name));setEnglishEdited(false);setDob(data.patient.dob||'');setDobEdited(false);}setState(data.patient?'found':'new');}catch(e){if(!cancelled){setState('error');setError(e.message);}}},300);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[number]);
 useEffect(()=>{let cancelled=false;const national=normalize(nationalId);setNationalMatch(null);
  if(!national){setNationalState('idle');return;}
  if(found?.national_id===national){setNationalState('chosen');return;}
  if(!/^\d{14}$/.test(national)){setNationalState('typing');return;}
  setNationalState('loading');
  const timer=setTimeout(async()=>{try{const r=await fetch('/api/patients/lookup?national_id='+encodeURIComponent(national));if(!r.ok)throw Error('تعذر البحث عن الرقم القومي. حاول مرة أخرى.');const data=await r.json();if(cancelled)return;setNationalMatch(data.patient);setNationalState(data.patient?'match':'new');}catch(e){if(!cancelled){setNationalState('error');setError(e.message);}}},300);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[nationalId,found]);
 useEffect(()=>{onBlocked(state==='loading'||state==='error'||nationalState==='loading'||nationalState==='error'||!!nationalMatch||found?.status==='active');},[state,nationalState,nationalMatch,found,onBlocked]);
 function choose(patient){setFound(patient);setNationalMatch(null);setNumber(patient.medical_number);setNationalId(patient.national_id||'');setArabicName(patient.name||'');setEnglishName(patient.english||transliterateArabicName(patient.name));setEnglishEdited(false);setDob(patient.dob||'');setDobEdited(false);setState('found');setNationalState('chosen');setError('');}
 function changeMedical(value){onBlocked(!!value.trim());if(found){setFound(null);setNationalId('');setArabicName('');setEnglishName('');setEnglishEdited(false);setDob('');setDobEdited(false);}setNumber(value);}
 function changeNationalId(value){setNationalId(value);const generated=birthDateFromNationalId(value);if(generated&&!dobEdited)setDob(generated);}
 function changeArabicName(value){setArabicName(value);if(!englishEdited)setEnglishName(transliterateArabicName(value));}
 return <><label>الرقم الطبي (اتركه فارغًا للتوليد التلقائي)<input name="medical_number" dir="ltr" maxLength={16} value={number} onChange={e=>changeMedical(e.target.value)} placeholder="BADR00001" autoComplete="off"/></label>
 <div className={'lookup-info '+(found?.status==='active'||state==='error'?'lookup-error':'')} role="status">{state==='auto'?'سيتم إنشاء رقم طبي جديد تلقائيًا عند الحفظ.':state==='loading'?'جارٍ البحث عن الرقم الطبي...':state==='new'?'رقم جديد — أكمل البيانات لإنشاء ملف بهذا الرقم.':state==='error'?error:found?.status==='active'?'هذا المريض مقيم بالفعل. استخدم إجراء النقل من سجل المرضى.':`إعادة دخول: ${found?.name} — سيتم حفظ زيارة جديدة بنفس الرقم الطبي، مع الاحتفاظ بالزيارات السابقة.`}</div>
 <input type="hidden" name="existing_patient_id" value={found?.id??''}/>
 <div className="identity-fields" key={found?.id??'new'}>
 <label>الرقم القومي (اختياري)<input name="national_id" inputMode="numeric" dir="ltr" maxLength={14} minLength={14} pattern="[0-9٠-٩۰-۹]{14}" value={nationalId} onChange={e=>changeNationalId(e.target.value)} readOnly={!!found?.national_id} placeholder="14 رقمًا" autoComplete="off"/></label>
 {nationalState==='loading'&&<div className="national-lookup" role="status">جارٍ البحث بالرقم القومي...</div>}
 {nationalState==='new'&&<div className="national-lookup new" role="status">الرقم القومي غير مسجل لمريض سابق. أكمل البيانات لإنشاء ملف جديد.</div>}
 {nationalState==='error'&&<div className="national-lookup lookup-error" role="alert">{error}</div>}
 {nationalMatch&&<div className={'national-match '+(nationalMatch.status==='active'?'active':'')} role="status"><div><b>تم العثور على المريض: {nationalMatch.name}</b><span dir="ltr">{nationalMatch.medical_number}</span><small>{nationalMatch.status==='active'?'مقيم حاليًا في المستشفى':'خرج سابقًا ويمكن إعادة دخوله'}</small></div><button type="button" onClick={()=>choose(nationalMatch)}>اختيار هذا المريض</button></div>}
 <label>اسم المريض بالعربية<input name="name" required maxLength={120} value={arabicName} onChange={e=>changeArabicName(e.target.value)} readOnly={!!found} placeholder="الاسم بالكامل"/></label>
 <label>اسم المريض بالإنجليزية<input name="english" maxLength={120} dir="ltr" value={englishName} onChange={e=>{setEnglishName(e.target.value);setEnglishEdited(true);}} readOnly={!!found}/><small className="field-hint">يتولد ككتابة صوتية لأول 3 أسماء، ويمكن تعديله يدويًا.</small></label>
 <div className="form-grid"><label>تاريخ الميلاد<input name="dob" type="date" required min="1900-01-01" max={new Date().toLocaleDateString('en-CA')} value={dob} onChange={e=>{setDob(e.target.value);setDobEdited(true);}} readOnly={!!found}/>{!found&&automaticDob&&<small className="field-hint">تم استخراجه من الرقم القومي.{dob!==automaticDob&&<button type="button" onClick={()=>{setDob(automaticDob);setDobEdited(false);}}>استخدام التاريخ المستخرج</button>}</small>}</label><label>النوع<select name="gender" required defaultValue={found?.gender||''} disabled={!!found}><option value="">اختر النوع</option><option value="male">ذكر</option><option value="female">أنثى</option></select></label></div>
 <label>رقم الهاتف (اختياري)<input name="phone" type="tel" maxLength={30} defaultValue={found?.phone||''} readOnly={!!found}/></label>
 </div></>;
}
