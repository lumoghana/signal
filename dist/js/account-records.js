/** Records controls share the app's local ledger without changing financial state. */
import {statementCSV,exportAccountData} from './account-model.js';
import {openAccountDatePicker} from './account-date-picker.js';

export function recordDateLabel(value){
 const date=new Date(`${value}T12:00:00Z`);
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?date.toLocaleDateString('en-GH',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Accra'}):'Choose a date';
}

export function bindAccountRecords(ctx,{download}={}){
 const form=ctx.$('[data-account-form="statement"]'),exportButton=ctx.$('[data-account-export]');
 if(!form&&!exportButton)return ()=>{};
 const from=form?.querySelector('[name="from"]'),to=form?.querySelector('[name="to"]');
 const fromButton=form?.querySelector('[data-account-date="from"]'),toButton=form?.querySelector('[data-account-date="to"]');
 const statementError=form?.querySelector('[data-account-error]'),statementStatus=form?.querySelector('[data-statement-status]');
 const exportError=ctx.$('[data-export-error]'),exportStatus=ctx.$('[data-export-status]');
 const set=(el,message='')=>{if(el)el.textContent=message;};
 const values=()=>({from:from?.value||'',to:to?.value||''});
 const saveDates=()=>{if(!form)return;ctx.draft.accountStatement=values();ctx.saveDraft?.();};
 const dateChanged=()=>{saveDates();set(statementError);set(statementStatus);};
 const startDownload=(name,data,type)=>{
  if(typeof download!=='function'||download(name,data,type)===false)throw new Error('Download unavailable');
 };
 const picker=event=>{
  const input=event.currentTarget;
  input.focus?.({preventScroll:true});
  if(typeof input.showPicker==='function')try{input.showPicker();event.preventDefault();}catch{/* Keep native editing available when a picker cannot open. */}
 };
 for(const input of [from,to].filter(Boolean)){
  input.addEventListener('input',dateChanged);
  input.addEventListener('change',dateChanged);
  input.addEventListener('click',picker);
 }
 for(const [input,control,label] of [[from,fromButton,'From'],[to,toButton,'To']]){
  if(!input||!control)continue;
  control.onclick=()=>openAccountDatePicker(ctx,{value:input.value,label,onSelect:value=>{
   input.value=value;dateChanged();
   set(control.querySelector('[data-account-date-value]'),recordDateLabel(value));
   control.setAttribute('aria-label',`Choose ${label.toLowerCase()} date, ${recordDateLabel(value)}`);
  }});
 }
 if(form){
  ctx.setCapture?.(saveDates);
  form.onsubmit=event=>{
   event.preventDefault();saveDates();set(statementError);set(statementStatus);
   const range=values();let csv;
   try{csv=statementCSV(ctx.state,range);}catch(error){set(statementError,error.message);(!range.from?fromButton||from:!range.to||range.from>range.to?toButton||to:fromButton||from)?.focus?.();return;}
   try{
    startDownload(`Lumo-statement-${range.from}-${range.to}.csv`,csv,'text/csv;charset=utf-8');
    const message='Your CSV statement download has started.';set(statementStatus,message);ctx.toast(message);
   }catch{set(statementError,'Your statement download could not start. Please try again.');}
  };
 }
 if(exportButton)exportButton.onclick=()=>{
  set(exportError);set(exportStatus);
  try{
   startDownload('Lumo-account-data.json',JSON.stringify(exportAccountData(ctx.state,{connected:ctx.connected===true}),null,2),'application/json');
   const message='Your account data download has started.';set(exportStatus,message);ctx.toast(message);
  }catch{set(exportError,'Your account data download could not start. Please try again.');}
 };
 return ()=>{
  for(const input of [from,to].filter(Boolean)){
   input.removeEventListener('input',dateChanged);input.removeEventListener('change',dateChanged);input.removeEventListener('click',picker);
  }
  if(form){form.onsubmit=null;ctx.setCapture?.(null);}
  if(exportButton)exportButton.onclick=null;
  if(fromButton)fromButton.onclick=null;if(toButton)toButton.onclick=null;
 };
}
