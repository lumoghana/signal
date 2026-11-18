import {writeReadinessManifest,verifyReadinessManifest} from '../backend/verification/branding-2.15.0/source-manifest.mjs';
const args=new Set(process.argv.slice(2));
for(const flag of args)if(!['--check','--write','--candidate','--frozen'].includes(flag))throw Error('Unknown flag: '+flag);
if(args.has('--candidate')&&args.has('--frozen'))throw Error('Choose candidate or frozen status.');
if(args.has('--write')&&!args.has('--candidate')&&!args.has('--frozen'))throw Error('Use --write --candidate while reviewing, or --write --frozen after the source freeze.');
if(args.has('--check')&&args.has('--write'))throw Error('Choose check or write.');
const manifest=args.has('--write')?await writeReadinessManifest({frozen:args.has('--frozen')}):await verifyReadinessManifest();
console.log(JSON.stringify({ok:true,release:manifest.release,status:manifest.status,functions:Object.fromEntries(Object.entries(manifest.functions).map(([name,r])=>[name,{files:Object.keys(r.files).length,reviewedDeltas:Object.keys(r.deltas).length}])),migrations:Object.keys(manifest.migrations).length,hostedWrites:false}));
