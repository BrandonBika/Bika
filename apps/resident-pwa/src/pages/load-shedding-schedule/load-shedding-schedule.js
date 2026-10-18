const ESP_TOKEN = "PASTE_YOUR_TOKEN_HERE";
const BASE = "https://developer.sepush.co.za/business/2.0";

// Generic SA hierarchy - Province > Municipality/Town > Suburb - works for all SA
const SA_DATA = {
  "Gauteng": {"Tshwane": ["Centurion","Mamelodi","Atteridgeville","Soshanguve","Ga-Rankuwa"], "Johannesburg": ["Soweto","Sandton","Midrand","Roodepoort","Randburg"], "Ekurhuleni": ["Tembisa","Katlehong","Boksburg","Benoni"]},
  "Limpopo": {"Polokwane": ["Polokwane Central","Seshego","Mankweng"], "Vhembe": ["Thohoyandou","Musina","Louis Trichardt"], "Mopani": ["Tzaneen","Giyani"]},
  "Mpumalanga": {"Mbombela": ["Mbombela Central","Nelspruit","White River","Hazyview"], "Nkangala": ["Witbank","Middelburg MP","Secunda"]},
  "KwaZulu-Natal": {"eThekwini": ["Durban Central","Umlazi","Pinetown","Chatsworth"], "Msunduzi": ["Pietermaritzburg","Imbali"], "King Cetshwayo": ["Richards Bay","Empangeni"]},
  "Western Cape": {"City of Cape Town": ["City Bowl","Khayelitsha","Mitchells Plain","Wynberg"], "Cape Winelands": ["Stellenbosch","Paarl"], "Garden Route": ["George","Knysna"]},
  "Eastern Cape": {"Nelson Mandela Bay": ["Gqeberha","Uitenhage","Motherwell"], "Buffalo City": ["East London","Mdantsane"]},
  "Free State": {"Mangaung": ["Bloemfontein","Botshabelo","Thaba Nchu"], "Fezile Dabi": ["Sasolburg","Parys"]},
  "North West": {"Bojanala": ["Rustenburg","Brits","Madikwe"], "Dr Kenneth Kaunda": ["Potchefstroom","Klerksdorp"]},
  "Northern Cape": {"Frances Baard": ["Kimberley","Galeshewe"], "ZF Mgcawu": ["Upington"]}
};

let state = {province:null, municipality:null, suburb:null, block:null, areaId:null, expanded:false};
const els = {prov:document.getElementById('valProvince'), muni:document.getElementById('valMunicipality'), sub:document.getElementById('valSuburb'), block:document.getElementById('valBlock'), dd:document.getElementById('dropdown'), status:document.getElementById('status'), wrap:document.getElementById('scheduleWrap'), stageText:document.getElementById('stageText'), q:document.getElementById('q')};

lucide.createIcons();

async function loadStage(){ try{ const r=await fetch(`${BASE}/status`,{headers:{'token':ESP_TOKEN}}); const j=await r.json(); const s=j.status.eskom.stage; els.stageText.textContent=s?`Stage ${s} · Active`:'No Loadshedding'; }catch{ els.stageText.textContent='Live • ESP'; } }

function openDropdown(key, items){
  if(!items.length){ els.dd.classList.add('hidden'); return; }
  els.dd.classList.remove('hidden');
  els.dd.innerHTML=items.map(i=>`<div data-k="${1787A738-457D405B-8C6CEE56-7BF7070F}" data-v="${i}">${i}</div>`).join('');
  [...els.dd.children].forEach(c=>c.onclick=()=>{ setVal(c.dataset.k, c.dataset.v); els.dd.classList.add('hidden'); });
}
function setVal(k,v){
  state[k]=v;
  if(k==='province') els.prov.textContent=v;
  if(k==='municipality') els.muni.textContent=v;
  if(k==='suburb') els.sub.textContent=v;
  if(k==='block') els.block.textContent=v;
  localStorage.setItem('bika_'+k, v);
  // Auto search ESP for real area when suburb or block picked
  if(k==='suburb' || k==='block') liveSearch(v);
}

