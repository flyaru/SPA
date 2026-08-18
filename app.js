const state={inventory:[],activity:[],airline:'ALL',status:'ALL',search:'',sortKey:'airline',sortDir:'asc',staff:null,movementMode:'ISSUE'};
const $=s=>document.querySelector(s);
const els={
  body:$('#inventoryBody'),cards:$('#inventoryCards'),activity:$('#activityBody'),notice:$('#notice'),search:$('#searchInput'),airline:$('#airlineFilter'),status:$('#statusFilter'),sort:$('#sortSelect'),
  profileDialog:$('#profileDialog'),profileForm:$('#profileForm'),movementDialog:$('#movementDialog'),movementForm:$('#movementForm'),newItemDialog:$('#newItemDialog'),newItemForm:$('#newItemForm'),
  movementItem:$('#movementItem'),movementAction:$('#movementAction'),movementQuantity:$('#movementQuantity'),numericFields:$('#numericFields'),statusFields:$('#statusFields'),newValueType:$('#newValueType'),newNumberFields:$('#newNumberFields'),newStatusFields:$('#newStatusFields')
};

document.addEventListener('DOMContentLoaded',()=>{restoreStaff();bindEvents();refreshProfileUI();loadAll();if(!state.staff)setTimeout(()=>els.profileDialog.showModal(),350);});

function bindEvents(){
  $('#refreshBtn').addEventListener('click',loadAll);
  $('#activityRefreshBtn').addEventListener('click',loadActivity);
  $('#profileBtn').addEventListener('click',openProfile);
  $('#receiveBtn').addEventListener('click',()=>openMovement('RECEIVE'));
  $('#issueBtn').addEventListener('click',()=>openMovement('ISSUE'));
  $('#newItemBtn').addEventListener('click',openNewItem);
  $('#clearFiltersBtn').addEventListener('click',clearFilters);
  els.search.addEventListener('input',e=>{state.search=e.target.value.trim().toLowerCase();renderInventory();});
  els.airline.addEventListener('change',e=>{state.airline=e.target.value;renderInventory();});
  els.status.addEventListener('change',e=>{state.status=e.target.value;renderInventory();});
  els.sort.addEventListener('change',e=>{const [key,dir]=e.target.value.split(':');state.sortKey=key;state.sortDir=dir;renderInventory();});
  document.querySelectorAll('.sort-head').forEach(btn=>btn.addEventListener('click',()=>toggleSort(btn.dataset.sort)));
  document.querySelectorAll('[data-summary-filter]').forEach(btn=>btn.addEventListener('click',()=>{state.status=btn.dataset.summaryFilter;els.status.value=state.status;renderInventory();document.querySelector('.inventory-panel').scrollIntoView({behavior:'smooth',block:'start'});}));
  document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>$('#'+btn.dataset.close).close()));
  document.querySelectorAll('[data-qty]').forEach(btn=>btn.addEventListener('click',()=>changeQty(Number(btn.dataset.qty))));
  document.querySelectorAll('[data-set-qty]').forEach(btn=>btn.addEventListener('click',()=>{els.movementQuantity.value=btn.dataset.setQty;}));
  els.profileForm.addEventListener('submit',saveProfileFromForm);
  els.movementItem.addEventListener('change',syncMovementItem);
  els.movementForm.addEventListener('submit',submitMovement);
  els.newValueType.addEventListener('change',syncNewItemType);
  els.newItemForm.addEventListener('submit',submitNewItem);
}

