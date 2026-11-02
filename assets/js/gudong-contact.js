/* ============ Gudong · 联系我们邮件表单（mailto 方案，纯前端零后端） ============
 * 点击 footer 的「联系我们 / Contact」或客服机器人「发邮件给我们」→ 弹出邮件表单；
 * 提交时构造 mailto:contact@gudong.app 打开访客本地邮件客户端发送。2026-11-01 上线。
 * 语言跟随聊天偏好 localStorage['gd-chat-lang']（en/zh），否则按页面 lang。
 */
(function () {
  'use strict';
  if (window.__gdContactLoaded) return;
  window.__gdContactLoaded = true;

  var MAILTO = 'contact@gudong.app';

  function getEN() {
    var stored = null;
    try { stored = localStorage.getItem('gd-chat-lang'); } catch (e) {}
    if (stored === 'en') return true;
    if (stored === 'zh') return false;
    return (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;
  }
  function getL(EN) {
    return EN ? {
      t: 'Contact Us', name: 'Your name', email: 'Your email (for reply)', subj: 'Subject', msg: 'Message',
      send: 'Send Email', close: 'Close', note: 'Click send to open your email app and email contact@gudong.app',
      phMsg: 'How can we help?', subjDef: 'Gudong.app enquiry'
    } : {
      t: '联系我们', name: '您的称呼', email: '您的邮箱（用于回复）', subj: '主题', msg: '留言内容',
      send: '发送邮件', close: '关闭', note: '点击发送将打开您的邮件客户端，发送至 contact@gudong.app',
      phMsg: '请写下您想咨询的内容…', subjDef: 'Gudong.app 咨询'
    };
  }

  var EN = getEN();
  var L = getL(EN);

  var root = document.createElement('div');
  root.id = 'gd-contact-modal'; root.hidden = true;
  root.innerHTML =
    '<div class="gd-contact-card">' +
      '<div class="gd-contact-head"><b>' + L.t + '</b><button type="button" class="gd-contact-close" data-cx aria-label="' + L.close + '">×</button></div>' +
      '<form class="gd-contact-body">' +
        '<div class="gd-contact-field"><label>' + L.name + '</label><input name="name" required maxlength="40"></div>' +
        '<div class="gd-contact-field"><label>' + L.email + '</label><input name="email" type="email" required maxlength="80"></div>' +
        '<div class="gd-contact-field"><label>' + L.subj + '</label><input name="subject" maxlength="120" value="' + L.subjDef + '"></div>' +
        '<div class="gd-contact-field"><label>' + L.msg + '</label><textarea name="msg" required maxlength="2000" placeholder="' + L.phMsg + '"></textarea></div>' +
        '<button type="submit" class="gd-contact-submit">' + L.send + '</button>' +
        '<div class="gd-contact-note">' + L.note + '</div>' +
      '</form>' +
    '</div>';
  document.body.appendChild(root);

  var card = root.querySelector('.gd-contact-card');
  var form = root.querySelector('form');
  var fields = form.querySelectorAll('.gd-contact-field');

  function applyLabels() {
    card.querySelector('b').textContent = L.t;
    card.querySelector('[data-cx]').setAttribute('aria-label', L.close);
    fields[0].querySelector('label').textContent = L.name;
    fields[1].querySelector('label').textContent = L.email;
    fields[2].querySelector('label').textContent = L.subj;
    fields[3].querySelector('label').textContent = L.msg;
    fields[3].querySelector('textarea').placeholder = L.phMsg;
    var subj = form.subject;
    if (!subj.value || subj.value === (EN ? 'Gudong.app enquiry' : 'Gudong.app 咨询')) subj.value = L.subjDef;
    form.querySelector('.gd-contact-submit').textContent = L.send;
    form.querySelector('.gd-contact-note').textContent = L.note;
  }

  function syncLang() {
    var e = getEN();
    if (e === EN) return;
    EN = e; L = getL(EN); applyLabels();
  }
  function openModal() { syncLang(); root.hidden = false; }
  function closeModal() { root.hidden = true; }
  window.__gdContactOpen = openModal; // 供聊天机器人等模块复用

  root.addEventListener('click', function (e) {
    if (e.target === root || e.target.closest('[data-cx]')) closeModal();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !root.hidden) closeModal(); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = (form.name.value || '').trim();
    var email = (form.email.value || '').trim();
    var subj = (form.subject.value || '').trim() || L.subjDef;
    var msg = (form.msg.value || '').trim();
    var body = (name ? 'Name: ' + name + '\n' : '') + (email ? 'Email: ' + email + '\n' : '') + '\n' + msg;
    window.location.href = 'mailto:' + MAILTO + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
    closeModal();
    form.reset();
  });

  // 拦截 footer 的「联系我们 / Contact」链接 → 打开邮件表单
  function hook() {
    document.querySelectorAll('a.zh, a.en').forEach(function (a) {
      var t = (a.textContent || '').trim();
      if (t !== '联系我们' && t !== 'Contact') return;
      if (a.getAttribute('data-gd-contact')) return;
      a.setAttribute('data-gd-contact', '1');
      a.addEventListener('click', function (e) { e.preventDefault(); openModal(); });
    });
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', hook); } else { hook(); }
})();
