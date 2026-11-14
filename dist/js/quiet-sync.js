/** Canonical value comparison. Array order and every business field remain significant. */
export function stableSnapshot(value){
 return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
}

/** Ignore only heartbeat display metadata; money, expiry, permissions and record order remain significant. */
export function consumerViewSnapshot(state,partnerRequests){
 const account=state?.account;
 if(!account)return stableSnapshot([state,partnerRequests]);
 const {lastSeen,lastSeenAt,checkedAt,...records}=account;
 if(Array.isArray(records.devices))records.devices=records.devices.map(device=>{if(!device||typeof device!=='object')return device;const {lastSeen,lastSeenAt,checkedAt,...record}=device;return record;});
 return stableSnapshot([{...state,account:records},partnerRequests]);
}
/** Live records may arrive during a task, but must not remount that task's controls. */
export function canRenderConsumerBackground(route,{focused=false,overlay=false,form=false,media=false,asyncRegion=false}={}){
 if(focused||overlay||media||asyncRegion)return false;
 if(['welcome','terms','tour','onboarding','activation','chat','learn'].includes(route?.section))return false;
 if(route?.section==='pay'&&!['transaction','status'].includes(route.page))return false;
 if(['plan','boxes'].includes(route?.section)&&!['home','detail','history'].includes(route.page))return false;
 if(form&&!(route?.section==='life'&&route.page==='group-chat'))return false;
 return true;
}
export function captureReadingPosition(root){
 if(!root?.querySelectorAll)return null;
 const details=[...root.querySelectorAll('details')].map((node,index)=>({id:node.id,index,open:node.open}));
 const scrollers=[root,...root.querySelectorAll('*')].filter(node=>node.scrollTop>0||node.scrollLeft>0).map(node=>({id:node.id,path:node===root?[]:elementPath(node,root),top:node.scrollTop,left:node.scrollLeft}));
 return {details,scrollers};
}
function elementPath(node,root){const path=[];for(let current=node;current&&current!==root;current=current.parentElement){const parent=current.parentElement;if(!parent)return null;path.unshift([...parent.children].indexOf(current));}return path;}
export function restoreReadingPosition(root,position){
 if(!root?.querySelectorAll||!position)return;
 const details=[...root.querySelectorAll('details')];
 for(const item of position.details){const node=item.id?[...details].find(node=>node.id===item.id):details[item.index];if(node)node.open=item.open;}
 for(const item of position.scrollers){let node=item.id?[root,...root.querySelectorAll('[id]')].find(node=>node.id===item.id):root;if(!item.id)for(const index of item.path||[])node=node?.children[index];if(node){node.scrollTop=item.top;node.scrollLeft=item.left;}}
}
