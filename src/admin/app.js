
const tokenInput=()=>document.getElementById('token');
tokenInput().value=localStorage.adminToken||'dev-admin-token';
function saveToken(){localStorage.adminToken=tokenInput().value;}
async function api(path, opts={}){const res=await fetch('/api/admin/'+path,{...opts,headers:{'content-type':'application/json','x-admin-token':tokenInput().value,...opts.headers}}); if(!res.ok) throw new Error(await res.text()); return res.json();}
function table(rows){if(!rows?.length)return '<p class="muted">No rows</p>'; const keys=Object.keys(rows[0]).slice(0,8); return `<table><thead><tr>${keys.map(k=>`<th>${k}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${keys.map(k=>`<td>${fmt(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`}
function fmt(v){if(v==null)return ''; if(typeof v==='object')return `<code>${JSON.stringify(v).slice(0,160)}</code>`; return String(v).slice(0,180)}
async function load(name){try{const data=await api(name); if(name==='summary'){cards(data); document.getElementById('content').innerHTML='';return} document.getElementById('content').innerHTML=`<h2>${name}</h2>`+table(Array.isArray(data)?data:data.items||[data]);}catch(e){document.getElementById('content').innerHTML='<pre>'+e.message+'</pre>'}}
function cards(data){document.getElementById('cards').innerHTML='<div class="grid">'+Object.entries(data).map(([k,v])=>`<div class="card"><h3>${k}</h3><strong>${v}</strong></div>`).join('')+'</div>'}
async function generateAliases(){document.getElementById('content').innerHTML='<h2>Aliases</h2>'+fmt(await api('aliases/generate',{method:'POST',body:'{}'}));}
async function loadMonitoring(){const r=await fetch('/monitoring/metrics'); document.getElementById('content').innerHTML='<h2>Monitoring</h2><pre>'+JSON.stringify(await r.json(),null,2)+'</pre>'}
load('summary');
