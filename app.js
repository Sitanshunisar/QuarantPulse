'use strict';
const THRESH=38.0, URGENT=39.5, BENCH=15, CAP=74, KEY='quarantpulse-demo-v1';
const ROLES={
  nurse:{label:'Nurse',name:'Asha Menon',blurb:'Take and record each patient’s temperature for the day.',acts:['See who still needs a temperature today','Record or correct a reading','Get warnings for fever and unusual values']},
  doctor:{label:'Doctor',name:'Dr. Rhea Iyer',blurb:'Visit patients whose temperature is already recorded, and decide on discharge.',acts:['See who is ready to visit, urgent first','Log a treatment note for each visit','Clear patients after 3 fever-free days']},
  admin:{label:'Admin',name:'Kabir Shah',blurb:'Free beds, admit new patients and watch the mortality rate.',acts:['Discharge patients the doctor has cleared','Admit patients into free beds','Track outcomes against the 15% benchmark']}
};

const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const nowTime=()=>{const d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes())};
const fmt=t=>t.toFixed(1);
const dayLabel=d=>d===0?'Today':d===-1?'Yesterday':(-d)+' days ago';
const todayKey=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const todayStr=()=>new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'});

/* ---------- demo data ---------- */
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function makeSeed(){
  const r=rng(20261112);
  const F=['Aarav','Priya','Rohan','Ananya','Vikram','Meera','Imran','Sneha','Arjun','Kavya','Farhan','Neha','Karan','Divya','Siddharth','Pooja','Rahul','Ishita','Manish','Tanvi','Yash','Radhika','Nikhil','Sana','Harsh','Shruti','Dev','Aisha','Varun','Lata'];
  const L=['Sharma','Patil','Khan','Nair','Deshmukh','Iyer','Gupta','Joshi','Fernandes','Reddy','Mehta','Kulkarni','Singh','Shah','Menon','Bose'];
  const nurses=['Asha Menon','Joseph Dsouza','Fatima Sheikh','Lakshmi Rao'];
  const notes=['Continue IV fluids and paracetamol. Review tomorrow.','Oxygen 2 L/min. Monitor SpO2 twice daily.','Responding well. Switch to oral fluids.','Antiviral dose 3 of 5 given.','Appetite improving. Walk with assistance.'];
  const pool=[0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,4,4,5];
  const P=[];
  for(let i=0;i<CAP;i++){
    const s=pool[Math.floor(r()*pool.length)];
    const fd=1+Math.floor(r()*6);
    const todayRec=r()<0.55;
    const N=s+fd, end=todayRec?0:-1, temps=[];
    for(let k=0;k<N;k++){
      const feb=k<fd;
      const t=feb?38.3+r()*1.8:36.6+r()*0.9;
      temps.push({day:end-(N-1)+k,t:Math.round(t*10)/10,time:pad(6+Math.floor(r()*4))+':'+pad(Math.floor(r()*60)),by:nurses[Math.floor(r()*4)]});
    }
    const p={id:i+1,name:F[i%30]+' '+L[(i*3+Math.floor(i/30))%16],age:19+Math.floor(r()*62),room:i+1,admittedDay:temps[0].day-(r()<0.3?1:0),temps,visits:[],status:'admitted',clearedDay:null};
    const visited=todayRec&&r()<0.45;
    if(visited)p.visits.push({day:0,time:pad(9+Math.floor(r()*3))+':'+pad(Math.floor(r()*60)),by:'Dr. Rhea Iyer',note:notes[Math.floor(r()*notes.length)]});
    if(s>=3&&todayRec&&visited&&r()<0.75){p.status='cleared';p.clearedDay=0;p.visits[0].note='Fever-free for 3 days. Cleared for discharge.';}
    else if(s>=4&&!todayRec&&r()<0.5){p.status='cleared';p.clearedDay=-1;p.visits.push({day:-1,time:'11:20',by:'Dr. Rhea Iyer',note:'Fever-free for 3 days. Cleared for discharge.'});}
    P.push(p);
  }
  return {v:1,date:todayKey(),patients:P,nextId:CAP+1,outcomes:{recovered:46,deceased:7},log:[]};
}
let S=load();
let ui={role:null,tab:{nurse:'pending',doctor:'ready',admin:'queue'},q:'',open:null,armed:null,confirmed:false,admitRoom:null,toastT:null};
function load(){
  try{const raw=localStorage.getItem(KEY);if(raw){const d=JSON.parse(raw);if(d&&d.v===1&&d.date===todayKey()&&Array.isArray(d.patients))return d;}}catch(e){}
  return makeSeed();
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}
function addLog(text){S.log.unshift({time:nowTime(),text});if(S.log.length>40)S.log.length=40;}

