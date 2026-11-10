(function(){
  'use strict';
  var token = new URLSearchParams(location.search).get('token') || '';
  var list = document.getElementById('messages');
  var form = document.getElementById('reply-form');
  var input = document.getElementById('reply-content');
  var status = document.getElementById('status');
  var sent = new Set();
  var busy = false;
  var poll = null;
  function text(node, value){node.textContent=value||'';}
  function say(zh,en){text(status,document.body.dataset.lang==='en'?en:zh);}
  function uuid(){return window.crypto&&crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});}
  function render(data){
    text(document.getElementById('item-title'),data.item_title||data.item_id||'Gudong item');
    text(document.getElementById('conversation-meta'),(data.buyer_label||'PWA guest')+' · '+(data.seller_id||''));
    var atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;
    list.textContent='';
    (data.messages||[]).forEach(function(m){
      if(m.id)sent.add(m.id);
      var li=document.createElement('li');li.className='msg'+(m.sender_type==='seller'?' seller':'');
      var body=document.createElement('span');body.textContent=m.content||'';li.appendChild(body);
      var time=document.createElement('time');time.className='time';time.textContent=m.created_at?new Date(m.created_at).toLocaleString('en-SG',{dateStyle:'short',timeStyle:'short'}):'';li.appendChild(time);list.appendChild(li);
    });
    if(atBottom)list.scrollTop=list.scrollHeight;
  }
  function load(){
    if(!token){say('回复链接无效。','This reply link is invalid.');form.hidden=true;return;}
    fetch('/api/chat-reply?token='+encodeURIComponent(token),{cache:'no-store',headers:{Accept:'application/json'}})
      .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'Unavailable');return d;});})
      .then(function(d){render(d);say('对话已同步。','Conversation is up to date.');})
      .catch(function(){say('链接可能已过期，或聊天服务暂时不可用。','This link may have expired or the chat service is unavailable.');});
  }
  form.addEventListener('submit',function(e){
    e.preventDefault();var content=input.value.trim();if(!content||busy)return;busy=true;form.querySelector('button').disabled=true;say('正在发送…','Sending…');
    fetch('/api/chat-reply',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({token:token,client_id:uuid(),content:content})})
      .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'Unavailable');return d;});})
      .then(function(){input.value='';load();say('回复已发送。','Reply sent.');})
      .catch(function(){say('回复未能发送，请稍后重试。','Reply could not be sent. Please try again.');})
      .finally(function(){busy=false;form.querySelector('button').disabled=false;});
  });
  load();
  document.addEventListener('visibilitychange',function(){if(!document.hidden)load();});
})();
