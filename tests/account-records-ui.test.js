import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState} from '../dist/js/model.js';
import {bindAccountRecords} from '../dist/js/account-records.js';
import {renderAccount} from '../dist/js/account-ui.js';

function node(extra={}) {
 const listeners=new Map();
 return {
  value:'',textContent:'',disabled:false,attributes:{},focusCount:0,
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
  removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
  setAttribute(name,value){this.attributes[name]=String(value);},
  removeAttribute(name){delete this.attributes[name];},
  focus(){this.focusCount++;},
  dispatch(type){const event={type,target:this,currentTarget:this,preventDefault(){this.defaultPrevented=true;},defaultPrevented:false};this['on'+type]?.(event);for(const fn of [...listeners.get(type)||[]])fn(event);return event;},
  ...extra
 };
}

function fixture({downloadResult=true,downloadError,dateButtons=false}={}) {
 const state=createDemoState();
 state.transactions=[
  {id:'nov-lunch',type:'payment',direction:'out',amount:1000,fee:0,merchant:'Aku’s lunch',category:'Food',status:'success',rail:'momo',at:'2026-11-01T08:00:00Z'},
  {id:'nov-data',type:'payment',direction:'out',amount:2000,fee:0,merchant:'Data waiting',category:'Data',status:'pending',rail:'momo',at:'2026-11-04T17:00:00Z'},
  {id:'oct-print',type:'payment',direction:'out',amount:3000,fee:0,merchant:'October printing',category:'Essentials',status:'success',rail:'lumo',at:'2026-10-31T08:00:00Z'}
 ];
 state.profile.phone='0241234567';state.settings.pin='9876';
 state.verification={ghanaCard:'GHA-111111111-1',selfie:'secret-selfie'};
 state.chat=[{text:'secret-private-conversation'}];
 const from=node({value:'2026-11-01',pickerCount:0,showPicker(){this.pickerCount++;}});
 const to=node({value:'2026-11-04',pickerCount:0,showPicker(){this.pickerCount++;}});
 const statementError=node(),statementStatus=node(),exportError=node(),exportStatus=node(),exportButton=node();
 const fromLabel=node(),toLabel=node(),fromButton=node({querySelector:()=>fromLabel}),toButton=node({querySelector:()=>toLabel});
 const form=node({querySelector(selector){return {'input[name="from"]':from,'input[name="to"]':to,'[name="from"]':from,'[name="to"]':to,'[data-account-date="from"]':dateButtons?fromButton:null,'[data-account-date="to"]':dateButtons?toButton:null,'[data-account-error]':statementError,'[data-statement-status]':statementStatus}[selector]||null;},querySelectorAll(selector){return selector.includes('input')?[from,to]:[]}});
 const queries={'[data-account-form="statement"]':form,'[data-account-export]':exportButton,'[data-export-error]':exportError,'[data-export-status]':exportStatus};
 const downloads=[],toasts=[],draft={};let saves=0,capture=null,pickerHTML='',pickerClosed=0;
 const pickerDay=node({dataset:{adpDay:'2026-11-03'}}),pickerToday=node(),pickerCalendar=node();
 const ctx={state,draft,$:selector=>queries[selector]||null,$$:selector=>queries[selector]?[queries[selector]]:[],toast:message=>toasts.push(message),saveDraft(){saves++;},setCapture(fn){capture=fn;},sheet(html,bind){pickerHTML=html;bind({querySelectorAll:selector=>selector==='[data-adp-day]'?[pickerDay]:[],querySelector:selector=>selector==='[data-adp-calendar]'?pickerCalendar:selector==='[data-adp-today]'?pickerToday:null});},closeSheet(){pickerClosed++;}};
 const cleanup=bindAccountRecords(ctx,{download(name,data,type){if(downloadError)throw downloadError;downloads.push({name,data,type});return downloadResult;}});
 return {state,draft,from,to,form,fromButton,toButton,fromLabel,toLabel,pickerDay,statementError,statementStatus,exportError,exportStatus,exportButton,downloads,toasts,cleanup,get saves(){return saves;},get capture(){return capture;},get pickerHTML(){return pickerHTML;},get pickerClosed(){return pickerClosed;}};
}

test('records dates save immediately on input and change, and capture the latest fields before leaving',()=>{
 const f=fixture();
 f.from.value='2026-10-30';f.from.dispatch('input');
 assert.deepEqual(f.draft.accountStatement,{from:'2026-10-30',to:'2026-11-04'});
 f.to.value='2026-11-03';f.to.dispatch('change');
 assert.deepEqual(f.draft.accountStatement,{from:'2026-10-30',to:'2026-11-03'});assert.ok(f.saves>=2);
 assert.equal(typeof f.capture,'function');f.from.value='2026-11-02';f.capture();
 assert.deepEqual(f.draft.accountStatement,{from:'2026-11-02',to:'2026-11-03'});
 f.cleanup?.();
});

test('tapping either complete date field opens its native picker and safely falls back to focus',()=>{
 const f=fixture();assert.doesNotThrow(()=>f.from.dispatch('click'));assert.equal(f.from.pickerCount,1);
 assert.doesNotThrow(()=>f.to.dispatch('click'));assert.equal(f.to.pickerCount,1);
 f.from.showPicker=undefined;assert.doesNotThrow(()=>f.from.dispatch('click'));assert.ok(f.from.focusCount>0);
 f.to.showPicker=()=>{throw new Error('User activation is unavailable');};assert.doesNotThrow(()=>f.to.dispatch('click'));assert.ok(f.to.focusCount>0);
 f.cleanup?.();
});