/* ---------- rules ---------- */
const active=()=>S.patients.filter(p=>p.status==='admitted'||p.status==='cleared');
const byRoom=(a,b)=>a.room-b.room;
const todayTemp=p=>p.temps.find(x=>x.day===0)||null;
const visitToday=p=>p.visits.find(v=>v.day===0)||null;
const cur=()=>S.patients.find(p=>p.id===ui.open)||null;
function lastReading(p){let b=null;for(const t of p.temps)if(!b||t.day>b.day)b=t;return b;}
function prevReading(p){let b=null;for(const t of p.temps)if(t.day<0&&(!b||t.day>b.day))b=t;return b;}
function streak(p){
  let d=0,n=0;
  while(true){
    const r=p.temps.find(x=>x.day===d);
    if(!r){if(d===0){d=-1;continue;}break;}
    if(r.t>=THRESH)break;
    n++;d--;
  }
  return n;
}
const canClear=p=>p.status==='admitted'&&!!todayTemp(p)&&streak(p)>=3;
const isUrgent=p=>{const t=todayTemp(p);return !!t&&t.t>=URGENT;};
function stage(p){
  if(p.status==='cleared')return 'cleared';
  if(!todayTemp(p))return 'await';
  return visitToday(p)?'visited':'ready';
}
function freeRooms(){const u=new Set(active().map(p=>p.room));const f=[];for(let i=1;i<=CAP;i++)if(!u.has(i))f.push(i);return f;}
function rate(){const c=S.outcomes.recovered+S.outcomes.deceased;return c?S.outcomes.deceased/c*100:0;}

function evalTemp(raw,p){
  const s=String(raw).trim().replace(',','.');
  if(s==='')return {state:'err',msg:'Enter today’s temperature in °C, for example 37.4.'};
  const v=Number(s);
  if(!isFinite(v))return {state:'err',msg:'Enter a number, for example 37.4.'};
  if(v<34||v>42)return {state:'err',msg:v+' °C is outside the accepted range of 34.0 to 42.0 °C. Re-measure and check the thermometer.'};
  const v1=Math.round(v*10)/10, prev=prevReading(p), notes=[];
  let confirm=false, state='ok';
  if(v1<35){confirm=true;state='warn';notes.push('Below 35.0 °C is unusually low. Re-measure before saving.');}
  if(v1>=41){confirm=true;state='alert';notes.push('Above 41.0 °C is very rare. Confirm the reading.');}
  else if(v1>=URGENT){state='alert';notes.push('High fever. This patient will show as Urgent on the doctor’s list.');}
  else if(v1>=THRESH){state='warn';notes.push('Fever (38.0 °C or higher). The 3-day fever-free count restarts.');}
  else if(state==='ok'){notes.push('No fever (below 38.0 °C).');}
  if(prev&&Math.abs(v1-prev.t)>=2){confirm=true;if(state==='ok')state='warn';notes.push('Differs from the last reading ('+fmt(prev.t)+' °C) by '+fmt(Math.abs(v1-prev.t))+' °C. Check it belongs to this patient.');}
  return {state,msg:notes.join(' '),confirm,value:v1};
}

/* ---------- small html helpers ---------- */
const pill=(k,t)=>`<span class="pill ${k}">${esc(t)}</span>`;
function streakW(p){
  const s=streak(p), n=Math.min(s,3);
  return `<span class="streak ${s>=3?'done':''}" title="Fever-free days in a row">${[0,1,2].map(i=>`<i class="${i<n?'on':''}"></i>`).join('')}<span class="mono">${s>=3?s+'d':n+'/3'}</span></span>`;
}
function row(p,sub,meta){
  return `<button class="row" data-act="open" data-id="${p.id}"><span class="room"><small>Room</small><b class="mono">${p.room}</b></span><span class="who"><b>${esc(p.name)}</b><span class="sub">${sub}</span></span><span class="meta">${meta}</span><svg class="go" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>`;
}
const stay=p=>1-p.admittedDay;
const basics=p=>`${p.age} y · Day ${stay(p)} of stay`;
function tabsHTML(items,sel){
  return `<div class="tabs" role="tablist">${items.map(([id,label,n])=>`<button class="tab" role="tab" aria-selected="${id===sel}" data-act="tab" data-id="${id}">${label}${n===undefined?'':` <span class="n">${n}</span>`}</button>`).join('')}</div>`;
}
const stat=(k,v,s,cls)=>`<div class="stat"><span class="k">${k}</span><b class="v ${cls||''}">${v}</b><span class="s">${s}</span></div>`;
function toast(msg,kind){
  const t=$('#toast');t.textContent=msg;t.className='toast '+(kind||'');t.hidden=false;
  clearTimeout(ui.toastT);ui.toastT=setTimeout(()=>{t.hidden=true;},3800);
}
function hint(id,state,msg){const h=$(id);if(!h)return;h.className='hint '+state;h.textContent=msg;h.hidden=false;}

