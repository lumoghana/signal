/** A visible, browser-local calendar. Choosing a date never changes money records. */
import {esc,icon} from './ui.js';

const iso=(year,month,day)=>`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
function dateParts(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const [year,month,day]=value.split('-').map(Number);
 if(year<1||month<1||month>12||day<1||day>monthDays(year,month))return null;
 return {year,month,day};
}
function utcDate(year,month,day){const d=new Date(0);d.setUTCHours(0,0,0,0);d.setUTCFullYear(year,month-1,day);return d;}
function monthDays(year,month){const d=new Date(0);d.setUTCHours(0,0,0,0);d.setUTCFullYear(year,month,0);return d.getUTCDate();}
const longDate=value=>{const p=dateParts(value);return p?utcDate(p.year,p.month,p.day).toLocaleDateString('en-GH',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'';};

export function shiftCalendarMonth(value,offset){
 const p=dateParts(value);if(!p||!Number.isInteger(offset))return null;
 const index=p.year*12+p.month-1+offset,year=Math.floor(index/12),month=index%12+1;
 if(year<1||year>9999)return null;
 return iso(year,month,Math.min(p.day,monthDays(year,month)));
}

export function calendarMonthData(value){
 const p=dateParts(value);if(!p)return null;
 const first=utcDate(p.year,p.month,1);
 return {year:p.year,month:p.month,label:first.toLocaleDateString('en-GH',{month:'long',year:'numeric',timeZone:'UTC'}),leadingDays:(first.getUTCDay()+6)%7,
  days:Array.from({length:monthDays(p.year,p.month)},(_,index)=>{const day=index+1,value=iso(p.year,p.month,day);return {day,value,label:longDate(value)};})};
}

function monthMarkup(value,selected,today){
 const month=calendarMonthData(value);
 return `<div class="account-date-month"><button type="button" class="account-date-nav" data-adp-month="-1" aria-label="Previous month" ${shiftCalendarMonth(value,-1)?'':'disabled'}>${icon('back',20)}</button><h3 aria-live="polite" aria-atomic="true">${esc(month.label)}</h3><button type="button" class="account-date-nav" data-adp-month="1" aria-label="Next month" ${shiftCalendarMonth(value,1)?'':'disabled'}>${icon('chevron',20)}</button></div><div class="account-date-weekdays" aria-hidden="true">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=>`<span>${day}</span>`).join('')}</div><div class="account-date-days" role="group" aria-label="${esc(month.label)} days">${Array.from({length:month.leadingDays},()=>'<span aria-hidden="true"></span>').join('')}${month.days.map(day=>`<button type="button" class="account-date-day ${day.value===selected?'is-selected':''} ${day.value===today?'is-today':''}" data-adp-day="${day.value}" aria-label="${esc(day.label)}" aria-pressed="${day.value===selected}" ${day.value===today?'aria-current="date"':''}>${day.day}</button>`).join('')}</div>`;
}

export function openAccountDatePicker(ctx,{value,label='Choose a date',onSelect}={}){
 if(typeof ctx?.sheet!=='function')return false;
 const today=new Date().toISOString().slice(0,10),selected=dateParts(value)?value:today;
 let display=selected,done=false;
 const title=/date/i.test(label)?label:String(label).toLowerCase()==='from'?'Choose a start date':String(label).toLowerCase()==='to'?'Choose an end date':'Choose a date';
 const select=value=>{if(done||!dateParts(value))return;done=true;ctx.closeSheet?.();onSelect?.(value);};
 ctx.sheet(`<section class="account-date-picker" aria-label="${esc(title)}"><h2>${esc(title)}</h2><div data-adp-calendar>${monthMarkup(display,selected,today)}</div><div class="account-date-bottom"><span>Tap a day to choose it.</span><button type="button" class="account-date-today" data-adp-today>Today</button></div></section>`,el=>{
  const calendar=el.querySelector('[data-adp-calendar]');
  const bindMonth=()=>{
   el.querySelectorAll('[data-adp-day]').forEach(button=>button.onclick=()=>select(button.dataset.adpDay));
   el.querySelectorAll('[data-adp-month]').forEach(button=>button.onclick=()=>{
    if(done||button.disabled)return;
    const next=shiftCalendarMonth(display,Number(button.dataset.adpMonth));if(!next)return;
    display=next;calendar.innerHTML=monthMarkup(display,selected,today);bindMonth();
    el.querySelector(`[data-adp-month="${button.dataset.adpMonth}"]`)?.focus({preventScroll:true});
   });
  };
  bindMonth();el.querySelector('[data-adp-today]').onclick=()=>select(today);
 },{closeLabel:'Cancel date selection',onClose:()=>{done=true;}});
 return true;
}