async function api(path='',options={}){
  const r=await fetch('/api/stock'+path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  let data;try{data=await r.json();}catch{throw new Error('Invalid server response');}
  if(!r.ok||data.ok===false)throw new Error(data.error||'Request failed');
  return data;
}

async function loadAll(){await Promise.allSettled([loadInventory(),loadActivity()]);}

async function loadInventory(){
  setNotice('');
  els.body.innerHTML='<tr><td colspan="7" class="loading-cell">Loading inventory…</td></tr>';
  els.cards.innerHTML='<div class="empty-state">Loading inventory…</div>';
  try{
    const data=await api('?action=inventory');
    state.inventory=(data.items||[]).filter(x=>x.active!==false);
    populateMovementItems();renderStats();renderInventory();
    $('#lastLoaded').textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  }catch(err){
    els.body.innerHTML='<tr><td colspan="7" class="loading-cell">Inventory could not be loaded.</td></tr>';
    els.cards.innerHTML='<div class="empty-state"><strong>Inventory unavailable</strong>'+escapeHtml(err.message)+'</div>';
    setNotice(err.message,true);
  }
}

async function loadActivity(){
  els.activity.innerHTML='<tr><td colspan="6" class="loading-cell">Loading recent activity…</td></tr>';
  try{
    const data=await api('?action=transactions&limit=12');
    state.activity=data.items||[];renderActivity();
  }catch(err){els.activity.innerHTML='<tr><td colspan="6" class="loading-cell">Activity will appear after the updated Apps Script is deployed.</td></tr>';}
}

function renderStats(){
  $('#statTotal').textContent=state.inventory.length;
  $('#statLow').textContent=state.inventory.filter(x=>stockStatus(x)==='LOW').length;
  $('#statOut').textContent=state.inventory.filter(x=>stockStatus(x)==='OUT').length;
}

function getVisibleRows(){
  const rows=state.inventory.filter(x=>state.airline==='ALL'||x.airline===state.airline)
    .filter(x=>state.status==='ALL'||stockStatus(x)===state.status)
    .filter(x=>!state.search||`${x.airline} ${x.item} ${x.remarks||''}`.toLowerCase().includes(state.search));
  return rows.sort((a,b)=>compareRows(a,b,state.sortKey,state.sortDir));
}

function compareRows(a,b,key,dir){
  let av,bv;
  if(key==='stock'){av=a.valueType==='NUMBER'?Number(a.stockValue):-1;bv=b.valueType==='NUMBER'?Number(b.stockValue):-1;}
  else if(key==='updated'){av=a.lastUpdated?new Date(a.lastUpdated).getTime():0;bv=b.lastUpdated?new Date(b.lastUpdated).getTime():0;}
  else{av=String(a[key]||'').toLowerCase();bv=String(b[key]||'').toLowerCase();}
  const result=av<bv?-1:av>bv?1:0;return dir==='desc'?-result:result;
}

function toggleSort(key){
  if(state.sortKey===key)state.sortDir=state.sortDir==='asc'?'desc':'asc';else{state.sortKey=key;state.sortDir=key==='updated'?'desc':'asc';}
  syncSortSelect();renderInventory();
}

function syncSortSelect(){
  const value=`${state.sortKey}:${state.sortDir}`;if([...els.sort.options].some(o=>o.value===value))els.sort.value=value;
}

function renderInventory(){
  const rows=getVisibleRows();$('#recordCount').textContent=`${rows.length} item${rows.length===1?'':'s'}`;
  updateSortHeads();
  if(!rows.length){
    els.body.innerHTML='<tr><td colspan="7"><div class="empty-state"><strong>No items found</strong>Try changing your search or filters.</div></td></tr>';
    els.cards.innerHTML='<div class="empty-state"><strong>No items found</strong>Try changing your search or filters.</div>';return;
  }
  els.body.innerHTML=rows.map(renderDesktopRow).join('');
  els.cards.innerHTML=rows.map(renderMobileCard).join('');
}

function renderDesktopRow(x){
  const status=stockStatus(x),idx=state.inventory.indexOf(x),statusText=status==='OUT'?'Out of stock':status==='LOW'?'Low stock':'Stock OK';
  const updated=formatDate(x.lastUpdated);const min=x.valueType==='NUMBER'?(x.minLevel===''?'—':x.minLevel):'—';
  const actions=x.valueType==='NUMBER'
    ?`<button class="small-action issue" onclick="openMovement('ISSUE',${idx})">Issue</button><button class="small-action receive" onclick="openMovement('RECEIVE',${idx})">Receive</button>`
    :`<button class="small-action status" onclick="openMovement('STATUS',${idx})">Update status</button>`;
  return `<tr class="${status==='OUT'?'out-row':status==='LOW'?'attention':''}">
    <td><span class="airline-badge">${escapeHtml(x.airline)}</span></td>
    <td class="item-cell"><strong>${escapeHtml(x.item)}</strong>${x.remarks?`<small title="${escapeHtml(x.remarks)}">${escapeHtml(x.remarks)}</small>`:''}</td>
    <td class="num"><span class="stock-number">${escapeHtml(displayStock(x))}</span></td>
    <td class="num"><span class="min-number">${escapeHtml(String(min))}</span></td>
    <td><span class="status-pill ${status==='OUT'?'out':status==='LOW'?'low':''}"><span class="status-dot"></span>${statusText}</span></td>
    <td class="updated-cell">${escapeHtml(updated)}</td>
    <td><div class="row-actions">${actions}</div></td>
  </tr>`;
}

function renderMobileCard(x){
  const status=stockStatus(x),idx=state.inventory.indexOf(x),statusText=status==='OUT'?'Out':status==='LOW'?'Low':'OK';
  const buttons=x.valueType==='NUMBER'
    ?`<button class="small-action issue" onclick="openMovement('ISSUE',${idx})">− Issue</button><button class="small-action receive" onclick="openMovement('RECEIVE',${idx})">＋ Receive</button>`
    :`<button class="small-action status" style="grid-column:1/-1" onclick="openMovement('STATUS',${idx})">Update availability</button>`;
  return `<article class="mobile-card ${status==='OUT'?'out-card':status==='LOW'?'attention':''}">
    <div class="mobile-card-head"><div class="mobile-card-title"><span class="airline-badge">${escapeHtml(x.airline)}</span><strong>${escapeHtml(x.item)}</strong></div><span class="mobile-stock">${escapeHtml(displayStock(x))}</span></div>
    <div class="mobile-meta"><div><small>Status</small><strong>${statusText}</strong></div><div><small>Minimum</small><strong>${x.valueType==='NUMBER'?escapeHtml(String(x.minLevel===''?'—':x.minLevel)):'—'}</strong></div><div><small>Updated</small><strong>${escapeHtml(formatDateShort(x.lastUpdated))}</strong></div></div>
    <div class="mobile-actions">${buttons}</div>
  </article>`;
}

function renderActivity(){
  if(!state.activity.length){els.activity.innerHTML='<tr><td colspan="6" class="loading-cell">No stock movements recorded yet.</td></tr>';return;}
  els.activity.innerHTML=state.activity.map(x=>{
    const action=String(x.action||'').toUpperCase();const cls=action.toLowerCase();const label=action==='RECEIVE'?'Received':action==='ISSUE'?'Issued':action==='ADD_ITEM'?'Added item':action==='SET_STATUS'?'Status update':action;
    return `<tr><td>${escapeHtml(formatDateTime(x.timestamp))}</td><td>${escapeHtml(x.staffName||'—')}</td><td><span class="airline-badge">${escapeHtml(x.airline||'')}</span></td><td>${escapeHtml(x.item||'')}</td><td><span class="movement-label ${cls}">${escapeHtml(label)}</span></td><td><strong>${escapeHtml(String(x.resultingValue??'—'))}</strong></td></tr>`;
  }).join('');
}

function stockStatus(x){
  if(x.valueType==='NUMBER'){const n=Number(x.stockValue),m=Number(x.minLevel);if(Number.isFinite(n)&&n<=0)return'OUT';if(Number.isFinite(n)&&Number.isFinite(m)&&n<=m)return'LOW';return'OK';}
  const value=String(x.stockValue||'').trim().toLowerCase();if(['no','out','out of stock'].includes(value))return'OUT';if(value==='low')return'LOW';return'OK';
}
function displayStock(x){return x.stockValue===''?'—':String(x.stockValue);}

function populateMovementItems(){
  els.movementItem.innerHTML=state.inventory.map((x,i)=>`<option value="${i}">${escapeHtml(x.airline)} — ${escapeHtml(x.item)} (${escapeHtml(displayStock(x))})</option>`).join('');syncMovementItem();
}

function openMovement(mode='ISSUE',index){
  if(!requireStaff())return;
  state.movementMode=mode;
  if(Number.isInteger(index))els.movementItem.value=String(index);
  els.movementQuantity.value='1';els.movementForm.querySelector('textarea[name="remarks"]').value='';
  configureMovementMode();syncMovementItem();els.movementDialog.showModal();
}
window.openMovement=openMovement;

function configureMovementMode(){
  const mode=state.movementMode;const title=$('#movementTitle'),overline=$('#movementOverline'),submit=$('#movementSubmitBtn');
  submit.classList.remove('issue-mode','receive-mode');
  if(mode==='RECEIVE'){overline.textContent='Stock receipt';title.textContent='Receive stock';submit.textContent='Confirm receipt';submit.classList.add('receive-mode');els.movementAction.value='RECEIVE';}
  else if(mode==='STATUS'){overline.textContent='Availability update';title.textContent='Update status';submit.textContent='Save status';els.movementAction.value='SET_STATUS';}
  else{overline.textContent='Stock issue';title.textContent='Issue stock';submit.textContent='Confirm issue';submit.classList.add('issue-mode');els.movementAction.value='ISSUE';}
  $('#movementStaffLine').textContent=state.staff?`Recording as ${state.staff.name}`:'';
}

function syncMovementItem(){
  const item=state.inventory[Number(els.movementItem.value)];if(!item)return;
  $('#selectedStockValue').textContent=displayStock(item);
  const statusItem=item.valueType==='STATUS';
  els.numericFields.classList.toggle('hidden',statusItem);els.statusFields.classList.toggle('hidden',!statusItem);
  els.movementQuantity.required=!statusItem;
  if(statusItem){state.movementMode='STATUS';configureMovementMode();}
}

function changeQty(delta){const current=Math.max(1,Number(els.movementQuantity.value)||1);els.movementQuantity.value=Math.max(1,current+delta);}

function openNewItem(){if(!requireStaff())return;restoreStaff();els.newItemDialog.showModal();}

async function submitMovement(e){
  e.preventDefault();if(!requireStaff())return;
  const f=new FormData(e.currentTarget),item=state.inventory[Number(f.get('itemKey'))];if(!item)return;
  const statusItem=item.valueType==='STATUS';const movement=statusItem?'SET_STATUS':els.movementAction.value;
  const payload={action:'record',staffName:state.staff.name,staffEmail:state.staff.email,airline:item.airline,item:item.item,movement,value:statusItem?f.get('statusValue'):Number(f.get('quantity')),remarks:f.get('remarks').trim()};
  await runSubmit(e.currentTarget,async()=>{const result=await api('',{method:'POST',body:JSON.stringify(payload)});els.movementDialog.close();setNotice(`${item.item} updated: ${result.result.previous} → ${result.result.resulting}`);await loadAll();});
}

async function submitNewItem(e){
  e.preventDefault();if(!requireStaff())return;
  const f=new FormData(e.currentTarget),valueType=f.get('valueType');
  const payload={action:'addItem',staffName:state.staff.name,staffEmail:state.staff.email,airline:f.get('airline'),item:f.get('item').trim(),valueType,initialValue:valueType==='STATUS'?f.get('initialStatus'):Number(f.get('initialNumber')),minLevel:valueType==='NUMBER'?Number(f.get('minLevel')):'',remarks:f.get('remarks').trim()};
  await runSubmit(e.currentTarget,async()=>{await api('',{method:'POST',body:JSON.stringify(payload)});els.newItemDialog.close();e.currentTarget.reset();syncNewItemType();setNotice(`${payload.item} added to ${payload.airline} inventory.`);await loadAll();});
}

function syncNewItemType(){const status=els.newValueType.value==='STATUS';els.newNumberFields.classList.toggle('hidden',status);els.newStatusFields.classList.toggle('hidden',!status);}

function openProfile(){if(state.staff){$('#profileStaffName').value=state.staff.name;$('#profileStaffEmail').value=state.staff.email;}els.profileDialog.showModal();}
function saveProfileFromForm(e){e.preventDefault();const f=new FormData(e.currentTarget);state.staff={name:f.get('staffName').trim(),email:f.get('staffEmail').trim()};localStorage.setItem('stationeryStaff',JSON.stringify(state.staff));refreshProfileUI();els.profileDialog.close();setNotice(`Staff profile saved for ${state.staff.name}.`);}
function restoreStaff(){try{const saved=JSON.parse(localStorage.getItem('stationeryStaff')||'null');if(saved&&saved.name&&saved.email)state.staff=saved;}catch{}refreshProfileUI();}
function refreshProfileUI(){const name=state.staff?.name||'Set staff profile',email=state.staff?.email||'Required for audit trail';$('#profileName').textContent=name;$('#profileEmail').textContent=email;$('#profileAvatar').textContent=state.staff?.name?initials(state.staff.name):'?';}
function requireStaff(){if(state.staff)return true;openProfile();setNotice('Please save your staff profile once before recording stock.',true);return false;}
function initials(name){return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();}

function clearFilters(){state.airline='ALL';state.status='ALL';state.search='';state.sortKey='airline';state.sortDir='asc';els.airline.value='ALL';els.status.value='ALL';els.search.value='';els.sort.value='airline:asc';renderInventory();}
function updateSortHeads(){document.querySelectorAll('.sort-head').forEach(btn=>{btn.querySelector('span').textContent=btn.dataset.sort===state.sortKey?(state.sortDir==='asc'?'▲':'▼'):'';});}
function formatDate(value){if(!value)return'—';const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value);return d.toLocaleString([],{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}
function formatDateShort(value){if(!value)return'—';const d=new Date(value);if(Number.isNaN(d.getTime()))return'—';return d.toLocaleDateString([],{day:'2-digit',month:'short'});}
function formatDateTime(value){if(!value)return'—';const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value);return d.toLocaleString([],{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}
async function runSubmit(form,fn){const b=form.querySelector('.submit-btn'),old=b.textContent;b.disabled=true;b.textContent='Saving…';form.classList.add('loading');try{await fn();}catch(err){setNotice(err.message,true);}finally{b.disabled=false;b.textContent=old;form.classList.remove('loading');}}
function setNotice(msg,error=false){els.notice.textContent=msg;els.notice.classList.toggle('hidden',!msg);els.notice.classList.toggle('error',error);if(msg&&!error)setTimeout(()=>{if(els.notice.textContent===msg)els.notice.classList.add('hidden');},4500);}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