/* ---------- top bar and welcome ---------- */
function barHTML(){
  const mark='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="9.5" y="2" width="5" height="13" rx="2.5" fill="var(--accent)"/><circle cx="12" cy="18" r="4.5" fill="var(--accent)"/><rect x="11" y="8" width="2" height="9" fill="var(--surface)"/></svg>';
  let h=`<span class="brand">${mark}QuarantPulse</span><span class="spacer"></span>`;
  if(ui.role){
    h+=`<span class="chip"><b class="mono">${active().length}/${CAP}</b> beds</span><span class="chip"><b>${ROLES[ui.role].label}</b> · ${esc(ROLES[ui.role].name)}</span><button class="btn ghost" data-act="switch">Switch role</button>`;
  }
  return h;
}
function welcome(){
  const A=active();
  return `<section><div class="eyebrow">Quarantine and treatment centre · ${CAP} beds</div><h1>Choose your role</h1><p class="lede">Each role sees only what it needs. The ward below is demo data. This prototype has no sign-in; a live build would use staff IDs.</p></section>
  <section class="roles">${Object.keys(ROLES).map(k=>`<button class="rolecard" data-act="role" data-id="${k}"><h2>${ROLES[k].label}</h2><span class="who2">Signed in as ${esc(ROLES[k].name)}</span><p>${ROLES[k].blurb}</p><ul>${ROLES[k].acts.map(a=>`<li>${a}</li>`).join('')}</ul></button>`).join('')}</section>
  <section class="card"><p class="sub">Ward today: ${A.length} of ${CAP} beds in use, ${A.filter(p=>!todayTemp(p)).length} temperatures still due, ${A.filter(p=>p.status==='cleared').length} patients cleared and waiting for discharge.</p><div class="actions"><button class="btn" data-act="reset">Reset demo data</button></div></section>`;
}

/* ---------- nurse ---------- */
function nurseView(){
  const A=active(), done=A.filter(todayTemp).length, left=A.length-done, pct=A.length?Math.round(done/A.length*100):0;
  const tab=ui.tab.nurse;
  return `<section><h1>Temperature round</h1><p class="lede">${todayStr()} · ${left?left+' temperatures still to take':'Every patient has a reading for today'}</p></section>
  <section class="card"><div class="prog-top"><b class="mono">${done}</b> of <b class="mono">${A.length}</b> recorded<span class="mono">${pct}%</span></div><div class="meter"><i style="width:${pct}%"></i></div></section>
  ${tabsHTML([['pending','Temp due',left],['recorded','Recorded',done],['all','All rooms',A.length]],tab)}
  <div class="tools"><label class="sr" for="q">Search patients</label><input id="q" type="search" placeholder="Search name or room" value="${esc(ui.q)}" autocomplete="off"></div>
  <div class="list" id="list">${listHTML()}</div>`;
}

/* ---------- doctor ---------- */
function doctorView(){
  const A=active(), adm=A.filter(p=>p.status==='admitted');
  const c={ready:adm.filter(p=>stage(p)==='ready').length,await:adm.filter(p=>stage(p)==='await').length,visited:adm.filter(p=>stage(p)==='visited').length,eligible:adm.filter(canClear).length,cleared:A.filter(p=>p.status==='cleared').length};
  const tab=ui.tab.doctor;
  return `<section><h1>Ward round</h1><p class="lede">${todayStr()} · Urgent patients are listed first. A visit can be logged once the nurse has recorded the temperature.</p></section>
  ${tabsHTML([['ready','Ready to visit',c.ready],['await','Waiting for temp',c.await],['visited','Visited today',c.visited],['eligible','Eligible to clear',c.eligible],['cleared','Cleared',c.cleared]],tab)}
  <div class="tools"><label class="sr" for="q">Search patients</label><input id="q" type="search" placeholder="Search name or room" value="${esc(ui.q)}" autocomplete="off"></div>
  <div class="list" id="list">${listHTML()}</div>`;
}

function listHTML(){
  const q=ui.q.trim().toLowerCase();
  const match=p=>!q||p.name.toLowerCase().includes(q)||String(p.room).includes(q);
  let L=active().filter(match).sort(byRoom), tab=ui.tab[ui.role], rowFn;
  if(ui.role==='nurse'){
    if(tab==='pending')L=L.filter(p=>!todayTemp(p));
    else if(tab==='recorded')L=L.filter(todayTemp);
    rowFn=p=>{
      const t=todayTemp(p), last=lastReading(p);
      const sub=basics(p)+(last&&!t?` · last ${fmt(last.t)} °C ${dayLabel(last.day).toLowerCase()}`:'');
      const meta=(t?`<span class="temp ${t.t>=THRESH?'hot':'cool'}">${fmt(t.t)}°</span>${pill('ok','Recorded '+t.time)}`:`<span class="temp mute">${last?fmt(last.t)+'°':'–'}</span>${pill('warn','Temp due')}`)+(p.status==='cleared'?pill('neutral','Cleared'):'');
      return row(p,sub,meta);
    };
  } else {
    L=L.filter(p=>tab==='cleared'?p.status==='cleared':p.status==='admitted');
    if(tab==='ready')L=L.filter(p=>stage(p)==='ready').sort((a,b)=>(isUrgent(b)-isUrgent(a))||(todayTemp(b).t-todayTemp(a).t)||byRoom(a,b));
    else if(tab==='await')L=L.filter(p=>stage(p)==='await');
    else if(tab==='visited')L=L.filter(p=>stage(p)==='visited');
    else if(tab==='eligible')L=L.filter(canClear);
    rowFn=p=>{
      const t=todayTemp(p), st=stage(p), v=visitToday(p);
      let pl;
      if(st==='cleared')pl=pill('ok','Cleared');
      else if(st==='await')pl=pill('neutral','Waiting for temp');
      else if(st==='visited')pl=pill('ok','Visited '+v.time);
      else pl=isUrgent(p)?pill('danger','Urgent'):pill('info','Ready to visit');
      const tm=t?`<span class="temp ${t.t>=THRESH?'hot':'cool'}">${fmt(t.t)}°</span>`:`<span class="temp mute">–</span>`;
      return row(p,basics(p),tm+streakW(p)+pl);
    };
  }
  if(!L.length){
    const msg=q?'No patients match your search.':tab==='pending'?'All done. Every patient has a temperature recorded today.':tab==='ready'?'Nobody is waiting for a visit right now.':tab==='await'?'Every patient has a temperature recorded.':'Nothing here yet.';
    return `<div class="empty">${msg}</div>`;
  }
  return L.map(rowFn).join('');
}