test('CSV uses current inputs once, preserves statuses, and gives visible download feedback',()=>{
 const f=fixture(),before=JSON.stringify(f.state);
 f.from.value='2026-11-04';f.to.value='2026-11-04';const event=f.form.dispatch('submit');
 assert.equal(event.defaultPrevented,true);assert.equal(f.downloads.length,1);
 const file=f.downloads[0];assert.match(file.name,/2026-11-04.*2026-11-04.*\.csv$/);assert.match(file.type,/text\/csv/);
 assert.match(file.data,/nov-data/);assert.match(file.data,/pending/);assert.doesNotMatch(file.data,/nov-lunch|oct-print/);
 assert.deepEqual(f.draft.accountStatement,{from:'2026-11-04',to:'2026-11-04'});
 assert.match(f.statementStatus.textContent,/download|ready/i);assert.ok(f.toasts.some(x=>/download|ready/i.test(x)));
 assert.equal(f.statementError.textContent,'');assert.equal(JSON.stringify(f.state),before);f.cleanup?.();
});

test('invalid date ranges produce no file, explain the error, and clear it when a date changes',()=>{
 const f=fixture();f.from.value='2026-11-05';f.to.value='2026-11-01';f.form.dispatch('submit');
 assert.equal(f.downloads.length,0);assert.match(f.statementError.textContent,/date|range|start|end/i);assert.equal(f.statementStatus.textContent,'');
 f.from.value='2026-11-01';f.from.dispatch('change');assert.equal(f.statementError.textContent,'');
 assert.deepEqual(f.draft.accountStatement,{from:'2026-11-01',to:'2026-11-01'});f.cleanup?.();
});

test('account data download makes one readable JSON file and excludes credentials, identity captures and private chat',()=>{
 const f=fixture(),before=JSON.stringify(f.state);f.exportButton.dispatch('click');
 assert.equal(f.downloads.length,1);const file=f.downloads[0];assert.match(file.name,/\.json$/);assert.match(file.type,/application\/json/);
 const exported=JSON.parse(file.data);assert.equal(exported.format,'lumo-account-export-v1');assert.equal(exported.simulation,true);assert.ok(exported.transactions.some(t=>t.id==='nov-data'));
 for(const secret of ['0241234567','9876','GHA-111111111-1','secret-selfie','secret-private-conversation'])assert.equal(file.data.includes(secret),false);
 assert.match(f.exportStatus.textContent,/download|ready/i);assert.ok(f.toasts.some(x=>/download|ready/i.test(x)));assert.equal(f.exportError.textContent,'');
 assert.equal(JSON.stringify(f.state),before);f.cleanup?.();
});

test('CSV and account export show failures when the browser cannot begin a download',()=>{
 for(const mode of ['throw','false'])for(const kind of ['csv','json']){
  const f=fixture(mode==='throw'?{downloadError:new Error('Download could not start')}:{downloadResult:false}),before=JSON.stringify(f.state);
  assert.doesNotThrow(()=>kind==='csv'?f.form.dispatch('submit'):f.exportButton.dispatch('click'));
  const error=kind==='csv'?f.statementError:f.exportError,status=kind==='csv'?f.statementStatus:f.exportStatus;
  assert.ok(error.textContent.trim(),`${kind}/${mode} must explain the failure`);assert.equal(status.textContent,'');
  assert.equal(JSON.stringify(f.state),before);f.cleanup?.();
 }
});

test('cleanup removes record listeners so stale controls cannot save dates or download again',()=>{
 const f=fixture();assert.equal(typeof f.cleanup,'function');f.cleanup();
 const saves=f.saves,downloads=f.downloads.length,draft=JSON.stringify(f.draft);
 f.from.value='2026-10-01';f.from.dispatch('input');f.to.dispatch('change');f.from.dispatch('click');f.form.dispatch('submit');f.exportButton.dispatch('click');
 assert.equal(f.saves,saves);assert.equal(f.downloads.length,downloads);assert.equal(JSON.stringify(f.draft),draft);assert.equal(f.from.pickerCount,0);
});

test('the visible date-field button opens a calendar, persists a chosen day and updates its label before CSV download',()=>{
 const f=fixture({dateButtons:true}),before=JSON.stringify(f.state);
 f.fromButton.dispatch('click');assert.match(f.pickerHTML,/Choose a start date/);assert.match(f.pickerHTML,/2026-11-03/);
 f.pickerDay.dispatch('click');assert.equal(f.pickerClosed,1);assert.equal(f.from.value,'2026-11-03');
 assert.deepEqual(f.draft.accountStatement,{from:'2026-11-03',to:'2026-11-04'});assert.match(f.fromLabel.textContent,/3 Nov 2026/);assert.match(f.fromButton.attributes['aria-label'],/3 Nov 2026/);
 f.form.dispatch('submit');assert.equal(f.downloads.length,1);assert.match(f.downloads[0].data,/nov-data/);assert.doesNotMatch(f.downloads[0].data,/nov-lunch|oct-print/);assert.equal(JSON.stringify(f.state),before);
 f.cleanup();assert.equal(f.fromButton.onclick,null);assert.equal(f.toButton.onclick,null);
});


test('a refreshed statements screen restores its tab-saved date range and needs no pending native file operation',()=>{
 const f=fixture(),wallet=f.state.wallet,transactions=JSON.stringify(f.state.transactions);
 f.from.value='2026-10-30';f.from.dispatch('input');f.to.value='2026-11-03';f.to.dispatch('change');
 const restored=JSON.parse(JSON.stringify(f.draft)),html=renderAccount({state:f.state,draft:restored},{page:'account-statements'});
 assert.match(html,/name="from" value="2026-10-30"/);assert.match(html,/name="to" value="2026-11-03"/);assert.match(html,/Download CSV statement/);assert.equal(f.downloads.length,0);
 assert.equal(f.state.wallet,wallet);assert.equal(JSON.stringify(f.state.transactions),transactions);f.cleanup();
});
