/* Token pairs used by real text, focus and control surfaces. Geometry needs a browser. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dist=path.join(__dirname,'../dist');
const css=[...fs.readFileSync(path.join(dist,'index.html'),'utf8').matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="\/([^"?]+)(?:\?[^"]*)?"/g)].map(match=>fs.readFileSync(path.join(dist,match[1]),'utf8')).join('\n');
const tokens=Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[a-f\d]{3,6})(?=[;}])/gi)].map(m=>[m[1],m[2]]));
const luminance=color=>{if(color.length===4)color='#'+[...color.slice(1)].map(c=>c+c).join('');const c=color.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const ratio=(a,b)=>{const x=luminance(tokens[a]),y=luminance(tokens[b]);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const pairs=[['ink','paper',4.5],['muted','paper',4.5],['white','ink',4.5],['ink','green',4.5],['green-ink','green',4.5],['green-ink','green-soft',4.5],['muted','green-soft',4.5],['muted','soft',4.5],['muted','white',4.5],['ink','white',4.5],['red','shortfall-soft',4.5],['green-ink','paper',3],['green-ink','green',3],['control-line','white',3],['control-line','paper',3]];
for(const [front,back,min]of pairs){const value=ratio(front,back);assert(value>=min,`${front} on ${back}: ${value}`);console.log(`${front} / ${back}: ${value.toFixed(2)}:1 (>=${min}:1)`);}
console.log('PASS '+pairs.length+' actual system text, focus and control color pairs.');
