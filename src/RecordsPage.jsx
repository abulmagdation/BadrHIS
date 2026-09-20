import React,{useEffect,useRef,useState} from 'react';
import {ChevronLeft,FileText,LoaderCircle,Search,UserRound} from 'lucide-react';

async function request(path){const response=await fetch('/api'+path),data=await response.json();if(response.status===401)window.dispatchEvent(new Event('badr-auth-expired'));if(!response.ok)throw Error(data.error);return data;}
const when=value=>value?new Date(value).toLocaleDateString('ar-EG',{day:'numeric',month:'short',year:'numeric'}):'—';

export default function RecordsPage({onOpen}){
 const [query,setQuery]=useState(''),[records,setRecords]=useState([]),[total,setTotal]=useState(0),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(true),[loadingMore,setLoadingMore]=useState(false),[error,setError]=useState('');
 const sentinel=useRef(null),requestNumber=useRef(0),currentQuery=useRef('');
 async function load(reset,value=currentQuery.current){
  if(!reset&&(loading||loadingMore||!hasMore))return;
  const requestId=++requestNumber.current,offset=reset?0:records.length;
  if(reset){setLoading(true);currentQuery.current=value;}else setLoadingMore(true);
  setError('');
  try{
   const data=await request(`/records?limit=30&offset=${offset}&query=${encodeURIComponent(value)}`);
   if(requestId!==requestNumber.current)return;
   setRecords(previous=>reset?data.records:[...previous,...data.records]);setTotal(data.total);setHasMore(data.has_more);
  }catch(e){if(requestId===requestNumber.current)setError(e.message);}finally{if(requestId===requestNumber.current){setLoading(false);setLoadingMore(false);}}
 }
 useEffect(()=>{const timer=setTimeout(()=>load(true,query.trim()),350);return()=>clearTimeout(timer);},[query]);
 useEffect(()=>{const node=sentinel.current;if(!node||!hasMore||loading||loadingMore)return;const observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting)load(false);},{rootMargin:'240px'});observer.observe(node);return()=>observer.disconnect();},[hasMore,loading,loadingMore,records.length]);
 return <section className="records-page">
  <div className="records-search-card">
   <div className="records-search-copy"><span className="records-search-icon"><FileText size={23}/></span><div><h2>ابحث في كل ملفات المرضى</h2><p>النتائج تشمل المرضى المقيمين وكل الحالات التي خرجت من المستشفى.</p></div></div>
   <label className="records-search"><Search size={20}/><input aria-label="البحث في السجلات" value={query} onChange={event=>setQuery(event.target.value)} placeholder="اكتب الرقم الطبي أو الرقم القومي" dir="ltr"/>{query&&<button aria-label="مسح البحث" onClick={()=>setQuery('')}>×</button>}</label>
  </div>
  <div className="records-summary"><span>{query?`نتائج البحث عن ${query}`:'أحدث سجلات المرضى'}</span><b>{total.toLocaleString('ar-EG')} ملف</b></div>
  {error&&<div className="error" role="alert">{error}<button onClick={()=>load(true)}>إعادة المحاولة</button></div>}
  {loading?<div className="records-loading"><LoaderCircle className="spin" size={26}/><span>جارٍ تحميل السجلات...</span></div>:records.length?<div className="records-grid">{records.map(patient=><article className={'record-card '+(patient.status==='discharged'?'record-discharged':'')} key={patient.id}><div className="record-card-head"><span className="record-avatar"><UserRound size={21}/></span><div><h3>{patient.name}</h3><span dir="ltr">{patient.english||'—'}</span></div><span className={'badge '+(patient.status==='active'?'green':'red')}>{patient.status==='active'?'مقيم':'تم الخروج'}</span></div><dl><div><dt>الرقم الطبي</dt><dd dir="ltr">{patient.medical_number}</dd></div><div><dt>الرقم القومي</dt><dd dir="ltr">{patient.national_id||'غير مسجل'}</dd></div><div><dt>آخر قسم</dt><dd>{patient.last_department_name||'غير محدد'}</dd></div><div><dt>{patient.status==='active'?'آخر دخول':'آخر خروج'}</dt><dd>{when(patient.status==='active'?patient.admitted_at:patient.discharged_at)}</dd></div></dl><div className="record-card-foot"><span>{patient.visit_count.toLocaleString('ar-EG')} {patient.visit_count===1?'زيارة':'زيارات'}</span><button onClick={()=>onOpen(patient)}>فتح السجل <ChevronLeft size={16}/></button></div></article>)}</div>:<div className="records-empty"><span><Search size={28}/></span><h3>{query?'لا يوجد مريض بهذا الرقم':'لا توجد سجلات مرضى بعد'}</h3><p>{query?'راجع الرقم الطبي أو القومي وحاول مرة أخرى.':'ستظهر ملفات المرضى هنا بمجرد تسجيل أول حالة.'}</p></div>}
  <div className="records-sentinel" ref={sentinel}>{hasMore?<button className="secondary" onClick={()=>load(false)} disabled={loadingMore}>{loadingMore?<><LoaderCircle className="spin" size={16}/>جارٍ تحميل 30 سجلًا...</>:'تحميل 30 سجلًا إضافيًا'}</button>:records.length>0&&<span>تم عرض كل السجلات</span>}</div>
 </section>;
}
