import test from 'node:test';
import assert from 'node:assert/strict';
import {captureFocus,restoreFocus} from '../dist/focus-preservation.js';

// A deliberately small DOM supports structural replacement and browser-like
// focus/selection without letting the helper read application state.
class Element{
 constructor(tag,attributes={},children=[]){this.tagName=tag.toUpperCase();this.attributes={...attributes};this.children=[];this.parentElement=null;this.disabled=false;this.focusCalls=[];for(const child of children)this.append(child)}
 append(child){child.parentElement=this;child.ownerDocument=this.ownerDocument;this.children.push(child);if(child.children)for(const nested of child.children)child.attachDocument?.(this.ownerDocument);return child}
 attachDocument(doc){this.ownerDocument=doc;for(const child of this.children)child.attachDocument(doc)}
 getAttribute(key){return Object.hasOwn(this.attributes,key)?String(this.attributes[key]):null}
 contains(element){return element===this||this.children.some(child=>child.contains(element))}
 closest(selector){let current=this;while(current){if(selector==='form'&&current.tagName==='FORM')return current;if(selector==='[hidden],[inert]'&&(Object.hasOwn(current.attributes,'hidden')||Object.hasOwn(current.attributes,'inert')))return current;current=current.parentElement}return null}
 querySelectorAll(selector){const all=[];const visit=node=>{for(const child of node.children){all.push(child);visit(child)}};visit(this);if(selector==='form')return all.filter(node=>node.tagName==='FORM');return all.filter(node=>['INPUT','TEXTAREA','SELECT','BUTTON','SUMMARY'].includes(node.tagName)||(node.tagName==='A'&&node.getAttribute('href')!==null)||node.getAttribute('tabindex')!==null||node.getAttribute('contenteditable')==='true')}
 focus(options){this.ownerDocument.activeElement=this;this.focusCalls.push(options)}
 setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction}
}
const input=(name,extra={})=>new Element('input',{name,...extra});
function root(children=[]){const document={activeElement:null},element=new Element('main',{},children);element.attachDocument(document);return {root:element,document}}
function replace(element,children){for(const child of element.children)child.parentElement=null;element.children=[];for(const child of children){element.append(child);child.attachDocument(element.ownerDocument)}}
const form=(kind,children)=>new Element('form',{'data-form':'operations','data-operations-form':kind},children);

test('an input lacking an id regains focus and selection after a form redraw',()=>{
 const old=input('hours'),page=root([form('shop',[old])]);old.value='7 am – midnight';old.selectionStart=3;old.selectionEnd=7;old.selectionDirection='backward';page.document.activeElement=old;
 const snapshot=captureFocus(page.root);const next=input('hours');next.value='7 am – midnight';replace(page.root,[form('shop',[next])]);
 assert.equal(restoreFocus(page.root,snapshot),true);assert.equal(page.document.activeElement,next);assert.deepEqual(next.focusCalls,[{preventScroll:true}]);assert.equal(next.selectionStart,3);assert.equal(next.selectionEnd,7);assert.equal(next.selectionDirection,'backward');assert.equal(next.value,'7 am – midnight');
});

test('similarly named fields in different workflow forms never receive one another’s focus',()=>{
 const shop=input('note'),shift=input('note');const page=root([form('shop',[shop]),form('shift',[shift])]);page.document.activeElement=shift;const snapshot=captureFocus(page.root);
 const newShop=input('note'),newShift=input('note');replace(page.root,[form('shop',[newShop]),form('shift',[newShift])]);assert.equal(restoreFocus(page.root,snapshot),true);assert.equal(page.document.activeElement,newShift);assert.equal(newShop.focusCalls.length,0);
});

test('nameless action buttons keep their exact record or keypad identity across a redraw',()=>{
 const old=new Element('button',{'data-action':'transaction','data-id':'receipt-A'}),other=new Element('button',{'data-action':'transaction','data-id':'receipt-B'});const page=root([old,other]);page.document.activeElement=old;const snapshot=captureFocus(page.root);
 const replacement=new Element('button',{'data-action':'transaction','data-id':'receipt-A'});replace(page.root,[new Element('button',{'data-action':'transaction','data-id':'receipt-B'}),replacement]);assert.equal(restoreFocus(page.root,snapshot),true);assert.equal(page.document.activeElement,replacement);
 const key=new Element('button',{'data-action':'key','data-value':'4','data-page':'checkout'});replace(page.root,[key]);page.document.activeElement=key;const keySnapshot=captureFocus(page.root);replace(page.root,[new Element('button',{'data-action':'key','data-value':'5','data-page':'checkout'})]);assert.equal(restoreFocus(page.root,keySnapshot),false);
});

