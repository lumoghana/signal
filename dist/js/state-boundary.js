/** Install a durable snapshot without invalidating the records a visible task holds. */
export function reconcileState(target, source) {
  if (Array.isArray(target) && Array.isArray(source)) {
    const byId = new Map(target.filter(v=>v && typeof v==='object' && v.id!==undefined).map(v=>[v.id,v]));
    const next = source.map((value,index)=>{
      const existing = value && typeof value==='object' && value.id!==undefined ? byId.get(value.id) : target[index];
      return compatible(existing,value) ? reconcileState(existing,value) : structuredClone(value);
    });
    target.splice(0,target.length,...next); return target;
  }
  for (const key of Object.keys(target)) if (!Object.hasOwn(source,key)) delete target[key];
  for (const [key,value] of Object.entries(source)) target[key] = compatible(target[key],value) ? reconcileState(target[key],value) : structuredClone(value);
  return target;
}
function compatible(a,b) { return a!==null && b!==null && typeof a==='object' && typeof b==='object' && Array.isArray(a)===Array.isArray(b); }

export function commitAction({state,type,payload={},apply,persistence}) {
  const candidate=structuredClone(state), result=apply(candidate,type,payload);
  if (!result.ok && !result.persistFailure) return result;
  const saved=persistence.commit(candidate);
  if (!saved.ok) return {ok:false,message:saved.message || 'This change could not be saved. Nothing was completed.',persistenceFailure:true,reason:saved.reason};
  reconcileState(state,saved.state); return result;
}
