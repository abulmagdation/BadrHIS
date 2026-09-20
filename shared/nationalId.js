export const normalizeNationalId=value=>String(value||'').trim().replace(/[٠-٩۰-۹]/g,character=>String(character.charCodeAt(0)-(character<='٩'?1632:1776)));

export function birthDateFromNationalId(value){
 const nationalId=normalizeNationalId(value);if(!/^\d{14}$/.test(nationalId)||!['2','3'].includes(nationalId[0]))return '';
 const year=(nationalId[0]==='2'?'19':'20')+nationalId.slice(1,3),month=nationalId.slice(3,5),day=nationalId.slice(5,7),date=`${year}-${month}-${day}`,parsed=new Date(date+'T00:00:00Z');
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date&&parsed<=new Date()?date:'';
}