test('snapshots never capture an input value or password',()=>{
 const password=input('password',{type:'password',id:'owner-password'});password.value='Never-Save-This-Credential-963';password.selectionStart=1;password.selectionEnd=4;password.selectionDirection='forward';const page=root([new Element('form',{'data-form':'access','data-access-view':'login','data-secret':'Never-Save-This-Token'},[password])]);page.document.activeElement=password;
 const snapshot=captureFocus(page.root);assert.ok(snapshot);const saved=JSON.stringify(snapshot);assert.ok(!saved.includes(password.value));assert.ok(!saved.includes('Never-Save-This-Token'));assert.ok(!Object.hasOwn(snapshot,'value'));assert.equal(snapshot.control.type,'password');
});

test('stable ordinal restores repeated controls only while the structural match stays unambiguous',()=>{
 const first=input('line'),second=input('line');const page=root([form('shop',[first,second])]);page.document.activeElement=second;const snapshot=captureFocus(page.root);
 const nextFirst=input('line'),nextSecond=input('line');replace(page.root,[form('shop',[nextFirst,nextSecond])]);assert.equal(restoreFocus(page.root,snapshot),true);assert.equal(page.document.activeElement,nextSecond);
 replace(page.root,[form('shop',[input('line')])]);assert.equal(restoreFocus(page.root,snapshot),false);
});

test('removed, disabled, hidden or context-mismatched controls are not focused',()=>{
 const old=input('hours');const page=root([form('shop',[old])]);page.document.activeElement=old;const snapshot=captureFocus(page.root);
 replace(page.root,[form('closing',[input('hours')])]);assert.equal(restoreFocus(page.root,snapshot),false);
 const disabled=input('hours');disabled.disabled=true;replace(page.root,[form('shop',[disabled])]);assert.equal(restoreFocus(page.root,snapshot),false);
 const hiddenForm=form('shop',[input('hours')]);hiddenForm.attributes.hidden='';replace(page.root,[hiddenForm]);assert.equal(restoreFocus(page.root,snapshot),false);
 replace(page.root,[]);assert.equal(restoreFocus(page.root,snapshot),false);
});

test('unusual ids are matched as text, without a CSS-selector escape dependency',()=>{
 const old=input('hours',{id:'shop:night "quoted"]'});const page=root([old]);page.document.activeElement=old;const snapshot=captureFocus(page.root);const next=input('hours',{id:'shop:night "quoted"]'});replace(page.root,[next]);assert.equal(restoreFocus(page.root,snapshot),true);assert.equal(page.document.activeElement,next);
});

test('minimal test DOMs and malformed snapshots fail gracefully',()=>{
 assert.equal(captureFocus(null),null);assert.equal(captureFocus({querySelectorAll(){return []}},{activeElement:{tagName:'INPUT'}}),null);
 const noAttributes={tagName:'INPUT'},incomplete={contains(){return true},querySelectorAll(){return [noAttributes]}};assert.equal(captureFocus(incomplete,{activeElement:noAttributes}),null);
 const page=root([input('hours')]);assert.equal(restoreFocus(page.root,null),false);assert.equal(restoreFocus(page.root,{version:1}),false);assert.equal(restoreFocus({},{}),false);
});

test('unsupported selection APIs do not prevent restoring a control’s focus',()=>{
 const old=input('amount',{type:'number'});old.selectionStart=0;old.selectionEnd=1;const page=root([old]);page.document.activeElement=old;const snapshot=captureFocus(page.root);const next=input('amount',{type:'number'});next.setSelectionRange=()=>{throw new Error('Selection is not supported')};replace(page.root,[next]);assert.equal(restoreFocus(page.root,snapshot),true);assert.equal(page.document.activeElement,next);
});
