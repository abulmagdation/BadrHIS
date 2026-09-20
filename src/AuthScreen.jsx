import React,{useState} from 'react';
import {HeartPulse,LogIn,ShieldCheck} from 'lucide-react';

export default function AuthScreen({needsSetup,setupTokenRequired=false,onAuthenticated}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event){
  event.preventDefault();setBusy(true);setError('');
  try{const body=Object.fromEntries(new FormData(event.currentTarget)),response=await fetch('/api/auth/'+(needsSetup?'setup':'login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw Error(data.error);onAuthenticated(data.user);}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><span className="brand-icon"><HeartPulse size={30}/></span><div><strong>بدر</strong><small>نظام إدارة المستشفى</small></div></div><div className="auth-icon">{needsSetup?<ShieldCheck/>:<LogIn/>}</div><h1>{needsSetup?'إنشاء حساب المدير الأول':'تسجيل الدخول'}</h1><p>{needsSetup?'أنشئ الحساب الرئيسي الذي سيدير المستخدمين وسجل النشاط.':'أدخل بيانات حسابك للوصول إلى نظام المستشفى.'}</p>{error&&<div className="auth-error" role="alert">{error}</div>}<form onSubmit={submit}>{needsSetup&&setupTokenRequired&&<label>رمز تهيئة النظام<input name="setup_token" type="password" required autoComplete="off" dir="ltr"/><small className="field-hint">أدخل رمز التهيئة الذي حددته عند نشر النظام.</small></label>}{needsSetup&&<label>الاسم بالكامل<input name="name" required maxLength={80} autoFocus placeholder="اسم مدير النظام"/></label>}<label>اسم المستخدم<input name="username" required minLength={3} maxLength={40} autoComplete="username" autoFocus={!needsSetup} dir="ltr" placeholder="username"/></label><label>كلمة المرور<input name="password" type="password" required minLength={8} maxLength={128} autoComplete={needsSetup?'new-password':'current-password'} dir="ltr" placeholder="8 أحرف على الأقل"/></label><button className="primary" disabled={busy}>{busy?'جارٍ المتابعة...':needsSetup?'إنشاء حساب المدير':'دخول'}</button></form></section></main>;
}
