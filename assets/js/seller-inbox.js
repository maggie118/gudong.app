(function () {
  'use strict';
  var token = new URLSearchParams((location.hash || '').replace(/^#/, '')).get('token') || '';
  var threadsEl = document.getElementById('threads');
  var messagesEl = document.getElementById('messages');
  var titleEl = document.getElementById('item-title');
  var metaEl = document.getElementById('conversation-meta');
  var statusEl = document.getElementById('status');
  var form = document.getElementById('reply-form');
  var input = document.getElementById('reply-content');
  var submit = form.querySelector('button[type="submit"]');
  var selected = null;
  var busy = false;
  var refreshBusy = false;
  var lang = localStorage.getItem('gudong.sellerInbox.lang') || 'zh';
  document.body.dataset.lang = lang;
  document.getElementById('lang-toggle').textContent = lang === 'zh' ? 'EN' : '中文';

  function t(zh, en) { return lang === 'en' ? en : zh; }
  function uid() { return window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  function authHeaders(json) { var headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' }; if (json) headers['Content-Type'] = 'application/json'; return headers; }
  function say(message) { statusEl.textContent = message || ''; }
  function api(path, options) {
    return fetch(path, Object.assign({ cache: 'no-store', headers: authHeaders(false) }, options || {})).then(function (r) {
      return r.json().then(function (data) { if (!r.ok) throw new Error(data.error || 'Request failed'); return data; });
    });
  }
  function formatTime(value) { if (!value) return ''; var d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang === 'en' ? 'en-SG' : 'zh-SG', { dateStyle: 'short', timeStyle: 'short' }); }
  function keyOf(thread) { return thread.item_id + '|' + thread.buyer_tmp_id; }
  function drawThreads(items) {
    threadsEl.textContent = '';
    if (!items.length) {
      var empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = t('暂时没有买家咨询。','No buyer inquiries yet.'); threadsEl.appendChild(empty); return;
    }
    items.forEach(function (thread) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'thread' + (selected && keyOf(selected) === keyOf(thread) ? ' active' : '');
      var line = document.createElement('span'); line.className = 'thread-line';
      var who = document.createElement('span'); who.textContent = thread.buyer_label || t('买家','Buyer'); line.appendChild(who);
      if (thread.unread_count) { var badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = String(thread.unread_count); line.appendChild(badge); }
      var subtitle = document.createElement('span'); subtitle.className = 'thread-sub'; subtitle.textContent = (thread.item_title || thread.item_id) + ' · ' + formatTime(thread.last_at);
      var preview = document.createElement('span'); preview.className = 'thread-last'; preview.textContent = thread.last_message || '';
      button.appendChild(line); button.appendChild(subtitle); button.appendChild(preview);
      button.addEventListener('click', function () { selected = thread; drawThreads(items); loadConversation(); });
      threadsEl.appendChild(button);
    });
  }
  function drawMessages(messages) {
    var atBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
    messagesEl.textContent = '';
    if (!messages.length) { var empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = t('尚无消息。','No messages yet.'); messagesEl.appendChild(empty); return; }
    messages.forEach(function (message) {
      var li = document.createElement('li'); li.className = 'msg' + (message.sender_type === 'seller' ? ' seller' : '');
      var content = document.createElement('span'); content.textContent = message.content || ''; li.appendChild(content);
      var time = document.createElement('time'); time.className = 'time'; time.textContent = formatTime(message.created_at); li.appendChild(time); messagesEl.appendChild(li);
    });
    if (atBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function loadThreads() {
    if (!token || refreshBusy) return Promise.resolve();
    refreshBusy = true;
    return api('/api/seller-inbox').then(function (data) {
      var items = data.threads || [];
      items.sort(function (a, b) { return String(b.last_at).localeCompare(String(a.last_at)); });
      if (selected) selected = items.find(function (thread) { return keyOf(thread) === keyOf(selected); }) || selected;
      drawThreads(items);
      if (!selected && items.length) { selected = items[0]; drawThreads(items); }
      if (selected) return loadConversation();
      say(t('消息已同步。','Inbox is up to date.'));
    }).catch(function (error) {
      say(error.message === 'Seller inbox link is invalid or expired' ? t('链接无效或已过期，请联系平台管理员重新获取。','This link is invalid or expired. Ask the platform administrator for a new one.') : t('收件箱暂时无法连接，请稍后重试。','Inbox is temporarily unavailable. Please try again.'));
      if (!selected) { threadsEl.textContent = ''; var empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = t('无法载入咨询列表。','Could not load inquiries.'); threadsEl.appendChild(empty); }
    }).finally(function () { refreshBusy = false; });
  }
  function loadConversation() {
    if (!selected) return Promise.resolve();
    titleEl.textContent = selected.item_title || selected.item_id;
    metaEl.textContent = (selected.buyer_label || t('买家','Buyer')) + ' · ' + formatTime(selected.last_at);
    input.disabled = false; submit.disabled = busy ? true : false;
    var query = '?item_id=' + encodeURIComponent(selected.item_id) + '&buyer_tmp_id=' + encodeURIComponent(selected.buyer_tmp_id);
    return api('/api/seller-inbox' + query).then(function (data) { drawMessages(data.messages || []); say(t('对话已同步。','Conversation is up to date.')); }).catch(function () { say(t('无法载入这段对话。','Could not load this conversation.')); });
  }
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var content = input.value.trim(); if (!selected || !content || busy) return;
    busy = true; submit.disabled = true; say(t('正在发送…','Sending…'));
    api('/api/seller-inbox', { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ item_id: selected.item_id, buyer_tmp_id: selected.buyer_tmp_id, client_id: uid(), content: content }) })
      .then(function () { input.value = ''; return loadThreads(); })
      .then(function () { say(t('回复已发送。买家页面会自动同步。','Reply sent. It will sync to the buyer automatically.')); })
      .catch(function () { say(t('回复未能发送，请稍后重试。','Reply could not be sent. Please try again.')); })
      .finally(function () { busy = false; submit.disabled = !selected; });
  });
  document.getElementById('lang-toggle').addEventListener('click', function () {
    lang = lang === 'zh' ? 'en' : 'zh'; document.body.dataset.lang = lang; localStorage.setItem('gudong.sellerInbox.lang', lang);
    this.textContent = lang === 'zh' ? 'EN' : '中文'; if (selected) loadConversation(); else drawThreads([]);
  });
  if (!token) { say(t('链接无效，请联系平台管理员获取藏家专属链接。','Invalid link. Ask the platform administrator for your private inbox link.')); threadsEl.textContent = ''; var empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = t('需要使用藏家专属链接访问。','A private collector link is required.'); threadsEl.appendChild(empty); form.hidden = true; return; }
  loadThreads();
  var poll = window.setInterval(function () { if (!document.hidden) loadThreads(); }, 5000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) loadThreads(); });
  window.addEventListener('pagehide', function () { clearInterval(poll); });
})();
