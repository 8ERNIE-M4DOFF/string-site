// Behaviour test for safety-contact.html (no test runner in this repo). Run:
//   NODE_PATH=/Applications/string-app/node_modules node tests/safety-contact.test.js
// Each check was mutation-tested on 2026-10-11: removing the example page's
// disabled submit, or rendering the name as HTML, fails the matching check.

const { JSDOM } = require('jsdom');
const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'safety-contact.html'), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 20));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
function load(url, responder) {
  const calls = [];
  const dom = new JSDOM(html, { url, runScripts: 'dangerously', beforeParse(w) {
    w.fetch = (u, o) => { try { calls.push({ u, body: JSON.parse(o.body) }); const [status, json] = responder(u, JSON.parse(o.body)); return Promise.resolve({ status, json: () => Promise.resolve(json) }); } catch (e) { return Promise.reject(e); } };
  }});
  return { w: dom.window, d: dom.window.document, calls };
}
const vis = (d, id) => !d.getElementById(id).classList.contains('hidden');
const TOKEN = 'A'.repeat(43);
(async () => {
  // 1. example
  let { d, w, calls } = load('https://stringdatingapp.com/safety-contact/example', () => [500, {}]);
  await tick();
  ok(vis(d, 'state-form') && vis(d, 'example-note'), 'example: form + note shown');
  ok(d.getElementById('sc-submit').disabled, 'example: submit disabled');
  ok(!d.getElementById('sc-consent').checked, 'example: checkbox unchecked');
  ok([...d.querySelectorAll('.first-name')].every(e => e.textContent === 'Alex'), 'example: placeholder name everywhere');
  ok(calls.length === 0, 'example: no API call');
  ok(d.querySelector('label[for=sc-consent]').textContent.includes('I agree to receive text message safety alerts from String if Alex starts a safety check-in and does not confirm they are safe. Message frequency varies, and alerts are sent only if a check-in expires. Msg & data rates may apply. Reply STOP to opt out, HELP for help.'), 'example: exact consent text');
  ok(d.querySelector('a[href="/terms"]') && d.querySelector('a[href="/privacy"]'), 'links to /terms and /privacy');
  // 2. no / bad token
  ({ d, calls } = load('https://stringdatingapp.com/safety-contact', () => [500, {}])); await tick();
  ok(vis(d, 'state-invalid') && calls.length === 0, 'no token: invalid, no call');
  // 3. valid token flows
  let confirmReply = [422, { error: { code: 'PHONE_MISMATCH' } }];
  ({ d, w, calls } = load('https://stringdatingapp.com/safety-contact#' + TOKEN, (u) => u.endsWith('/lookup') ? [200, { data: { firstName: '<b>Sam</b>' } }] : confirmReply));
  await tick();
  ok(w.location.hash === '', 'token removed from address bar');
  ok(calls[0].body.token === TOKEN, 'token sent in POST body');
  ok(vis(d, 'state-form') && d.querySelector('.first-name').textContent === '<b>Sam</b>' && !d.querySelector('b'), 'name rendered as text, not HTML');
  const submit = () => { d.getElementById('state-form').dispatchEvent(new w.Event('submit', { cancelable: true })); };
  d.getElementById('sc-phone').value = '312 555 0148'; submit(); await tick();
  ok(calls.length === 1 && d.getElementById('form-error').textContent.includes('tick the box'), 'unchecked: blocked client-side');
  d.getElementById('sc-consent').checked = true; d.getElementById('sc-phone').value = '555'; submit(); await tick();
  ok(calls.length === 1, 'bad number: blocked client-side');
  d.getElementById('sc-phone').value = '(312) 555-0148'; submit(); await tick();
  ok(calls[1].body.phone === '+13125550148' && calls[1].body.consentTextVersion === 'v1' && calls[1].body.consent === true, 'confirm body: E.164, v1, consent');
  ok(d.getElementById('form-error').textContent.includes("doesn't match"), 'mismatch message');
  confirmReply = [409, { error: { code: 'SMS_OPTED_OUT', sendFrom: '+13125550000' } }]; submit(); await tick();
  ok(d.getElementById('form-error').textContent.includes('Text START to +13125550000'), '21610: START instruction');
  confirmReply = [200, { data: { status: 'confirmed' } }]; submit(); await tick();
  ok(vis(d, 'state-done'), 'success state');
  // 4. network down on lookup
  const dom4 = load('https://stringdatingapp.com/safety-contact#' + TOKEN, () => { throw new Error('net'); });
  await tick();
  ok(dom4.d.getElementById('loading-text').textContent.includes("couldn't reach"), 'unreachable is its own state');
  process.exit(fails ? 1 : 0);
})();
