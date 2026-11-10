(function () {
  'use strict';
  var root = document.querySelector('[data-gudong-chat]');
  if (!root) return;
  var panel = root.querySelector('[data-chat-panel]');
  var toggle = root.querySelector('[data-chat-toggle]');
  var close = root.querySelector('[data-chat-close]');
  var messagesEl = root.querySelector('[data-chat-messages]');
  var form = root.querySelector('[data-chat-form]');
  var input = root.querySelector('[data-chat-input]');
  var statusEl = root.querySelector('[data-chat-status]');
  var guestEl = root.querySelector('[data-chat-guest]');
  var buyer = getBuyer();
  var itemId = root.getAttribute('data-item-id') || '';
  var sellerId = currentSeller();
  var storageKey = 'gudong.chat.v2.' + itemId + '.' + sellerId + '.' + buyer.id;
  var messages = readLocal();
  var busy = false;
  var pollTimer = null;

  var style = document.createElement('style');
  style.textContent = [
    '[data-gudong-chat]{margin:1rem 0;}','[data-chat-panel][hidden]{display:none!important;}',
    '[data-chat-panel]{margin-top:.8rem;border:1px solid #e7e1d8;border-radius:14px;background:#fff;box-shadow:0 10px 28px rgba(36,31,26,.09);overflow:hidden;color:#241f1a;}',
    '.gd-chat-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.1rem;background:#f7f4ef;border-bottom:1px solid #e7e1d8;}',
    '.gd-chat-title{font-weight:700;color:#5c3a26;}.gd-chat-subtitle{font-size:.78rem;color:#766c60;margin-top:.15rem;}',
    '.gd-chat-close{border:0;background:transparent;color:#5a544c;font-size:1.5rem;line-height:1;min-width:44px;min-height:44px;cursor:pointer;}',
    '.gd-chat-body{padding:.8rem 1rem 1rem;}.gd-chat-guest{font-size:.78rem;color:#766c60;margin-bottom:.45rem;}',
    '[data-chat-status]{min-height:1.3em;font-size:.8rem;color:#766c60;margin:.25rem 0 .55rem;}',
    '[data-chat-messages]{list-style:none;margin:0 0 .8rem;padding:0;max-height:320px;overflow:auto;display:flex;flex-direction:column;gap:.55rem;}',
    '.gd-chat-msg{max-width:90%;padding:.6rem .75rem;border-radius:12px;background:#f3eee7;align-self:flex-start;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.92rem;line-height:1.5;}',
    '.gd-chat-msg.is-buyer{background:#7a4e33;color:#fff;align-self:flex-end;}.gd-chat-time{display:block;font-size:.68rem;opacity:.75;margin-top:.25rem;}',
    '.gd-chat-retry{display:block;margin-top:.35rem;border:0;background:transparent;color:#ffd4bc;text-decoration:underline;cursor:pointer;font:inherit;font-size:.78rem;}',
    '[data-chat-form]{display:grid;grid-template-columns:1fr auto;gap:.55rem;align-items:end;}',
    '[data-chat-input]{width:100%;min-height:48px;max-height:140px;resize:vertical;border:1px solid #d8d0c5;border-radius:8px;padding:.7rem;font:inherit;color:#241f1a;background:#fff;}',
    '[data-chat-input]:focus{outline:2px solid rgba(122,78,51,.28);border-color:#7a4e33;}',
    '[data-chat-form] button{min-height:44px;padding:.65rem 1rem;border:0;border-radius:8px;background:#7a4e33;color:#fff;font:inherit;font-weight:600;cursor:pointer;}',
    '[data-chat-form] button:disabled{opacity:.6;cursor:wait;}',
    '.gd-chat-note{font-size:.73rem;color:#766c60;margin:.55rem 0 0;line-height:1.45;}'
  ].join('\n');
  document.head.appendChild(style);
  setGuestLabel(); render();
  toggle.addEventListener('click', function () { panel.hidden = false; toggle.setAttribute('aria-expanded','true'); input.focus(); fetchMessages(); startPolling(); });
  close.addEventListener('click', function () { panel.hidden = true; toggle.setAttribute('aria-expanded','false'); stopPolling(); toggle.focus(); });
  form.addEventListener('submit', function (event) {
    event.preventDefault(); var content = input.value.trim(); if (!content || busy) return;
    var message = { client_id: uuid(), sender_type: 'buyer', content: content, created_at: new Date().toISOString(), delivery_status: 'sending' };
    messages.push(message); input.value = ''; persist(); render(); sendMessage(message);
  });
  messagesEl.addEventListener('click', function (event) {
    var button = event.target.closest('[data-chat-retry]'); if (!button) return;
    var message = messages.find(function (entry) { return entry.client_id === button.getAttribute('data-chat-retry'); });
    if (message) sendMessage(message);
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopPolling(); else if (!panel.hidden) { fetchMessages(); startPolling(); } });
  new MutationObserver(function () { setGuestLabel(); render(); }).observe(document.body, { attributes:true, attributeFilter:['data-lang'] });

  function isEnglish(){return document.body.getAttribute('data-lang')==='en';}
  function currentSeller(){var el=document.getElementById('sellerId');return (el&&el.textContent.trim())||root.getAttribute('data-seller-id')||'';}
  function uuid(){if(window.crypto&&typeof crypto.randomUUID==='function')return crypto.randomUUID();var bytes=new Uint8Array(16);if(window.crypto&&crypto.getRandomValues)crypto.getRandomValues(bytes);else for(var i=0;i<bytes.length;i++)bytes[i]=Math.random()*256|0;bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;var h=Array.prototype.map.call(bytes,function(b){return b.toString(16).padStart(2,'0');}).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
  function getBuyer(){var key='gudong.chat.guest.v1';try{var old=JSON.parse(localStorage.getItem(key)||'null');if(old&&/^[0-9a-f-]{36}$/i.test(old.id)&&/^PWA藏友_[0-9A-F]{4}$/.test(old.label))return old;var id=uuid(),guest={id:id,label:'PWA藏友_'+id.replace(/-/g,'').slice(0,4).toUpperCase()};localStorage.setItem(key,JSON.stringify(guest));return guest;}catch(e){var fallback=uuid();return{id:fallback,label:'PWA藏友_'+fallback.replace(/-/g,'').slice(0,4).toUpperCase()};}}
  function setGuestLabel(){if(guestEl)guestEl.textContent=isEnglish()?'Guest ID: '+buyer.label:'访客编号：'+buyer.label;}
  function readLocal(){try{var list=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(list)?list:[];}catch(e){return[];}}
  function persist(){try{localStorage.setItem(storageKey,JSON.stringify(messages.slice(-100)));}catch(e){setStatus(isEnglish()?'Chat history could not be saved on this device.':'聊天记录暂时无法保存在此设备。');}}
  function setStatus(text){if(statusEl)statusEl.textContent=text;}
  function render(){messagesEl.textContent='';if(!messages.length){var empty=document.createElement('li');empty.className='gd-chat-subtitle';empty.textContent=isEnglish()?'Send a message to start the conversation.':'发送消息，开始咨询。';messagesEl.appendChild(empty);return;}messages.slice(-100).forEach(function(m){var li=document.createElement('li');li.className='gd-chat-msg'+(m.sender_type==='buyer'?' is-buyer':'');var body=document.createElement('span');body.textContent=m.content||'';li.appendChild(body);var time=document.createElement('time');time.className='gd-chat-time';time.dateTime=m.created_at||'';time.textContent=m.created_at?new Date(m.created_at).toLocaleString(isEnglish()?'en-SG':'zh-SG',{dateStyle:'short',timeStyle:'short'}):'';li.appendChild(time);if(m.sender_type==='buyer'&&m.delivery_status==='failed'){var retry=document.createElement('button');retry.type='button';retry.className='gd-chat-retry';retry.setAttribute('data-chat-retry',m.client_id);retry.textContent=isEnglish()?'Not sent · Retry':'未发送 · 重试';li.appendChild(retry);}messagesEl.appendChild(li);});messagesEl.scrollTop=messagesEl.scrollHeight;}
  function apiUrl(){return '/api/chat?item_id='+encodeURIComponent(itemId)+'&seller_id='+encodeURIComponent(currentSeller())+'&buyer_tmp_id='+encodeURIComponent(buyer.id);}
  function fetchMessages(){fetch(apiUrl(),{headers:{Accept:'application/json'},cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('unavailable');return r.json();}).then(function(data){(data.messages||[]).forEach(function(incoming){var found=messages.find(function(m){return(incoming.client_id&&m.client_id===incoming.client_id)||(incoming.id&&m.id===incoming.id);});var clean={id:incoming.id,client_id:incoming.client_id,sender_type:incoming.sender_type,content:incoming.content,created_at:incoming.created_at,delivery_status:'sent'};if(found)Object.assign(found,clean);else messages.push(clean);});messages.sort(function(a,b){return String(a.created_at).localeCompare(String(b.created_at));});persist();render();setStatus(isEnglish()?'Messages are synced. Replies appear here.':'消息已同步，藏家回复会显示在这里。');}).catch(function(){setStatus(isEnglish()?'Chat service is not connected. Unsent messages stay on this device.':'聊天服务暂未连通；未发送的消息会保留在此设备。');});}
  function sendMessage(message){if(busy)return;busy=true;form.querySelector('button[type="submit"]').disabled=true;setStatus(isEnglish()?'Sending…':'正在发送…');var titleNode=document.querySelector('.item-detail-title.zh');var title=titleNode?titleNode.textContent.trim():itemId;fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({item_id:itemId,seller_id:currentSeller(),buyer_tmp_id:buyer.id,buyer_label:buyer.label,item_title:title,client_id:message.client_id,content:message.content})}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'send failed');return d;});}).then(function(data){Object.assign(message,{id:data.message&&data.message.id,created_at:data.message&&data.message.created_at||message.created_at,delivery_status:'sent'});persist();render();setStatus(data.notification_sent?(isEnglish()?'Sent and collector notified. Replies appear here.':'已发送并通知藏家；回复会显示在这里。'):(isEnglish()?'Message saved. Collector notification is not configured yet.':'消息已保存，但藏家通知尚未配置。'));}).catch(function(){message.delivery_status='failed';persist();render();setStatus(isEnglish()?'Could not send. The message is saved here; retry when online.':'发送失败。消息已保存在本机，恢复连接后可重试。');}).finally(function(){busy=false;form.querySelector('button[type="submit"]').disabled=false;});}
  function startPolling(){ /* 不轮询：Airtable 免费版每月仅 1,000 次调用，打开面板与切回窗口时才同步 */ }
  function stopPolling(){if(pollTimer)window.clearInterval(pollTimer);pollTimer=null;}
})();
