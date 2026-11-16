import test from 'node:test';
import assert from 'node:assert/strict';
import {patchChildren,updateMarkup} from '../dist/stable-dom.js';
// Control properties intentionally differ from attributes, as when typing in a browser.
class Node {
 constructor(name,attrs={},children=[]){this.nodeName=name;this.nodeType=name==='#text'?3:1;this.nodeValue=name==='#text'?attrs.text:null;this.attrs={...attrs};delete this.attrs.text;this.childNodes=[];this.parentNode=null;this.value=attrs.value||'';this.checked='checked'in attrs;this.open='open'in attrs;this.scrollTop=0;for(const child of children)this.insertBefore(child,null)}
 get id(){return this.attrs.id||''}get type(){return this.attrs.type||''}get readOnly(){return 'readonly'in this.attrs}get attributes(){return Object.entries(this.attrs).map(([name,value])=>({name,value}))}get firstChild(){return this.childNodes[0]||null}get nextSibling(){if(!this.parentNode)return null;return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this)+1]||null}
 getAttribute(name){return this.attrs[name]??null}hasAttribute(name){return name in this.attrs}setAttribute(name,value){this.attrs[name]=value}removeAttribute(name){delete this.attrs[name]}
 insertBefore(child,before){if(child.parentNode)child.parentNode.removeChild(child);const index=before?this.childNodes.indexOf(before):this.childNodes.length;assert.ok(index>=0);this.childNodes.splice(index,0,child);child.parentNode=this}
 removeChild(child){const index=this.childNodes.indexOf(child);assert.ok(index>=0);this.childNodes.splice(index,1);child.parentNode=null}
 cloneNode(deep){return new Node(this.nodeName,this.nodeType===3?{text:this.nodeValue}:{...this.attrs},deep?this.childNodes.map(child=>child.cloneNode(true)):[])}
 isEqualNode(other){return this.nodeName===other.nodeName&&this.nodeValue===other.nodeValue&&JSON.stringify(this.attrs)===JSON.stringify(other.attrs)&&this.childNodes.length===other.childNodes.length&&this.childNodes.every((child,index)=>child.isEqualNode(other.childNodes[index]))}
}
const text=value=>new Node('#text',{text:value}),el=(name,attrs={},children=[])=>new Node(name,attrs,children);
test('receipt updates retain typed fields, reading position, disclosures and media',()=>{
 const input=el('INPUT',{name:'amount',value:''}),form=el('FORM',{'data-form':'refund'},[input]),video=el('VIDEO',{id:'scan-video'}),details=el('DETAILS',{},[text('Help')]),status=el('STRONG',{},[text('Pending')]),root=el('MAIN',{},[form,status,details,video]);
 input.value='25.50';form.scrollTop=120;details.open=true;video.srcObject={stream:'live-camera'};const next=root.cloneNode(true);next.childNodes[1].firstChild.nodeValue='Confirmed';patchChildren(root,next,true);
 assert.equal(root.firstChild,form);assert.equal(form.firstChild,input);assert.equal(input.value,'25.50');assert.equal(form.scrollTop,120);assert.equal(root.childNodes[2],details);assert.equal(details.open,true);assert.equal(root.childNodes[3],video);assert.deepEqual(video.srcObject,{stream:'live-camera'});assert.equal(status.firstChild.nodeValue,'Confirmed');
});
test('keyed rows are reused on insertion while changed workflows discard old fields',()=>{
 const row=id=>el('BUTTON',{'data-id':id,'data-action':'receipt'},[text(id)]),one=row('one'),two=row('two'),root=el('MAIN',{},[one,two]);patchChildren(root,el('MAIN',{},[row('new'),row('one'),row('two')]),true);assert.equal(root.childNodes[1],one);assert.equal(root.childNodes[2],two);
 const old=el('FORM',{'data-form':'refund'},[el('INPUT',{name:'amount',value:''})]);old.firstChild.value='private draft';const dialog=el('DIV',{},[old]);patchChildren(dialog,el('DIV',{},[el('FORM',{'data-form':'handover'},[el('INPUT',{name:'pin',type:'password',value:''})])]),true);assert.notEqual(dialog.firstChild,old);assert.equal(dialog.firstChild.firstChild.value,'');
});
test('quiet refresh updates locked/hidden values and removes permissioned controls',()=>{
 const hidden=el('INPUT',{type:'hidden',name:'request',value:'old'}),locked=el('INPUT',{readonly:'',name:'amount',value:'25.00'}),button=el('BUTTON',{},[text('Continue')]),root=el('MAIN',{},[hidden,locked,button]);patchChildren(root,el('MAIN',{},[el('INPUT',{type:'hidden',name:'request',value:'new'}),el('INPUT',{readonly:'',name:'amount',value:'30.00'}),el('BUTTON',{disabled:''},[text('Closed')])]),true);assert.equal(hidden.value,'new');assert.equal(locked.value,'30.00');assert.equal(button.hasAttribute('disabled'),true);assert.equal(button.firstChild.nodeValue,'Closed');
});
test('unchanged markup performs no root write in the module harness',()=>{let writes=0,current='same';const root={get innerHTML(){return current},set innerHTML(value){writes++;current=value}};updateMarkup(root,'same');assert.equal(writes,0);updateMarkup(root,'different');assert.equal(writes,1)});

test('a newly inserted named input cannot inherit another field’s dirty value',()=>{const amount=el('INPUT',{name:'amount',value:''});amount.value='25.00';const root=el('FORM',{},[amount]);patchChildren(root,el('FORM',{},[el('INPUT',{name:'note',value:''}),el('INPUT',{name:'amount',value:''})]),true);assert.equal(root.childNodes[0].value,'');assert.equal(root.childNodes[1],amount);assert.equal(amount.value,'25.00')});
test('clean remote checkboxes update while deliberately edited controls retain their drafts',()=>{const clean=el('INPUT',{name:'notify',type:'checkbox'}),dirty=el('INPUT',{name:'option',type:'checkbox'});dirty.checked=true;const root=el('FORM',{},[clean,dirty]);patchChildren(root,el('FORM',{},[el('INPUT',{name:'notify',type:'checkbox',checked:''}),el('INPUT',{name:'option',type:'checkbox'})]),true);assert.equal(clean.checked,true);assert.equal(dirty.checked,true)});

test('explicit reset walks equal ancestor markup and clears dirty descendants',()=>{const field=el('INPUT',{name:'amount',value:''}),root=el('MAIN',{},[el('FORM',{'data-form':'request'},[field])]);field.value='25.50';patchChildren(root,root.cloneNode(true),false);assert.equal(field.value,'')});
test('forced actor replacement rewrites even identical serialized HTML',()=>{let writes=0,current='same';const root={get innerHTML(){return current},set innerHTML(value){writes++;current=value}};updateMarkup(root,'same',{replace:true});assert.equal(writes,1)});
