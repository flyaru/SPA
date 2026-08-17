const state={inventory:[],filter:'ALL',search:''};
const $=s=>document.querySelector(s);
const els={list:$('#inventoryList'),notice:$('#notice'),search:$('#searchInput'),filter:$('#airlineFilter'),movementDialog:$('#movementDialog'),newItemDialog:$('#newItemDialog'),movementForm:$('#movementForm'),newItemForm:$('#newItemForm'),movementItem:$('#movementItem'),movementAction:$('#movementAction'),movementQuantity:$('#movementQuantity'),numericFields:$('#numericFields'),statusFields:$('#statusFields'),newValueType:$('#newValueType'),newNumberFields:$('#newNumberFields'),newStatusFields:$('#newStatusFields')};

document.addEventListener('DOMContentLoaded',()=>{bindEvents();restoreStaff();loadInventory();});

function bindEvents(){
  $('#refreshBtn').addEventListener('click',loadInventory);
  $('#movementBtn').addEventListener('click',()=>openMovement());
  $('#newItemBtn').addEventListener('click',()=>els.newItemDialog.showModal());
  els.search.addEventListener('input',e=>{state.search=e.target.value.trim().toLowerCase();renderInventory();});
  els.filter.addEventListener('click',e=>{const b=e.target.closest('button[data-airline]');if(!b)return;state.filter=b.dataset.airline;els.filter.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));renderInventory();});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.close).close()));
  els.movementItem.addEventListener('change',syncMovementType);
  els.movementAction.addEventListener('change',syncMovementType);
  els.newValueType.addEventListener('change',syncNewItemType);
  els.movementForm.addEventListener('submit',submitMovement);
  els.newItemForm.addEventListener('submit',submitNewItem);
}

