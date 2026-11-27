/**
 * Luke van Wijk — Make an Offer email sender (Google Apps Script)
 *
 * Receives offers from https://lukevanwijk.github.io/offer/ and emails them
 * to you from your own Gmail as a branded summary. Reply-To is set to the buyer.
 * Attachments:
 *   1. Offer - <street> - $<amount>.pdf          full offer (your copy)
 *   2. Buyer ID - <street>.pdf                   licence photos, kept separate
 *   3. Offer for seller - <street> - $<amount>.pdf  no buyer contact details
 *
 * Setup: see apps-script/SETUP.md in the repo (about 5 minutes, once).
 */

const SETTINGS = {
  sendTo:   'luke.vanwijk@eldersrealestate.com.au',
  cc:       '',                              // e.g. Bre's address, to copy her in
  fromName: 'Website offers',
  agent:    'Luke van Wijk',
  office:   'Elders Shailer Park',
  phone:    '0438 015 656',
  email:    'luke.vanwijk@eldersrealestate.com.au',
};

const C = { red: '#c8102e', ink: '#1b1c1e', muted: '#6d6a64', line: '#e4ded4', cream: '#f7f4ef' };

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d._honey) return json_({ ok: true });                 // spam bot
    if (!d.property || !d.amount || !d.b1name || !d.b1email) return json_({ ok: false, error: 'missing fields' });
    sendOffer_(d);
    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() { return json_({ ok: true, service: 'offer-sender' }); }

function sendOffer_(d) {
  const [street, suburb] = splitAddress_(d.property);
  const photo = d.listingUrl ? listingPhoto_(d.listingUrl) : '';
  const received = Utilities.formatDate(new Date(), 'Australia/Brisbane', "EEE d MMM yyyy, h:mm a");

  const html = renderHtml_(d, street, suburb, photo, received, 'agent');
  const subject = `New offer $${d.amount} – ${street} – ${d.b1name}`;
  const licences = (d.licences || []).filter(l => l && l.data);

  const attachments = [];
  // 1. Full offer
  const offerPdf = toPdf_(renderHtml_(d, street, suburb, '', received, 'agent'), `Offer - ${street} - $${d.amount}.pdf`);
  if (offerPdf) attachments.push(offerPdf);
  // 2. Buyer ID, as its own document
  if (licences.length) {
    const idPdf = toPdf_(renderIdHtml_(d, street, suburb, licences), `Buyer ID - ${street}.pdf`);
    if (idPdf) attachments.push(idPdf);
    else licences.forEach(l => attachments.push(Utilities.newBlob(Utilities.base64Decode(l.data), l.mime || 'image/jpeg', l.name || 'licence.jpg')));
  }
  // 3. Seller copy, without buyer contact details
  const sellerPdf = toPdf_(renderHtml_(d, street, suburb, '', received, 'seller'), `Offer for seller - ${street} - $${d.amount}.pdf`);
  if (sellerPdf) attachments.push(sellerPdf);

  const opts = { htmlBody: html, name: SETTINGS.fromName, replyTo: d.b1email, attachments };
  if (SETTINGS.cc) opts.cc = SETTINGS.cc;
  GmailApp.sendEmail(SETTINGS.sendTo, subject, plainText_(d, street, suburb, received), opts);
}

/* ---------- rendering ---------- */

