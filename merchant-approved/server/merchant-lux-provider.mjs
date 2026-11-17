import {APPROVED_CONFIG} from './approved-config.mjs';
export function luxRuntimeCredential(headers={},env=process.env) {
  return env.AI_GATEWAY_API_KEY || (typeof headers['x-vercel-oidc-token']==='string'?headers['x-vercel-oidc-token']:undefined) || env.VERCEL_OIDC_TOKEN;
}
export function luxRuntimeWorkloadProof(headers={},env=process.env){
  return typeof headers['x-vercel-oidc-token']==='string'?headers['x-vercel-oidc-token']:env.VERCEL_OIDC_TOKEN;
}
const MODEL = 'openai/gpt-5.4-mini';
export async function interpretLux(input,{fetcher=fetch,credential=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN,systemPrompt,responseSchema,validatePlan}={}) {
  if(!credential) return {mode:'recorded',reason:'AI_NOT_CONFIGURED'};
  try {
    const response=await fetcher('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages:[{role:'system',content:systemPrompt},{role:'user',content:JSON.stringify({question:input.question,context:input.context})}],max_completion_tokens:1100,reasoning_effort:'low',response_format:{type:'json_schema',json_schema:{name:'lux_question_plan',strict:true,schema:responseSchema}}}),signal:AbortSignal.timeout(12000),redirect:'error'});
    if(!response.ok) {
      let data;try{data=await response.json();}catch{}
      const candidate=data?.error?.code||data?.error?.type||data?.code||data?.type||'';
      const providerCode=typeof candidate==='string'&&/^[a-z_]{1,80}$/i.test(candidate)?candidate:'';
      const message=typeof data?.error?.message==='string'?data.error.message:'';
      const verification=/customer_verification_required|verification_required/.test(providerCode)||/valid payment method|verify your (?:identity|account)|customer_verification_required/i.test(message);
      return {mode:'recorded',reason:response.status===402?'AI_CREDITS_REQUIRED':response.status===403?verification?'AI_VERIFICATION_REQUIRED':'AI_ACCESS_DENIED':response.status===429?'AI_BUSY':'AI_UNAVAILABLE',providerCode};
    }
    const data=await response.json(),content=data.choices?.[0]?.message?.content;
    if(typeof content!=='string'||content.length>6000) return {mode:'recorded',reason:'AI_UNREADABLE'};
    const plan=validatePlan(JSON.parse(content),input.question,input.context);
    return plan?{mode:'ai',plan}:{mode:'recorded',reason:'AI_PLAN_REJECTED'};
  } catch { return {mode:'recorded',reason:'AI_UNAVAILABLE'}; }
}

export async function reserveInference(token,fetcher,serverProof) {
  if(typeof serverProof!=='string'||!serverProof)return 'AI_QUOTA_UNAVAILABLE';
  try {
    const response=await fetcher(`${APPROVED_CONFIG.url}/functions/v1/lumo-lux-quota`,{method:'POST',headers:{'Content-Type':'application/json',apikey:APPROVED_CONFIG.publishableKey,Authorization:`Bearer ${token}`,'X-Lumo-Workload-Proof':serverProof},body:'{}',signal:AbortSignal.timeout(4000),redirect:'error'});
    const data=await response.json();
    return response.ok && data.allowed===true ? null : response.ok && ['AI_DAILY_CAP','AI_RATE_LIMITED'].includes(data.reason) ? data.reason : 'AI_QUOTA_UNAVAILABLE';
  } catch { return 'AI_QUOTA_UNAVAILABLE'; }
}

