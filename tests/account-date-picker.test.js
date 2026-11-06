import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarMonthData,shiftCalendarMonth,openAccountDatePicker} from '../dist/js/account-date-picker.js';

test('calendar shows a complete Monday-first month with real dates and accessible day labels',()=>{
 const month=calendarMonthData('2026-11-04');assert.equal(month.label,'November 2026');assert.equal(month.leadingDays,6);assert.equal(month.days.length,30);
 assert.deepEqual(month.days.map(d=>d.day),Array.from({length:30},(_,i)=>i+1));
 assert.equal(month.days[0].value,'2026-11-01');assert.equal(month.days.at(-1).value,'2026-11-30');assert.match(month.days[3].label,/Wednesday/);assert.match(month.days[3].label,/4 November 2026/);
});

test('month navigation crosses years and clamps dates rather than skipping February',()=>{
 assert.equal(shiftCalendarMonth('2026-12-31',1),'2027-01-31');assert.equal(shiftCalendarMonth('2027-01-31',-1),'2026-12-31');
 assert.equal(shiftCalendarMonth('2026-01-31',1),'2026-02-28');assert.equal(shiftCalendarMonth('2028-01-31',1),'2028-02-29');assert.equal(shiftCalendarMonth('2028-03-31',-1),'2028-02-29');
});

test('calendar honours Gregorian leap years, including century boundaries',()=>{
 assert.equal(calendarMonthData('2000-02-29').days.length,29);assert.equal(calendarMonthData('1900-02-01').days.length,28);assert.equal(calendarMonthData('2100-02-01').days.length,28);
 assert.equal(calendarMonthData('0004-02-29').days.length,29);assert.equal(calendarMonthData('0099-02-28').label,'February 99');
});

test('invalid dates and unsupported month shifts are rejected without inventing a date',()=>{
 for(const value of ['2026-02-29','2026-04-31','2026-13-01','0000-01-01','2026-1-04','not-a-date','',null]){
  assert.equal(calendarMonthData(value),null);assert.equal(shiftCalendarMonth(value,1),null);
 }
 assert.equal(shiftCalendarMonth('2026-11-04',.5),null);assert.equal(shiftCalendarMonth('0001-01-01',-1),null);assert.equal(shiftCalendarMonth('9999-12-31',1),null);
 assert.equal(shiftCalendarMonth('0001-12-31',1),'0002-01-31');
});

function sheetFixture(){
 let html='',options,closed=0;const chosen=[];
 const day={dataset:{adpDay:'2026-11-18'}},today={},calendar={innerHTML:''};
 const root={querySelectorAll(selector){return selector==='[data-adp-day]'?[day]:[];},querySelector(selector){return selector==='[data-adp-calendar]'?calendar:selector==='[data-adp-today]'?today:null;}};
 const ctx={sheet(markup,bind,opts){html=markup;options=opts;bind(root);},closeSheet(){closed++;}};
 return {ctx,day,today,chosen,get html(){return html;},get options(){return options;},get closed(){return closed;}};
}

test('selecting a calendar day closes the existing sheet and returns its ISO date exactly once',()=>{
 const f=sheetFixture();assert.equal(openAccountDatePicker(f.ctx,{value:'2026-11-04',label:'From',onSelect:value=>f.chosen.push(value)}),true);
 assert.match(f.html,/Choose a start date/);assert.match(f.html,/November 2026/);assert.match(f.html,/aria-pressed="true"/);assert.doesNotMatch(f.html,/role="grid"/);
 f.day.onclick();f.day.onclick();assert.equal(f.closed,1);assert.deepEqual(f.chosen,['2026-11-18']);
});

test('Today uses the current Ghana UTC date and cancelling cannot commit an old day control',()=>{
 const f=sheetFixture(),before=new Date().toISOString().slice(0,10);openAccountDatePicker(f.ctx,{value:'invalid',label:'To',onSelect:value=>f.chosen.push(value)});
 assert.match(f.html,/Choose an end date/);f.today.onclick();const after=new Date().toISOString().slice(0,10);assert.ok([before,after].includes(f.chosen[0]));assert.equal(f.closed,1);
 const cancelled=sheetFixture();openAccountDatePicker(cancelled.ctx,{value:'2026-11-04',onSelect:value=>cancelled.chosen.push(value)});cancelled.options.onClose();cancelled.day.onclick();assert.deepEqual(cancelled.chosen,[]);assert.equal(cancelled.closed,0);
});