function renderHtml_(d, street, suburb, photo, received, mode) {
  const seller = mode === 'seller';
  const font = 'Helvetica,Arial,sans-serif', serif = "Georgia,'Times New Roman',serif";
  const label = t => `<div style="font:700 11px ${font};letter-spacing:2px;text-transform:uppercase;color:${C.red};margin-bottom:4px">${t}</div>`;
  const row = (k, v) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.line};color:${C.muted};font:600 13px ${font};width:38%;vertical-align:top">${k}</td><td style="padding:10px 0;border-bottom:1px solid ${C.line};color:${C.ink};font:700 14px ${font};text-align:right">${v}</td></tr>`;
  const table = rows => `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tbody>${rows}</tbody></table>`;
  const lines = arr => arr.filter(Boolean).map(esc_).join('<br>');

  const deposits = [
    d.dep1 ? `Initial deposit $${esc_(d.dep1)} <span style="color:${C.muted};font-weight:500">on signing</span>` : '',
    d.dep2 ? `Second deposit $${esc_(d.dep2)} <span style="color:${C.muted};font-weight:500">when unconditional</span>` : '',
  ].filter(Boolean).map(t => `<div style="font:600 13px ${font};color:${C.ink};margin-top:4px">${t}</div>`).join('');

  let buyers = row('Buyer 1', esc_(d.b1name)) + (seller ? '' : row('Contact', lines([d.b1email, d.b1mobile])));
  if (d.joint) buyers += row('Buyer 2', esc_(d.b2name)) + (seller ? '' : row('Contact', lines([d.b2email, d.b2mobile])));

  const terms = row('Finance', clause_(d.finance)) + row('Building &amp; pest', clause_(d.bp)) +
    row('Settlement', esc_(d.settlement || '—')) + row('Special conditions', esc_(d.other || 'None'));

  const sol = (seller ? lines([d.solName, d.solFirm]) : lines([d.solName, d.solFirm, d.solEmail, d.solPhone])) || 'To follow';
  const lic = (d.licences || []).filter(l => l && l.data).map(l => esc_(l.who) + ' ✓').join('<br>') || 'To follow';
  const solSection = seller
    ? `<div style="margin-top:22px">${label('Buyer’s solicitor')}${table(row('Solicitor / conveyancer', sol))}</div>`
    : `<div style="margin-top:22px">${label('Solicitor &amp; ID')}${table(row('Solicitor / conveyancer', sol) + row('Driver licence', lic))}</div>`;

  return `<div style="max-width:620px;margin:0 auto">
  <div style="padding:4px 4px 16px">
    <div style="font:600 20px ${serif};color:${C.ink}">${esc_(SETTINGS.agent)}</div>
    <div style="font:600 10px ${font};letter-spacing:2px;text-transform:uppercase;color:${C.muted};margin-top:3px">${esc_(SETTINGS.office)}</div>
  </div>
  <div style="background:#fff;border:1px solid ${C.line};border-radius:16px">
    ${photo ? `<img src="${esc_(photo)}" width="100%" style="display:block;width:100%;height:auto;border-radius:14px 14px 0 0" alt="">` : ''}
    <div style="padding:24px 26px 26px">
      ${label(seller ? 'Offer received on your property' : 'New offer received')}
      <div style="font:500 28px ${serif};color:${C.ink};margin:8px 0 2px">${esc_(street)}</div>
      <div style="font:500 14px ${font};color:${C.muted}">${esc_(suburb)}</div>
      <div style="margin-top:18px;padding:16px 18px;background:${C.cream};border-radius:12px">
        <div style="font:600 12px ${font};color:${C.muted}">Offer price</div>
        <div style="font:600 34px ${serif};color:${C.red};margin-top:2px">$${esc_(d.amount)}</div>
        ${deposits}
      </div>
      <div style="margin-top:22px">${label('Buyers')}${table(buyers)}</div>
      <div style="margin-top:22px">${label('Terms')}${table(terms)}</div>
      ${solSection}
      <div style="margin-top:22px;font:500 12px ${font};color:${C.muted};line-height:1.5">Received ${esc_(received)}. This is an offer only and is not binding until a contract is signed by both buyer and seller.</div>
    </div>
  </div>
  <div style="padding:16px 4px;font:500 12px ${font};color:${C.muted}">${esc_(SETTINGS.agent)} · ${esc_(SETTINGS.office)} · ${esc_(SETTINGS.phone)} · ${esc_(SETTINGS.email)}</div>
</div>`;
}