/* ---------- admin ---------- */
function banner(){
  const r=rate();
  if(r>BENCH)return `<div class="banner danger" role="alert"><b>Mortality rate is ${r.toFixed(1)}%, above the ${BENCH}% benchmark.</b> Review treatment protocols with the doctors.</div>`;
  if(r>=BENCH-3)return `<div class="banner warn"><b>Mortality rate is ${r.toFixed(1)}%.</b> It is within 3 points of the ${BENCH}% benchmark.</div>`;
  return '';
}
function adminView(){
  const A=active(), cleared=A.filter(p=>p.status==='cleared'), waiting=A.filter(p=>p.status==='admitted'&&streak(p)>=3), r=rate();
  const tab=ui.tab.admin;
  const stats=`<section class="stats">${stat('Beds in use',`${A.length}/${CAP}`,(CAP-A.length)+' free')}${stat('Cleared, waiting',cleared.length,'Ready to discharge')}${stat('Fever-free 3+ days',waiting.length,'Not yet cleared by a doctor',waiting.length?'warn':'')}${stat('Mortality rate',r.toFixed(1)+'%','Benchmark '+BENCH+'% · closed cases',r>BENCH?'hot':r>=BENCH-3?'warn':'')}</section>`;
  let body='';
  if(tab==='queue')body=queueHTML(cleared,waiting);
  else if(tab==='beds')body=bedsHTML();
  else if(tab==='admit')body=admitHTML();
  else body=outcomesHTML();
  return `<section><h1>Ward administration</h1><p class="lede">${todayStr()}</p></section>${banner()}${stats}${tabsHTML([['queue','Discharge queue',cleared.length],['beds','Bed map'],['admit','Admit patient'],['outcomes','Outcomes']],tab)}${body}`;
}
function queueHTML(cleared,waiting){
  cleared=cleared.slice().sort((a,b)=>(a.clearedDay-b.clearedDay)||byRoom(a,b));
  waiting=waiting.slice().sort((a,b)=>(streak(b)-streak(a))||byRoom(a,b));
  const c=cleared.map(p=>{
    const armed=ui.armed==='d'+p.id;
    return `<div class="row static"><span class="room"><small>Room</small><b class="mono">${p.room}</b></span><span class="who"><button class="link" data-act="open" data-id="${p.id}">${esc(p.name)}</button><span class="sub">Cleared ${dayLabel(p.clearedDay).toLowerCase()} · ${basics(p)}</span></span><span class="meta">${p.clearedDay<0?pill('warn','Waiting since yesterday'):pill('info','Cleared today')}<button class="btn ${armed?'danger':'primary'}" data-act="discharge" data-id="${p.id}">${armed?'Confirm discharge':'Discharge'}</button></span></div>`;
  }).join('')||'<div class="empty">No one is waiting for discharge.</div>';
  const w=waiting.map(p=>{
    const s=streak(p), extra=s-3;
    return `<div class="row static"><span class="room"><small>Room</small><b class="mono">${p.room}</b></span><span class="who"><button class="link" data-act="open" data-id="${p.id}">${esc(p.name)}</button><span class="sub">Fever-free ${s} days · ${extra>0?extra+(extra===1?' day':' days')+' past eligibility':'eligible today'}</span></span><span class="meta">${pill('warn','Waiting on doctor')}</span></div>`;
  }).join('')||'<div class="empty">No patients are waiting for doctor clearance.</div>';
  return `<section class="sec"><div class="sec-h"><h2>Cleared for discharge</h2><span class="sub">${cleared.length} patients</span></div><div class="list">${c}</div></section>
  <section class="sec"><div class="sec-h"><h2>Fever-free 3+ days, not cleared yet</h2><span class="sub">${waiting.length} patients</span></div><div class="list">${w}</div></section>`;
}
function bedsHTML(){
  const used={};active().forEach(p=>{used[p.room]=p;});
  let cells='';
  for(let n=1;n<=CAP;n++){
    const p=used[n];
    if(!p){cells+=`<button class="bed free" data-act="pickroom" data-id="${n}"><b>${n}</b><span>Free</span></button>`;continue;}
    const st=stage(p);
    const k=st==='cleared'?['cleared','Cleared']:isUrgent(p)&&st!=='visited'?['urgent','Urgent']:st==='await'?['due','Temp due']:st==='visited'?['visited','Visited']:['temp','Temp done'];
    cells+=`<button class="bed ${k[0]}" data-act="open" data-id="${p.id}"><b>${n}</b><span>${k[1]}</span></button>`;
  }
  return `<section class="sec"><div class="legend"><span><i class="due"></i>Temp due</span><span><i class="temp"></i>Temp done</span><span><i class="urgent"></i>Urgent</span><span><i class="visited"></i>Visited</span><span><i class="cleared"></i>Cleared</span><span><i class="free"></i>Free</span></div><div class="beds">${cells}</div></section>`;
}
function admitHTML(){
  const free=freeRooms();
  if(!free.length)return `<section class="card"><h2>All ${CAP} beds are occupied</h2><p class="lede" style="margin-top:6px">Discharge a cleared patient to free a bed, then admit the next patient.</p><div class="actions"><button class="btn primary" data-act="tab" data-id="queue">Go to discharge queue</button></div></section>`;
  const sel=free.includes(ui.admitRoom)?ui.admitRoom:free[0];
  return `<section class="card"><h2>Admit a patient</h2><p class="lede" style="margin-top:4px">${free.length} ${free.length===1?'bed is':'beds are'} free. The first temperature is due on the day of admission.</p>
  <div class="formgrid"><div class="field"><label for="a-name">Full name</label><input id="a-name" autocomplete="off"></div><div class="field"><label for="a-age">Age in years</label><input id="a-age" type="number" inputmode="numeric" min="1" max="110"></div><div class="field"><label for="a-room">Room</label><select id="a-room">${free.map(n=>`<option value="${n}"${n===sel?' selected':''}>Room ${n}</option>`).join('')}</select></div></div>
  <div id="aerr" class="hint" hidden></div><div class="actions"><button class="btn primary" data-act="admit">Admit patient</button></div></section>`;
}
function outcomesHTML(){
  const o=S.outcomes, closed=o.recovered+o.deceased, r=rate(), cls=r>BENCH?'danger':r>=BENCH-3?'warn':'ok';
  const log=S.log.length?`<ul class="log">${S.log.map(l=>`<li><span class="mono">${l.time}</span><span>${esc(l.text)}</span></li>`).join('')}</ul>`:'<div class="empty">Clearances, discharges, admissions and deaths recorded in this session appear here.</div>';
  return `<section class="stats">${stat('Recovered',o.recovered,'Discharged, last 30 days')}${stat('Deceased',o.deceased,'Last 30 days')}${stat('Success rate',(closed?100-r:0).toFixed(1)+'%','Benchmark 85%')}</section>
  <section class="card"><h2>Mortality against the ${BENCH}% benchmark</h2><div class="gauge" role="img" aria-label="Mortality ${r.toFixed(1)} percent, benchmark ${BENCH} percent"><div class="fill ${cls}" style="width:${Math.min(100,r/30*100)}%"></div><div class="mark"><span>${BENCH}% benchmark</span></div></div><div class="scale"><span>0%</span><span>30%</span></div><p class="sub" style="margin-top:10px">${closed} closed cases. Mortality is deaths divided by deaths plus discharges. It rises each time the doctor records a death and falls as patients are discharged.</p></section>
  <section class="card"><h2>Activity this session</h2>${log}</section>`;
}

