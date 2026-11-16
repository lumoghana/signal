/** Keep the current view, selection, scroll and media alive when only a record changes.
 * All merchant actions use delegated document handlers; retained nodes need no rebinding.
 */
const key=node=>node.nodeType===1?(node.id?'id:'+node.id:node.getAttribute('data-modal-key')?'modal:'+node.getAttribute('data-modal-key'):node.getAttribute('data-id')?'row:'+node.nodeName+':'+(node.getAttribute('data-action')||'')+':'+node.getAttribute('data-id'):node.nodeName==='FORM'?'form:'+['data-form','data-campus-form','data-operations-form','data-people-form','data-plan-form','data-signup-step','data-access-view'].map(name=>node.getAttribute(name)||'').join(':'):/^(INPUT|TEXTAREA|SELECT)$/.test(node.nodeName)&&node.getAttribute('name')?'control:'+node.nodeName+':'+node.getAttribute('name')+':'+(node.getAttribute('type')||'')+(['radio','checkbox'].includes(node.getAttribute('type'))?':'+(node.getAttribute('value')||''):''):''):'';
const compatible=(left,right)=>left&&right&&left.nodeType===right.nodeType&&left.nodeName===right.nodeName&&key(left)===key(right);
function dirtyControl(node){
 if(node.nodeName==='SELECT'){
  const options=[...(node.options||[])],defaults=options.map((option,index)=>option.defaultSelected?index:-1).filter(index=>index>=0);
  if(!defaults.length&&!node.multiple&&options.length)defaults.push(0);
  return options.some((option,index)=>Boolean(option.selected)!==defaults.includes(index));
 }
 if(node.nodeName==='INPUT'&&['checkbox','radio'].includes(node.type))return node.checked!==(typeof node.defaultChecked==='boolean'?node.defaultChecked:node.hasAttribute('checked'));
 return node.value!==(typeof node.defaultValue==='string'?node.defaultValue:node.getAttribute('value')||'');
}
function patchNode(live,next,preserveFields){
 // Element equality ignores live field properties. Explicit renders must still
 // walk equal markup so reset/cancel can clear dirty descendants.
 if(live.isEqualNode?.(next)&&(preserveFields||live.nodeType!==1))return;
 if(live.nodeType!==1){if(live.nodeValue!==next.nodeValue)live.nodeValue=next.nodeValue;return;}
 const control=/^(INPUT|TEXTAREA|SELECT)$/.test(live.nodeName),keep=control&&preserveFields&&live.type!=='hidden'&&!live.disabled&&!next.disabled&&!live.readOnly&&!next.readOnly&&dirtyControl(live);
 const value=keep?live.value:next.value,checked=keep?live.checked:next.checked,open=live.nodeName==='DETAILS'?live.open:undefined;
 for(const attr of [...live.attributes])if(!next.hasAttribute(attr.name)&&!(open!==undefined&&attr.name==='open'))live.removeAttribute(attr.name);
 for(const attr of [...next.attributes])if(!(open!==undefined&&attr.name==='open')&&live.getAttribute(attr.name)!==attr.value)live.setAttribute(attr.name,attr.value);
 patchChildren(live,next,preserveFields);
 if(control){if(live.value!==value)live.value=value;if(live.nodeName==='INPUT'&&live.checked!==checked)live.checked=checked;}
 if(open!==undefined)live.open=open;
}
export function patchChildren(live,next,preserveFields=false){
 let at=live.firstChild;
 for(const desired of [...next.childNodes]){
  if(!compatible(at,desired)){
   let match=null;const wanted=key(desired);
   if(wanted)for(let node=at?.nextSibling;node;node=node.nextSibling)if(compatible(node,desired)){match=node;break;}
   if(match){live.insertBefore(match,at);at=match;}
   else{const added=desired.cloneNode(true);live.insertBefore(added,at);at=added;}
  }
  patchNode(at,desired,preserveFields);at=at.nextSibling;
 }
 while(at){const following=at.nextSibling;live.removeChild(at);at=following;}
}
export function updateMarkup(root,html,{replace=false,preserveFields=false}={}){
 if(!root)return;
 const document=root.ownerDocument,template=document?.createElement?.('template');
 // The retained minimal module harness has no HTML parser; real browser nodes always do.
 if(replace){root.innerHTML=html;return;}
 if(!template?.content){if(root.innerHTML!==html)root.innerHTML=html;return;}
 template.innerHTML=html;patchChildren(root,template.content,preserveFields);
}
