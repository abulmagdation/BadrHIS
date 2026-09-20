import JsBarcode from 'jsbarcode';

const waitForPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const safeName=value=>String(value||'barcodes').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim()||'barcodes';
const RENDER_SCALE=12.5;

function addText(parent,className,text,dir){
 const element=document.createElement('div');
 if(className)element.className=className;
 if(dir)element.dir=dir;
 element.textContent=text||'';
 parent.appendChild(element);
}

function createLabel(patient,department,JsBarcode){
 const label=document.createElement('div');
 label.className='patient-label';
 addText(label,'label-en',patient.english||'Badr Hospital','ltr');
 addText(label,'label-ar',patient.name);
 addText(label,'',(patient.dob||'').split('-').reverse().join('/'),'ltr');
 addText(label,'label-dept',department?.english||department?.name||'');
 const medicalNumber=patient.medical_number||`BADR${String(patient.id).padStart(5,'0')}`;
 const number=document.createElement('strong');
 number.dir='ltr';
 number.textContent=medicalNumber;
 label.appendChild(number);
 const barcode=document.createElementNS('http://www.w3.org/2000/svg','svg');
 barcode.setAttribute('shape-rendering','crispEdges');
 JsBarcode(barcode,medicalNumber,{format:'CODE128',displayValue:false,margin:0,width:2,height:38});
 label.appendChild(barcode);
 return label;
}

async function createPatientPdf(patient,department,html2canvas,jsPDF,stage){
 const label=createLabel(patient,department,JsBarcode);
 stage.replaceChildren(label);
 await waitForPaint();
 const canvas=await html2canvas(label,{backgroundColor:'#ffffff',scale:RENDER_SCALE,logging:false,useCORS:false,imageSmoothingEnabled:false});
 const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:[50,30],compress:true,precision:12});
 const width=pdf.internal.pageSize.getWidth(),height=pdf.internal.pageSize.getHeight();
 pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,width,height,undefined,'SLOW');
 pdf.setProperties({title:patient.medical_number||`BADR${String(patient.id).padStart(5,'0')}`,subject:'Hospital patient barcode label',creator:'Badr HIS'});
 return pdf;
}

function download(blob,fileName){
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;
 link.download=fileName;
 document.body.appendChild(link);
 link.click();
 link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function createStage(){
 const stage=document.createElement('div');
 stage.className='barcode-batch-stage';
 document.body.appendChild(stage);
 return stage;
}

export async function exportPatientBarcodePdf(patient,department){
 if(!patient||!department)return 0;
 const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')]);
 const stage=createStage();
 try{
  if(document.fonts?.ready)await document.fonts.ready;
  const pdf=await createPatientPdf(patient,department,html2canvas,jsPDF,stage);
  const medicalNumber=patient.medical_number||`BADR${String(patient.id).padStart(5,'0')}`;
  download(pdf.output('blob'),`${safeName(medicalNumber)}.pdf`);
  return 1;
 }finally{
  stage.remove();
 }
}

export async function exportDepartmentBarcodes(patients,department){
 if(!department||!patients.length)return 0;
 const [{default:html2canvas},{default:JSZip},{jsPDF}]=await Promise.all([import('html2canvas'),import('jszip'),import('jspdf')]);
 const stage=createStage();
 const zip=new JSZip();
 try{
  if(document.fonts?.ready)await document.fonts.ready;
  for(const patient of patients){
   const pdf=await createPatientPdf(patient,department,html2canvas,jsPDF,stage);
   const medicalNumber=patient.medical_number||`BADR${String(patient.id).padStart(5,'0')}`;
   zip.file(`${safeName(medicalNumber)}.pdf`,pdf.output('arraybuffer'));
  }
  const archive=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
  download(archive,`barcodes-${safeName(department.name)}.zip`);
  return patients.length;
 }finally{
  stage.remove();
 }
}