/* ---------- patient panel ---------- */
function chart(p){
  const r=p.temps.slice().sort((a,b)=>a.day-b.day).slice(-10);
  if(!r.length)return '<p class="sub">No readings yet. The first reading is due today.</p>';
  const W=420,H=190,L=36,R=16,T=26,B=30,lo=35,hi=41;
  const X=i=>r.length===1?(L+W-R)/2:L+(W-L-R)*i/(r.length-1);
  const Y=v=>T+(H-T-B)*(1-(Math.min(hi,Math.max(lo,v))-lo)/(hi-lo));
  let g='';
  [36,38,40].forEach(v=>{g+=`<line x1="${L}" x2="${W-R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="${v===38?'thr':'grid'}"/><text x="${L-6}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end" class="ax">${v}</text>`;});
  const pts=r.map((t,i)=>X(i).toFixed(1)+','+Y(t.t).toFixed(1)).join(' ');
  let d=r.length>1?`<polyline points="${pts}" fill="none" class="ln"/>`:'';
  r.forEach((t,i)=>{d+=`<circle cx="${X(i).toFixed(1)}" cy="${Y(t.t).toFixed(1)}" r="${i===r.length-1?5:3.5}" class="${t.t>=THRESH?'pt hot':'pt'}"/>`;});
  const last=r[r.length-1];
  d+=`<text x="${X(r.length-1).toFixed(1)}" y="${(Y(last.t)-10).toFixed(1)}" text-anchor="end" class="val">${fmt(last.t)}</text>`;
  const lab=t=>t.day===0?'Today':t.day+'d';
  let xl=r.length>1?`<text x="${X(0).toFixed(1)}" y="${H-8}" text-anchor="start" class="ax">${lab(r[0])}</text><text x="${X(r.length-1).toFixed(1)}" y="${H-8}" text-anchor="end" class="ax">${lab(last)}</text>`:`<text x="${X(0).toFixed(1)}" y="${H-8}" text-anchor="middle" class="ax">${lab(last)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Temperature trend with 38 degree fever line">${g}<text x="${L+4}" y="${(Y(38)-5).toFixed(1)}" class="ax">fever 38.0</text>${d}${xl}</svg>`;
}
function readingsHTML(p){
  const r=p.temps.slice().sort((a,b)=>b.day-a.day).slice(0,6);
  if(!r.length)return '';
  return `<h3>Recent readings</h3><div class="tbl"><table><thead><tr><th>Day</th><th>Temp</th><th>Time</th><th>By</th></tr></thead><tbody>${r.map(t=>`<tr><td>${dayLabel(t.day)}</td><td class="mono ${t.t>=THRESH?'hot':''}">${fmt(t.t)} °C</td><td class="mono">${t.time}</td><td>${esc(t.by)}${t.corrected?' '+pill('neutral','corrected'):''}</td></tr>`).join('')}</tbody></table></div>`;
}
function visitsHTML(p){
  if(!p.visits.length)return '';
  const v=p.visits.slice().sort((a,b)=>b.day-a.day).slice(0,3);
  return `<h3>Doctor visits</h3><ul class="visits">${v.map(x=>`<li><b>${dayLabel(x.day)} ${x.time}</b> · ${esc(x.by)}<br><span class="sub">${esc(x.note)}</span></li>`).join('')}</ul>`;
}
function panelHead(p){
  const st=stage(p), pills=[];
  if(p.status==='cleared')pills.push(pill('ok','Cleared for discharge'));
  if(isUrgent(p))pills.push(pill('danger','Urgent'));
  if(!todayTemp(p))pills.push(pill('warn','Temp due'));
  if(visitToday(p))pills.push(pill('ok','Visited today'));
  return `<div class="p-top"><div><div class="p-room mono">Room ${p.room}</div><h2>${esc(p.name)}</h2><p class="sub">${basics(p)}</p></div><button class="btn ghost" data-act="close">Close</button></div><div class="p-pills">${pills.join('')}</div>`;
}
function panelFacts(p){
  const t=todayTemp(p), s=streak(p), v=visitToday(p);
  return `<div class="facts"><div class="fact"><span class="k">Today</span><span class="v ${t?(t.t>=THRESH?'hot':'cool'):''}">${t?fmt(t.t)+'°':'Not taken'}</span></div><div class="fact"><span class="k">Fever-free</span><span class="v ${s>=3?'cool':''}">${s>=3?s+' days':Math.min(s,3)+' of 3'}</span></div><div class="fact"><span class="k">Visit</span><span class="v">${v?v.time:'Not yet'}</span></div></div>`;
}
function recCard(t){
  return `<div class="rec"><span class="mono big ${t.t>=THRESH?'hot':'cool'}">${fmt(t.t)} °C</span><span class="sub">Recorded at ${t.time} by ${esc(t.by)}${t.corrected?' · corrected from '+fmt(t.corrected.from)+' °C ('+esc(t.corrected.reason).toLowerCase()+')':''}</span></div>`;
}
function nurseSection(p){
  const t=todayTemp(p);
  if(!t){
    return `<h3>Record today’s temperature</h3><div class="field"><label for="tin">Temperature in °C</label><input id="tin" type="number" inputmode="decimal" step="0.1" placeholder="37.4" autocomplete="off"></div><div id="thint" class="hint" aria-live="polite"></div><div class="actions"><button class="btn primary" id="tsave" data-act="savetemp">Save reading</button><button class="btn" data-act="savetemp-next">Save and next patient</button></div>`;
  }
  if(visitToday(p)){
    return `<h3>Today’s reading</h3>${recCard(t)}<div class="note">This reading is locked because the doctor has already visited today. Ask the doctor to review it if it is wrong.</div>`;
  }
  return `<h3>Today’s reading</h3>${recCard(t)}<div class="note">A second reading today is not needed. If this one is wrong, correct it below before the doctor visits.</div><details><summary>Correct this reading</summary><div class="field"><label for="tin">Corrected temperature in °C</label><input id="tin" type="number" inputmode="decimal" step="0.1" autocomplete="off"></div><div class="field"><label for="treason">Reason</label><select id="treason"><option value="">Choose a reason</option><option>Typing error</option><option>Wrong patient</option><option>Thermometer fault</option></select></div><div id="thint" class="hint" aria-live="polite"></div><div class="actions"><button class="btn primary" id="tsave" data-act="savecorrect">Save correction</button></div></details>`;
}
function doctorSection(p){
  const t=todayTemp(p), v=visitToday(p);
  if(p.status==='cleared')return `<h3>Discharge</h3><div class="note">Cleared ${dayLabel(p.clearedDay).toLowerCase()}. The admin discharges the patient and frees the room.</div>`;
  let h=`<h3>Today’s visit</h3>`;
  if(!t){
    h+=`<div class="note warn">The nurse has not recorded a temperature yet. You can log the visit once there is a reading.</div>`;
  } else if(v){
    h+=`<div class="note"><b>Visited at ${v.time}.</b><br>${esc(v.note)}</div>`;
    if(canClear(p))h+=`<div class="actions"><button class="btn primary" data-act="clear">Clear for discharge</button></div>`;
    else h+=`<p class="sub" style="margin-top:8px">${streak(p)>=3?'':'Not eligible yet: '+Math.min(streak(p),3)+' of 3 fever-free days.'}</p>`;
  } else {
    const ok=canClear(p);
    h+=`<div class="field"><label for="vnote">Treatment note</label><textarea id="vnote" rows="3" placeholder="For example: continue IV fluids, review tomorrow"></textarea></div><div id="verr" class="hint" hidden></div><div class="actions"><button class="btn ${ok?'':'primary'}" data-act="savevisit">Save visit</button>${ok?'<button class="btn primary" data-act="savevisitclear">Save visit and clear for discharge</button>':''}</div>`;
    if(!ok)h+=`<p class="sub" style="margin-top:8px">Clearing unlocks after 3 fever-free days in a row. Now at ${Math.min(streak(p),3)} of 3.</p>`;
  }
  if(p.status==='admitted'){
    h+=`<h3>Outcome</h3>`;
    if(ui.armed==='death')h+=`<div class="note danger"><b>Record the death of ${esc(p.name)}?</b> This closes the case, frees room ${p.room} and counts toward the mortality rate. It cannot be undone here.<div class="actions"><button class="btn danger" data-act="death-yes">Confirm</button><button class="btn" data-act="death-no">Cancel</button></div></div>`;
    else h+=`<button class="btn" data-act="death">Record death</button>`;
  }
  return h;
}
function adminSection(p){
  return `<div class="note">Read-only for admin. ${p.status==='cleared'?'Use the discharge queue to discharge this patient.':'Discharge opens after the doctor clears the patient.'}</div>`;
}
function renderPanel(){
  const p=cur(), ov=$('#ov'), pn=$('#panel');
  if(!p||!ui.role||!(p.status==='admitted'||p.status==='cleared')){ov.hidden=true;pn.hidden=true;return;}
  ov.hidden=false;pn.hidden=false;
  const sec=ui.role==='nurse'?nurseSection(p):ui.role==='doctor'?doctorSection(p):adminSection(p);
  const tr=`<h3>Temperature trend</h3>${chart(p)}`;
  pn.innerHTML=panelHead(p)+panelFacts(p)+(ui.role==='doctor'?tr+sec:sec+tr)+readingsHTML(p)+visitsHTML(p);
}

