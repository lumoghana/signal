/** Canonical value comparison. Array order and every business field remain significant. */
export function stableSnapshot(value){
 return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
}
