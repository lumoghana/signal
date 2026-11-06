import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/js/app.js',import.meta.url),'utf8');
const menuSource=source.slice(source.indexOf('function openMenu()'),source.indexOf('function openHomeAccounts()'));

test('About opens an informational sheet and closes without navigating to Settings',()=>{
  const sheets=[],routes=[];
  let closed=0;
  const sandbox={
    state:{profile:{name:'Ama Mensah',campus:'University of Ghana'}},route:{section:'home',page:'home'},ctx:{},
    firstName:()=> 'Ama',row:()=>'',icon:()=>'',esc:String,appearanceRow:()=>'',
    signOut(){},openAppearance(){},userCloseSheet(){closed++;},
    go:route=>routes.push(route),sheet:(html,bind,options)=>sheets.push({html,bind,options}),
  };
  vm.createContext(sandbox);vm.runInContext(menuSource,sandbox);sandbox.openMenu();
  const about={dataset:{action:'menu-about'},addEventListener(type,fn){this.click=fn;}};
  sheets[0].bind({querySelector:()=>({}),querySelectorAll:()=>[about]});
  about.click();
  assert.deepEqual(routes,[],'About retains the underlying page');
  assert.equal(sheets.length,2);
  assert.match(sheets[1].html,/<h2>About this experience<\/h2>/);
  assert.match(sheets[1].html,/No real money moves/);
  assert.match(sheets[1].html,/local participant simulation/);
  const done={};sheets[1].bind({querySelector:()=>done});done.onclick();
  assert.equal(closed,1);
  assert.deepEqual(routes,[]);
});