/* ---------- actions ---------- */
function render(){
  $('#bar').innerHTML=barHTML();
  $('#app').innerHTML=ui.role?(ui.role==='nurse'?nurseView():ui.role==='doctor'?doctorView():adminView()):welcome();
  renderPanel();
}
function setSaveLabel(){
  const b=$('#tsave');if(!b)return;
  b.textContent=ui.confirmed?'Confirm and save':(b.dataset.act==='savecorrect'?'Save correction':'Save reading');
}
function onTemp(){
  ui.confirmed=false;
  const p=cur(), v=$('#tin').value;
  if(p&&String(v).trim()!==''){const r=evalTemp(v,p);hint('#thint',r.state,r.msg);}
  else hint('#thint','','');
  setSaveLabel();
}
function nextPending(p){
  const L=active().filter(q=>!todayTemp(q)&&q.id!==p.id).sort(byRoom);
  return L.find(q=>q.room>p.room)||L[0]||null;
}
function saveTemp(mode){
  if(ui.role!=='nurse')return;
  const p=cur();if(!p||p.status==='deceased'||p.status==='discharged')return;
  const r=evalTemp($('#tin').value,p);
  if(r.state==='err'){hint('#thint','err',r.msg);$('#tin').focus();return;}
  if(mode==='correct'){
    const reason=$('#treason').value;
    if(!reason){hint('#thint','err','Choose a reason for the correction.');return;}
  }
  if(r.confirm&&!ui.confirmed){ui.confirmed=true;hint('#thint',r.state,r.msg+' Select the button again to confirm.');setSaveLabel();return;}
  ui.confirmed=false;
  if(mode==='correct'){
    const t=todayTemp(p);
    if(!t||visitToday(p)){toast('This reading is locked.','err');render();return;}
    t.corrected={from:t.t,reason:$('#treason').value,by:ROLES.nurse.name};
    t.t=r.value;t.time=nowTime();t.by=ROLES.nurse.name;
    addLog('Room '+p.room+' reading corrected to '+fmt(r.value)+' °C ('+t.corrected.reason.toLowerCase()+')');
    save();render();toast('Reading corrected to '+fmt(r.value)+' °C.');return;
  }
  const dup=todayTemp(p);
  if(dup){toast('Already recorded today at '+dup.time+'.','err');render();return;}
  p.temps.push({day:0,t:r.value,time:nowTime(),by:ROLES.nurse.name});
  save();
  const msg=r.value>=URGENT?'Saved '+fmt(r.value)+' °C. Room '+p.room+' is marked Urgent for the doctor.':'Saved '+fmt(r.value)+' °C for room '+p.room+'.';
  const nx=mode==='next'?nextPending(p):null;
  if(mode==='next'){
    ui.open=nx?nx.id:null;
    render();
    toast(nx?msg:msg+' Round complete.',r.value>=URGENT?'warn':'');
    if(nx)setTimeout(()=>{const f=$('#tin');if(f)f.focus();},30);
  } else {
    render();toast(msg,r.value>=URGENT?'warn':'');
  }
}
function saveVisit(clear){
  if(ui.role!=='doctor')return;
  const p=cur();if(!p||p.status!=='admitted')return;
  if(!todayTemp(p)){hint('#verr','err','The temperature is not recorded yet. Wait for the nurse.');return;}
  if(visitToday(p)){toast('Already visited today.','err');render();return;}
  const note=$('#vnote').value.trim();
  if(note.length<3){hint('#verr','err','Add a treatment note before saving the visit.');$('#vnote').focus();return;}
  if(clear&&!canClear(p)){hint('#verr','err','This patient has not had 3 fever-free days in a row.');return;}
  p.visits.push({day:0,time:nowTime(),by:ROLES.doctor.name,note});
  if(clear){p.status='cleared';p.clearedDay=0;addLog('Room '+p.room+' ('+p.name+') cleared for discharge');}
  save();render();
  toast(clear?'Visit saved. Room '+p.room+' is cleared for discharge.':'Visit saved for room '+p.room+'.');
}
function clearPatient(){
  if(ui.role!=='doctor')return;
  const p=cur();if(!p)return;
  if(!visitToday(p)||!canClear(p)){toast('Log today’s visit and confirm 3 fever-free days first.','err');return;}
  p.status='cleared';p.clearedDay=0;
  addLog('Room '+p.room+' ('+p.name+') cleared for discharge');
  save();render();toast('Room '+p.room+' is cleared for discharge.');
}
function recordDeath(){
  if(ui.role!=='doctor')return;
  const p=cur();if(!p||p.status!=='admitted')return;
  p.status='deceased';S.outcomes.deceased++;
  addLog('Room '+p.room+' ('+p.name+') death recorded');
  ui.open=null;ui.armed=null;save();render();
  toast('Outcome recorded. Room '+p.room+' is free.','warn');
}
function discharge(id){
  if(ui.role!=='admin')return;
  const p=S.patients.find(x=>x.id===id);
  if(!p||p.status!=='cleared'){toast('Only cleared patients can be discharged.','err');return;}
  if(ui.armed!=='d'+id){ui.armed='d'+id;render();return;}
  p.status='discharged';S.outcomes.recovered++;ui.armed=null;
  addLog('Room '+p.room+' ('+p.name+') discharged');
  save();render();toast('Discharged. Room '+p.room+' is free.');
}
function admit(){
  if(ui.role!=='admin')return;
  const name=$('#a-name').value.trim().replace(/\s+/g,' '), age=Number($('#a-age').value), room=Number($('#a-room').value);
  const fail=m=>hint('#aerr','err',m);
  if(name.length<2)return fail('Enter the patient’s full name.');
  if(!Number.isInteger(age)||age<1||age>110)return fail('Enter an age between 1 and 110.');
  if(!freeRooms().includes(room))return fail('That room is no longer free. Choose another room.');
  if(active().some(p=>p.name.toLowerCase()===name.toLowerCase()&&p.age===age))return fail('A patient with this name and age is already admitted.');
  S.patients.push({id:S.nextId++,name,age,room,admittedDay:0,temps:[],visits:[],status:'admitted',clearedDay:null});
  addLog('Admitted '+name+' to room '+room);
  ui.admitRoom=null;save();render();
  toast('Admitted '+name+' to room '+room+'. First temperature is due today.');
}
function act(a,id){
  if(a!=='discharge'&&a!=='death')ui.armed=null;
  switch(a){
    case 'role':ui.role=id;ui.open=null;ui.q='';render();break;
    case 'switch':ui.role=null;ui.open=null;ui.q='';render();break;
    case 'tab':ui.tab[ui.role]=id;ui.q='';render();break;
    case 'open':ui.open=Number(id);ui.confirmed=false;renderPanel();setTimeout(()=>{const f=$('#tin')||$('#vnote');if(f)f.focus();},30);break;
    case 'close':ui.open=null;ui.confirmed=false;renderPanel();break;
    case 'savetemp':saveTemp('new');break;
    case 'savetemp-next':saveTemp('next');break;
    case 'savecorrect':saveTemp('correct');break;
    case 'savevisit':saveVisit(false);break;
    case 'savevisitclear':saveVisit(true);break;
    case 'clear':clearPatient();break;
    case 'death':ui.armed='death';renderPanel();break;
    case 'death-yes':recordDeath();break;
    case 'death-no':ui.armed=null;renderPanel();break;
    case 'discharge':discharge(Number(id));break;
    case 'admit':admit();break;
    case 'pickroom':ui.admitRoom=Number(id);ui.tab.admin='admit';render();break;
    case 'reset':S=makeSeed();save();ui.open=null;render();toast('Demo data reset.');break;
  }
}
document.addEventListener('click',e=>{
  const el=e.target.closest?e.target.closest('[data-act]'):null;
  if(el){act(el.dataset.act,el.dataset.id);return;}
  if(e.target.id==='ov'){ui.open=null;renderPanel();}
});
document.addEventListener('input',e=>{
  const id=e.target.id;
  if(id==='tin')onTemp();
  else if(id==='q'){ui.q=e.target.value;const l=$('#list');if(l)l.innerHTML=listHTML();}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(ui.armed){ui.armed=null;render();}else if(ui.open){ui.open=null;renderPanel();}}
  else if(e.key==='Enter'&&e.target&&e.target.id==='tin'){const b=$('#tsave');saveTemp(b&&b.dataset.act==='savecorrect'?'correct':'new');}
});
render();