function plainText_(d, street, suburb, received) {
  const L = [
    'NEW OFFER RECEIVED', `${street}, ${suburb}`, `Offer price: $${d.amount}`,
    d.dep1 && `Initial deposit: $${d.dep1} on signing`, d.dep2 && `Second deposit: $${d.dep2} when unconditional`, '',
    'BUYERS', `Buyer 1: ${d.b1name} · ${d.b1email} · ${d.b1mobile}`,
    d.joint && `Buyer 2: ${d.b2name} · ${d.b2email} · ${d.b2mobile}`, '',
    'TERMS', `Finance: ${clause_(d.finance)}`, `Building & pest: ${clause_(d.bp)}`,
    `Settlement: ${d.settlement}`, `Special conditions: ${d.other || 'None'}`, '',
    'SOLICITOR', [d.solName, d.solFirm, d.solEmail, d.solPhone].filter(Boolean).join(' · ') || 'To follow', '',
    `Received ${received}. This is an offer only and is not binding until a contract is signed by both buyer and seller.`,
  ];
  return L.filter(x => x !== false && x !== undefined && x !== null).join('\n');
}

function renderIdHtml_(d, street, suburb, licences) {
  const font = 'Helvetica,Arial,sans-serif', serif = "Georgia,'Times New Roman',serif";
  const names = { 'Buyer 1': d.b1name, 'Buyer 2': d.b2name };
  const imgs = licences.map(l => `
    <div style="margin-top:22px;page-break-inside:avoid">
      <div style="font:700 11px ${font};letter-spacing:2px;text-transform:uppercase;color:${C.red};margin-bottom:8px">${esc_(l.who)} – ${esc_(names[l.who] || '')}</div>
      <img src="data:${esc_(l.mime || 'image/jpeg')};base64,${l.data}" style="max-width:100%;max-height:420px;border:1px solid ${C.line};border-radius:8px">
    </div>`).join('');
  return `<div style="max-width:620px;margin:0 auto">
  <div style="font:600 20px ${serif};color:${C.ink}">${esc_(SETTINGS.agent)}</div>
  <div style="font:600 10px ${font};letter-spacing:2px;text-transform:uppercase;color:${C.muted};margin-top:3px">${esc_(SETTINGS.office)}</div>
  <div style="font:700 11px ${font};letter-spacing:2px;text-transform:uppercase;color:${C.red};margin-top:24px">Buyer identification</div>
  <div style="font:500 24px ${serif};color:${C.ink};margin:6px 0 2px">${esc_(street)}</div>
  <div style="font:500 14px ${font};color:${C.muted}">${esc_(suburb)}</div>
  ${imgs}
  <div style="margin-top:22px;font:500 11px ${font};color:${C.muted}">Confidential. Collected to verify the buyer's identity for this offer. Don't forward to the seller.</div>
</div>`;
}

function toPdf_(html, name) {
  try {
    return Utilities.newBlob('<html><body style="margin:24px">' + html + '</body></html>', 'text/html', 'doc.html')
      .getAs('application/pdf').setName(name);
  } catch (err) { console.warn('PDF failed: ' + name, err); return null; }
}

/* ---------- helpers ---------- */

function clause_(v) { return !v || v === 'None' ? 'No' : 'Yes – ' + v; }

function splitAddress_(a) {
  const i = String(a).lastIndexOf(',');
  return i < 0 ? [a, ''] : [a.slice(0, i).trim(), a.slice(i + 1).trim()];
}

function listingPhoto_(url) {
  try {
    if (!/^https:\/\/shailerpark\.eldersrealestate\.com\.au\//.test(url)) return '';
    const cache = CacheService.getScriptCache(), hit = cache.get(url);
    if (hit) return hit;
    const page = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true }).getContentText();
    const m = page.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
              page.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const img = m && /^https:\/\//.test(m[1]) ? m[1] : '';
    if (img) cache.put(url, img, 21600);
    return img;
  } catch (err) { return ''; }
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Run this once from the editor to approve permissions and see a sample email. */
function sendTestOffer() {
  sendOffer_({
    property: '1 Holder Street, Loganholme',
    listingUrl: 'https://shailerpark.eldersrealestate.com.au/residential/sale/1-holder-street-loganholme-qld-4129-37P6630/',
    amount: '760,000', dep1: '20,000', dep2: '',
    b1name: 'Test Buyer', b1email: SETTINGS.email, b1mobile: '0400 000 000',
    joint: false, finance: '14 days', bp: '7 days', settlement: '30 days', other: '',
    solName: '', solFirm: '', solEmail: '', solPhone: '', licences: [],
  });
}
