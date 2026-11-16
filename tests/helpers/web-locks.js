/** Named exclusive lock queues shared by test tabs using the same storage object. */
export function createWebLocks(){
 const queues=new Map();
 return {request(name,options,work){
  if(options?.mode!=='exclusive')throw Error('Expected an exclusive Web Lock');
  const previous=queues.get(name)||Promise.resolve();
  const next=previous.catch(()=>{}).then(()=>work({name,mode:'exclusive'}));
  queues.set(name,next);
  return next.finally(()=>{if(queues.get(name)===next)queues.delete(name);});
 }};
}
const managers=new WeakMap();
export function locksFor(storage){if(!managers.has(storage))managers.set(storage,createWebLocks());return managers.get(storage);}
