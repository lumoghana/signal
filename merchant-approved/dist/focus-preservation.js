// Preserve control identity and cursor position only. Input contents never enter a snapshot.
const CONTROLS='input,select,textarea,button,a[href],[tabindex],[contenteditable="true"],summary';
const BUTTON_KEYS=['data-action','data-id','data-value','data-page','data-role','data-mode','data-tab','data-kind','data-shop','data-staff','data-request'];
const FORM_KEYS=['data-form','data-operations-form','data-campus-form','data-people-form','data-signup-step','data-access-view','data-access-phase'];
const string=value=>typeof value==='string'?value:'';
const equal=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const attribute=(element,name)=>string(element.getAttribute(name));
function query(root,selector){try{return Array.from(root.querySelectorAll(selector))}catch{return []}}
function supported(root){return Boolean(root&&typeof root.contains==='function'&&typeof root.querySelectorAll==='function')}
function identity(element){
 if(!element||typeof element.getAttribute!=='function')return null;
 const tag=string(element.tagName).toUpperCase();if(!tag)return null;
 const type=tag==='INPUT'||tag==='BUTTON'?attribute(element,'type').toLowerCase()|| (tag==='INPUT'?'text':'submit'):'';
 const role=attribute(element,'role');
 const actions=tag==='BUTTON'||tag==='A'||role==='button'||attribute(element,'tabindex')!==''?BUTTON_KEYS.map(key=>[key,attribute(element,key)]).filter(([,value])=>value!==''):[];
 return {tag,id:attribute(element,'id'),name:attribute(element,'name'),type,role,actions};
}
function formIdentity(form){
 if(!form||typeof form.getAttribute!=='function')return null;
 // Form markers identify the workflow. Deliberately exclude arbitrary data that
 // could contain a credential, token or user-entered value.
 return {id:attribute(form,'id'),markers:FORM_KEYS.map(key=>[key,attribute(form,key)]).filter(([,value])=>value!=='')};
}
function ownedForm(element,root){
 try{const form=element.closest?.('form');return form&&(form===root||root.contains(form))?form:null}catch{return null}
}
function matchingControls(scope,root,form,description){
 return query(scope,CONTROLS).filter(element=>equal(identity(element),description)&&ownedForm(element,root)===form);
}
function allowedTarget(element,root){
 if(!element||!root.contains(element)||typeof element.focus!=='function'||element.disabled===true||attribute(element,'type')==='hidden')return false;
 try{if(element.closest?.('[hidden],[inert]'))return false;if(typeof element.getClientRects==='function'&&element.getClientRects().length===0)return false}catch{return false}
 return true;
}
export function captureFocus(root,documentRef=root?.ownerDocument||globalThis.document){
 try{
  if(!supported(root))return null;
  const active=documentRef?.activeElement;if(!active||!root.contains(active))return null;
  const control=identity(active);if(!control)return null;
  const form=ownedForm(active,root),formDescription=formIdentity(form);
  let formPosition=null;
  if(form){
   const forms=(root===form?[root]:query(root,'form')).filter(value=>equal(formIdentity(value),formDescription));
   const index=forms.indexOf(form);if(index<0)return null;
   formPosition={...formDescription,index,count:forms.length};
  }
  const matches=matchingControls(form||root,root,form,control),index=matches.indexOf(active);
  if(index<0)return null;
  const selection=Number.isInteger(active.selectionStart)&&Number.isInteger(active.selectionEnd)?{start:active.selectionStart,end:active.selectionEnd,direction:['forward','backward','none'].includes(active.selectionDirection)?active.selectionDirection:'none'}:null;
  return {version:1,control,index,count:matches.length,form:formPosition,selection};
 }catch{return null}
}
export function restoreFocus(root,snapshot){
 try{
  if(!supported(root)||snapshot?.version!==1||!snapshot.control||!Number.isInteger(snapshot.index)||snapshot.index<0||!Number.isInteger(snapshot.count)||snapshot.count<1)return false;
  let form=null;
  if(snapshot.form){
   const description={id:snapshot.form.id,markers:snapshot.form.markers};
   const forms=(string(root.tagName).toUpperCase()==='FORM'?[root]:query(root,'form')).filter(value=>equal(formIdentity(value),description));
   if(forms.length!==snapshot.form.count||!Number.isInteger(snapshot.form.index)||snapshot.form.index<0)return false;
   form=forms[snapshot.form.index];if(!form)return false;
  }
  const matches=matchingControls(form||root,root,form,snapshot.control);
  // A removed or newly inserted indistinguishable control is ambiguous. Keep
  // focus alone rather than guessing which neighbouring field the user meant.
  if(matches.length!==snapshot.count)return false;
  const target=matches[snapshot.index];if(!allowedTarget(target,root))return false;
  target.focus({preventScroll:true});
  if(snapshot.selection&&typeof target.setSelectionRange==='function')try{target.setSelectionRange(snapshot.selection.start,snapshot.selection.end,snapshot.selection.direction)}catch{}
  return true;
 }catch{return false}
}
