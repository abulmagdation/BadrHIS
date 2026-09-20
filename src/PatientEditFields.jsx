import React,{useState} from 'react';
import {transliterateArabicName} from '../shared/transliterate.js';
import {birthDateFromNationalId} from '../shared/nationalId.js';

export default function PatientEditFields({patient}){
 const [name,setName]=useState(patient.name||''),[english,setEnglish]=useState(patient.english||transliterateArabicName(patient.name)),[englishEdited,setEnglishEdited]=useState(false);
 const [nationalId,setNationalId]=useState(patient.national_id||''),[dob,setDob]=useState(patient.dob||''),[dobEdited,setDobEdited]=useState(false),automaticDob=birthDateFromNationalId(nationalId);
 function changeName(value){setName(value);if(!englishEdited)setEnglish(transliterateArabicName(value));}
 function changeNationalId(value){setNationalId(value);const generated=birthDateFromNationalId(value);if(generated&&!dobEdited)setDob(generated);}
 return <>
  <label>الرقم الطبي<input name="medical_number" required maxLength={16} dir="ltr" defaultValue={patient.medical_number}/></label>
  <label>الرقم القومي (اختياري)<input name="national_id" inputMode="numeric" dir="ltr" maxLength={14} minLength={14} pattern="[0-9٠-٩۰-۹]{14}" value={nationalId} onChange={e=>changeNationalId(e.target.value)}/></label>
  <label>اسم المريض بالعربية<input name="name" required maxLength={120} value={name} onChange={e=>changeName(e.target.value)}/></label>
  <label>اسم المريض بالإنجليزية<input name="english" maxLength={120} dir="ltr" value={english} onChange={e=>{setEnglish(e.target.value);setEnglishEdited(true);}}/><small className="field-hint">كتابة صوتية لأول 3 أسماء، ويمكن تعديلها يدويًا.</small></label>
  <div className="form-grid"><label>تاريخ الميلاد<input name="dob" type="date" required min="1900-01-01" max={new Date().toLocaleDateString('en-CA')} value={dob} onChange={e=>{setDob(e.target.value);setDobEdited(true);}}/>{automaticDob&&<small className="field-hint">التاريخ المستخرج من الرقم القومي: {automaticDob}{dob!==automaticDob&&<button type="button" onClick={()=>{setDob(automaticDob);setDobEdited(false);}}>استخدامه</button>}</small>}</label><label>النوع<select name="gender" required defaultValue={patient.gender}><option value="male">ذكر</option><option value="female">أنثى</option></select></label></div>
  <label>رقم الهاتف (اختياري)<input name="phone" type="tel" maxLength={30} defaultValue={patient.phone||''}/></label>
  <div className="inline-info">لتغيير القسم أو السرير استخدم زر «نقل المريض» حتى تُسجل الحركة في الملف.</div>
 </>;
}
