/* 古董圈 Gudong · Google 登录开关
 * ------------------------------------------------------------------
 * 单一开关文件：改这里，18 个藏品页全部生效，不需要再动页面。
 *
 * 现在留空 = 询价弹层只显示「邮箱 / WhatsApp」表单，Google 按钮不渲染。
 *
 * 拿到 Google OAuth Client ID（Web application 类型）后：
 *   1) 把下面 CLIENT_ID 的双引号里填上 xxx.apps.googleusercontent.com
 *   2) Vercel 环境变量加 GOOGLE_CLIENT_ID = 同一个值（服务端用它校验 aud）
 *   3) 重新部署；检索不到 su? 不必改任何 HTML
 *
 * 校验说明：前端拿到 ID token 后交给 /api/lead，服务端用
 * https://oauth2.googleapis.com/tokeninfo 复核 aud、email_verified 与有效期，
 * 通过后才把验证过的邮箱写进买家名单；伪造的 token 无法入库。
 * ------------------------------------------------------------------ */
(function () {
  'use strict';
  // ← 唯一需要改动的值（2026-11-10 已填入 Gudong 的 Web 客户端）
  var CLIENT_ID = '875654202180-7k4kiojcjvlllqs736jsvvtok2csp7he.apps.googleusercontent.com';

  if (CLIENT_ID) {
    window.GUDONG_GOOGLE_CLIENT_ID = CLIENT_ID;
  }
  // 留空时故意不设该全局变量：wa-contact-gate.js 检测不到就不渲染 Google 按钮
})();