async function liveSearch(q){
  if(!q || q.length<2) return;
  els.status.textContent=`Searching ESP for "${q}" anywhere in SA...`;
  try{
    const r=await fetch(`${BASE}/areas_search?text=${encodeURIComponent(q)}`,{headers:{'token':ESP_TOKEN}});
    const j=await r.json();
    if(j.areas?.length){
      els.dd.classList.remove('hidden');
      els.dd.innerHTML=j.areas.slice(0,10).map(a=>`<div onclick="window.loadArea('${a.id}','${a.name.replace(/'/g,'')}')"><b>${a.name}</b><br><small style="color:var(--muted)">${a.region} • ${a.id}</small></div>`).join('');
      lucide.createIcons();
      els.status.textContent=`Found ${j.areas.length} areas in SA - tap to load`;
    }
  }catch{ els.status.textContent=`Offline - search needs ESP token`; }
}

window.loadArea = async function(id, name){
  state.areaId=id; localStorage.setItem('bika_area_id',id); localStorage.setItem('bika_area_name',name);
  els.status.textContent=`Loading ${name}...`; els.dd.classList.add('hidden');
  els.muni.textContent=name.split(' ')[0]; els.sub.textContent=name; els.block.textContent=name;
  try{
    const r=await fetch(`${BASE}/area?id=${id}`,{headers:{'token':ESP_TOKEN}});
    const j=await r.json();
    renderReal(j, name);
  }catch{ renderMock(name); }
}

function renderReal(data, name){
  const events=data.events||[]; const grouped={}; events.forEach(ev=>{ const d=ev.date; if(!grouped[d]) grouped[d]=[]; grouped[d].push(ev); });
  let html=""; const dates=Object.keys(grouped).slice(0, state.expanded?5:1);
  if(!dates.length){ html=`<div style="padding:12px;font-size:13px">No loadshedding for ${name} today</div>`; }
  else{ dates.forEach(date=>{ html+=`<div style="padding:10px 16px 4px;font-size:12px;font-weight:600;color:var(--teal)">${date}</div>`; html+=grouped[date].map(ev=>`<div class="slot"><div class="icon"><i data-lucide="clock" style="width:16px"></i></div><b>${(ev.start||'').slice(11,16)}–${(ev.end||'').slice(11,16)}</b><span class="badge">${ev.note||'Scheduled'}</span></div>`).join(''); }); }
  els.wrap.innerHTML=html; lucide.createIcons(); els.status.textContent=`✓ Live ESP • ${name} • ${data.info?.region||''}`;
}
function renderMock(name="Select area"){ els.wrap.innerHTML=`<div style="padding:12px;font-size:13px;color:var(--muted)">Select Province > Town > Suburb, or search any suburb in SA, or use current location. ESP will load live times for ${name}.</div>`; }

async function useCurrentLocation(){
  els.status.textContent="Getting location (same as Report page)...";
  navigator.geolocation.getCurrentPosition(async pos=>{
    els.status.textContent=`${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)} - searching ESP nearby`;
    try{ const r=await fetch(`${BASE}/areas_nearby?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`,{headers:{'token':ESP_TOKEN}}).then(x=>x.json()); if(r.areas?.length){ els.dd.classList.remove('hidden'); els.dd.innerHTML=r.areas.slice(0,6).map(a=>`<div onclick="window.loadArea('${a.id}','${a.name}')"><b>${a.name}</b><br><small>${Math.round(a.distance)}m away • ${a.region}</small></div>`).join(''); lucide.createIcons(); els.status.textContent="Nearest 6 areas in SA"; } }catch{ els.status.textContent="Add token for live nearby"; }
  });
}

// Listeners
document.getElementById('selProvince').onclick=()=>openDropdown('province', Object.keys(SA_DATA));
document.getElementById('selMunicipality').onclick=()=>{ const p=SA_DATA[state.province]; openDropdown('municipality', p?Object.keys(p):[]); };
document.getElementById('selSuburb').onclick=()=>{ const m=SA_DATA[state.province]?.[state.municipality]; openDropdown('suburb', m||[]); };
document.getElementById('selBlock').onclick=()=>openDropdown('block', ["Block search via ESP - type in search box"]);
document.getElementById('toggleSched').onclick=()=>{ state.expanded=!state.expanded; document.getElementById('footHint').textContent=state.expanded?"Show less ∧":"Show 5 days ∨"; if(state.areaId) window.loadArea(state.areaId, localStorage.getItem('bika_area_name')); };
document.getElementById('locBtn').onclick=useCurrentLocation;
els.q.addEventListener('input', e=>liveSearch(e.target.value));

loadStage();
const sid=localStorage.getItem('bika_area_id'); const sname=localStorage.getItem('bika_area_name');
if(sid) window.loadArea(sid, sname); else renderMock();