async function api(path='',options={}){
  const r=await fetch('/api/stock'+path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  let data;try{data=await r.json();}catch{throw new Error('Invalid server response');}
  if(!r.ok||data.ok===false)throw new Error(data.error||'Request failed');
  return data;
}

async function loadInventory(){
  setNotice('');
  els.list.innerHTML='<div class="empty">Loading stock…</div>';
  try{
    const data=await api('?action=inventory');
    state.inventory=data.items||[];
    populateMovementItems();
    renderStats();renderInventory();
    $('#lastLoaded').textContent='Updated '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  }catch(err){
    els.list.innerHTML='<div class="empty">Stock could not be loaded.</div>';
    setNotice(err.message,true);
  }
}

function renderStats(){
  const active=state.inventory.filter(x=>x.active!==false);
  const low=active.filter(isLow);
  $('#statTotal').textContent=active.length;
  $('#statLow').textContent=low.length;
  $('#stat9P').textContent=active.filter(x=>x.airline==='9P').length;
  $('#statG9').textContent=active.filter(x=>x.airline==='G9').length;
}

function renderInventory(){
  const rows=state.inventory.filter(x=>x.active!==false).filter(x=>state.filter==='ALL'||x.airline===state.filter).filter(x=>!state.search||`${x.airline} ${x.item} ${x.remarks||''}`.toLowerCase().includes(state.search));
  if(!rows.length){els.list.innerHTML='<div class="empty">No stationery items match your search.</div>';return;}
  els.list.innerHTML=rows.map((x)=>{
    const low=isLow(x);const out=isOut(x);const status=out?'Out':low?'Low':'OK';
    const idx=state.inventory.indexOf(x);
    return `<article class="stock-row">
      <span class="airline-badge">${escapeHtml(x.airline)}</span>
      <div><div class="item-name">${escapeHtml(x.item)}</div><div class="item-meta">${escapeHtml(x.valueType==='NUMBER'?'Minimum '+(x.minLevel??'—'):(x.remarks||'Availability item'))}</div></div>
      <div class="stock-value">${escapeHtml(String(x.stockValue??'—'))}</div>
      <span class="status-pill ${out?'out':low?'low':''}">${status}</span>
      <button class="row-action" type="button" onclick="openMovement(${idx})">Update</button>
    </article>`;
  }).join('');
}

function isLow(x){if(x.valueType==='NUMBER'){const n=Number(x.stockValue),m=Number(x.minLevel);return Number.isFinite(n)&&Number.isFinite(m)&&n<=m;}return ['low','no','out','out of stock'].includes(String(x.stockValue).toLowerCase());}
function isOut(x){if(x.valueType==='NUMBER')return Number(x.stockValue)<=0;return ['no','out','out of stock'].includes(String(x.stockValue).toLowerCase());}

function populateMovementItems(){
  els.movementItem.innerHTML=state.inventory.filter(x=>x.active!==false).map(x=>{const i=state.inventory.indexOf(x);return `<option value="${i}">${escapeHtml(x.airline)} — ${escapeHtml(x.item)}</option>`;}).join('');
  syncMovementType();
}

function openMovement(index){
  if(Number.isInteger(index)){els.movementItem.value=String(index);syncMovementType();}
  els.movementDialog.showModal();
}
window.openMovement=openMovement;

function syncMovementType(){
  const item=state.inventory[Number(els.movementItem.value)];const status=item?.valueType==='STATUS';
  els.numericFields.classList.toggle('hidden',status);els.statusFields.classList.toggle('hidden',!status);
  els.movementQuantity.required=!status;
  if(!status&&els.movementAction.value!=='SET')els.movementQuantity.min='1';else els.movementQuantity.min='0';
}
function syncNewItemType(){const status=els.newValueType.value==='STATUS';els.newNumberFields.classList.toggle('hidden',status);els.newStatusFields.classList.toggle('hidden',!status);}

async function submitMovement(e){
  e.preventDefault();const f=new FormData(e.currentTarget);const item=state.inventory[Number(f.get('itemKey'))];if(!item)return;
  const status=item.valueType==='STATUS';
  const payload={action:'record',staffName:f.get('staffName').trim(),staffEmail:f.get('staffEmail').trim(),airline:item.airline,item:item.item,movement:status?'SET_STATUS':f.get('action'),value:status?f.get('statusValue'):Number(f.get('quantity')),remarks:f.get('remarks').trim()};
  saveStaff(payload.staffName,payload.staffEmail);await runSubmit(e.currentTarget,async()=>{await api('',{method:'POST',body:JSON.stringify(payload)});els.movementDialog.close();setNotice('Stock updated successfully.');await loadInventory();});
}

async function submitNewItem(e){
  e.preventDefault();const f=new FormData(e.currentTarget);const valueType=f.get('valueType');
  const payload={action:'addItem',staffName:f.get('staffName').trim(),staffEmail:f.get('staffEmail').trim(),airline:f.get('airline'),item:f.get('item').trim(),valueType,initialValue:valueType==='STATUS'?f.get('initialStatus'):Number(f.get('initialNumber')),minLevel:valueType==='NUMBER'?Number(f.get('minLevel')):'',remarks:f.get('remarks').trim()};
  saveStaff(payload.staffName,payload.staffEmail);await runSubmit(e.currentTarget,async()=>{await api('',{method:'POST',body:JSON.stringify(payload)});els.newItemDialog.close();e.currentTarget.reset();syncNewItemType();restoreStaff();setNotice('New stationery item added.');await loadInventory();});
}

async function runSubmit(form,fn){const b=form.querySelector('.submit-btn');const old=b.textContent;b.disabled=true;b.textContent='Saving…';form.classList.add('loading');try{await fn();}catch(err){setNotice(err.message,true);}finally{b.disabled=false;b.textContent=old;form.classList.remove('loading');}}
function setNotice(msg,error=false){els.notice.textContent=msg;els.notice.classList.toggle('hidden',!msg);els.notice.classList.toggle('error',error);}
function saveStaff(name,email){localStorage.setItem('stationeryStaff',JSON.stringify({name,email}));}
function restoreStaff(){try{const v=JSON.parse(localStorage.getItem('stationeryStaff')||'{}');['staffName','newStaffName'].forEach(id=>{if($('#'+id))$('#'+id).value=v.name||'';});['staffEmail','newStaffEmail'].forEach(id=>{if($('#'+id))$('#'+id).value=v.email||'';});}catch{}}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
