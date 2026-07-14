const base=(process.env.BETA_API_BASE_URL||'').replace(/\/$/,'');
const timeoutMs=Number(process.env.BETA_SMOKE_TIMEOUT_MS||15000);
if (!/^https:\/\//.test(base)) throw new Error('BETA_API_BASE_URL must be an HTTPS URL');
const accounts=[
  ['customer',process.env.BETA_CUSTOMER_IDENTIFIER,process.env.BETA_CUSTOMER_PASSWORD],
  ['provider',process.env.BETA_PROVIDER_IDENTIFIER,process.env.BETA_PROVIDER_PASSWORD],
  ['admin',process.env.BETA_ADMIN_IDENTIFIER,process.env.BETA_ADMIN_PASSWORD],
];
async function request(path, init={}) {
  const c=new AbortController(); const timer=setTimeout(()=>c.abort(),timeoutMs);
  try { const r=await fetch(base+path,{...init,signal:c.signal,headers:{'content-type':'application/json',...(init.headers||{})}}); const body=await r.json().catch(()=>({})); if(!r.ok) throw new Error(`${path}: HTTP ${r.status} ${body.error||''}`); return body; }
  finally { clearTimeout(timer); }
}
await request('/api/healthz/deep');
await request('/api/categories');
for (const [role,id,password] of accounts) {
  if(!id||!password) throw new Error(`Missing beta ${role} credentials`);
  const loginPath=role==='admin'?'/api/auth/admin-login':'/api/auth/login';
  const login=await request(loginPath,{method:'POST',body:JSON.stringify({identifier:id,password})});
  if(!login.token) throw new Error(`${role} login returned no access token`);
  const headers={authorization:`Bearer ${login.token}`};
  await request(role==='admin'?'/api/admin/me':'/api/auth/me',{headers});
  console.log(`${role} authentication smoke passed`);
}
console.log('Closed-beta API smoke passed.');
