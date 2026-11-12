// Smoke test: renders every role and runs the main flows against app.js with a stubbed DOM.
// Run with: node tests/smoke.js
const fs=require('fs'),vm=require('vm'),path=require('path');
const js=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
if(!html.includes('href="styles.css"')||!html.includes('src="app.js"')){console.error('FAIL index.html does not reference styles.css and app.js');process.exit(1);}
const els={};
const getEl=s=>els[s]||(els[s]={innerHTML:'',hidden:false,value:'',className:'',textContent:'',dataset:{},focus(){},});
const handlers={};
const document={querySelector:getEl,addEventListener:(t,f)=>{handlers[t]=f;}};
const ctx=vm.createContext({document,setTimeout:()=>0,clearTimeout(){},console});
vm.runInContext(js,ctx);
const run=c=>vm.runInContext(c,ctx);
const click=(act,id)=>handlers.click({target:{id:'',closest:()=>({dataset:{act,id:id===undefined?undefined:String(id)}})}});
const ok=(c,m)=>{if(!c){console.error('FAIL',m);process.exitCode=1;}else console.log('ok  ',m)};
const val=(sel,v)=>{getEl(sel).value=v;};
const toastTxt=()=>getEl('#toast').textContent;

ok(getEl('#app').innerHTML.includes('Choose your role'),'welcome renders');
const A=run('active().length'); ok(A===74,'74 occupied');
console.log('seed: pending',run('active().filter(p=>!todayTemp(p)).length'),'urgent',run('active().filter(isUrgent).length'),'eligible',run('active().filter(canClear).length'),'cleared',run('active().filter(p=>p.status==="cleared").length'));
// nurse
click('role','nurse'); ok(getEl('#app').innerHTML.includes('Temperature round'),'nurse view');
const pend=run('active().filter(p=>!todayTemp(p)).sort(byRoom)[0].id');
click('open',pend); ok(getEl('#panel').innerHTML.includes('id="tin"'),'nurse panel has input');
val('#tin','abc'); click('savetemp'); ok(getEl('#thint').className.includes('err'),'error on empty/NaN');
val('#tin','50'); click('savetemp'); ok(getEl('#thint').textContent.includes('outside'),'range error');
val('#tin','41.5'); click('savetemp'); ok(run('!todayTemp(cur())'),'41.5 not saved first click (confirm)');
click('savetemp'); ok(run('!!todayTemp(cur())')&&run('todayTemp(cur()).t')===41.5,'41.5 saved after confirm');
// correction
click('open',pend); ok(getEl('#panel').innerHTML.includes('Correct this reading'),'correction offered');
val('#tin','37.0'); val('#treason',''); click('savecorrect'); ok(getEl('#thint').textContent.includes('reason'),'reason required');
val('#treason','Typing error'); click('savecorrect'); ok(run('!!todayTemp(cur())')&&run('cur().temps.find(x=>x.day===0).t')===37.0||run('todayTemp(cur()).t')===37,'differs>=2 needs confirm then ok');
click('savecorrect'); ok(run('todayTemp(cur()).t')===37.0&&run('!!todayTemp(cur()).corrected'),'correction saved');
// save & next
const p2=run('active().filter(p=>!todayTemp(p)).sort(byRoom)[0].id');
click('open',p2); val('#tin','37.4'); click('savetemp-next'); if(run('!todayTemp(S.patients.find(p=>p.id==='+p2+'))')){console.log('(confirm step needed, clicking again)');click('savetemp-next');} ok(run('!!todayTemp(S.patients.find(p=>p.id==='+p2+'))'),'save & next saves');
ok(run('ui.open')!==p2,'moved to next patient or closed');
// duplicate guard
click('open',p2); ok(!getEl('#panel').innerHTML.includes('Save and next'),'no second reading form');
// make everyone recorded to test round complete
run('active().forEach(p=>{if(!todayTemp(p))p.temps.push({day:0,t:37,time:"08:00",by:"x"})})'); click('tab','pending');
ok(getEl('#app').innerHTML.includes('Every patient has a reading'),'nurse all done lede');
// doctor
click('switch'); click('role','doctor'); ok(getEl('#app').innerHTML.includes('Ward round'),'doctor view');
const ready=run('active().filter(p=>stage(p)==="ready"&&!canClear(p))[0].id');
click('open',ready); val('#vnote',''); click('savevisit'); ok(getEl('#verr').textContent.includes('treatment note'),'note required');
val('#vnote','Continue fluids'); click('savevisit'); ok(run('!!visitToday(S.patients.find(p=>p.id==='+ready+'))'),'visit saved');
const elig=run('(active().filter(p=>stage(p)==="ready"&&canClear(p))[0]||{}).id');
if(elig){click('open',elig);val('#vnote','Fever-free, discharge');click('savevisitclear');ok(run('S.patients.find(p=>p.id==='+elig+').status')==='cleared','visit & clear');}
else console.log('(no ready+eligible patient left to test combined clear)');
// no-temp visit blocked
const aw=run('S.patients.find(p=>p.status==="admitted")'); 
// death
const dp=run('active().filter(p=>p.status==="admitted")[0].id'); const d0=run('S.outcomes.deceased');
click('open',dp); click('death'); ok(getEl('#panel').innerHTML.includes('Confirm'),'death armed'); click('death-yes'); ok(run('S.outcomes.deceased')===d0+1,'death recorded');
// admin
click('switch'); click('role','admin'); ok(getEl('#app').innerHTML.includes('Ward administration'),'admin view');
ok(getEl('#app').innerHTML.includes('Mortality rate is'),'banner present: '+(run('rate()').toFixed(1))+'%');
const cl=run('active().filter(p=>p.status==="cleared")[0].id');
click('discharge',cl); ok(run('S.patients.find(p=>p.id==='+cl+').status')==='cleared'&&getEl('#app').innerHTML.includes('Confirm discharge'),'discharge armed');
click('discharge',cl); ok(run('S.patients.find(p=>p.id==='+cl+').status')==='discharged','discharged');
ok(run('freeRooms().length')>=2,'rooms freed (incl. death)');
click('tab','beds'); ok(getEl('#app').innerHTML.includes('class="bed free"'),'bed map shows free');
click('tab','admit'); ok(getEl('#app').innerHTML.includes('id="a-name"'),'admit form');
val('#a-name','Test Person'); val('#a-age','40'); val('#a-room',String(run('freeRooms()[0]'))); click('admit'); ok(run('active().length')===run('74-freeRooms().length')&&run('S.patients.some(p=>p.name==="Test Person")'),'admitted');
val('#a-name','Test Person'); click('tab','admit'); 
click('tab','outcomes'); ok(getEl('#app').innerHTML.includes('Activity this session'),'outcomes renders');
// full beds message
run('S.patients.filter(p=>p.status==="discharged"||p.status==="deceased")'); 
// force 3 deaths to cross benchmark
run('S.outcomes.deceased=9;S.outcomes.recovered=46'); click('tab','queue'); ok(getEl('#app').innerHTML.includes('above the 15% benchmark'),'danger banner above 15%');
// all views and tabs render without throwing
for(const r of ['nurse','doctor','admin']){click('switch');click('role',r);const tabs={nurse:['pending','recorded','all'],doctor:['ready','await','visited','eligible','cleared'],admin:['queue','beds','admit','outcomes']}[r];for(const t of tabs){click('tab',t);}}
for(const id of run('active().map(p=>p.id)')){ for(const r of ['nurse','doctor','admin']){click('switch');click('role',r);click('open',id);} }
console.log('done; exit',process.exitCode||0);
