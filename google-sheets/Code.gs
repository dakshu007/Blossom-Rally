/**
 * Blossom Rally → Google Sheets email collector
 *
 * Setup (once):
 *  1. Create a Google Sheet → Extensions → Apps Script → paste this whole file → Save.
 *  2. Deploy → New deployment → type "Web app"
 *       Execute as: Me      Who has access: Anyone
 *     → Deploy → authorize → copy the Web app URL (ends with /exec).
 *  3. Put that URL in site/js/config.js → sheetsWebhook.
 *
 * One row per email. The site calls it when someone submits their email,
 * when they verify the code, and when a download starts.
 */
const SHEET_NAME = 'Racers';
const HEADERS = ['Email', 'Submitted at', 'Verified at', 'Downloads', 'Platforms', 'Last activity', 'Country / language', 'Device'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const email = String(p.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json_({ ok: false, error: 'bad_email' });
    const event = ['submitted', 'verified', 'downloaded'].indexOf(p.event) >= 0 ? p.event : 'submitted';
    const now = new Date();

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sh.getLastRow() === 0) {
      sh.appendRow(HEADERS);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#fbd9e3');
    }

    const hit = sh.getRange('A:A').createTextFinder(email).matchEntireCell(true).findNext();
    let row;
    if (hit) {
      row = hit.getRow();
    } else {
      sh.appendRow([safe_(email), now, '', 0, '', now, safe_(p.lang), safe_(p.device)]);
      row = sh.getLastRow();
    }

    if (event === 'verified' && !sh.getRange(row, 3).getValue()) sh.getRange(row, 3).setValue(now);
    if (event === 'downloaded') {
      const n = Number(sh.getRange(row, 4).getValue()) || 0;
      sh.getRange(row, 4).setValue(n + 1);
      const plat = String(p.platform || '').replace(/[^a-z]/gi, '');
      const cur = String(sh.getRange(row, 5).getValue() || '');
      if (plat && cur.split(', ').indexOf(plat) < 0) sh.getRange(row, 5).setValue(cur ? cur + ', ' + plat : plat);
      if (!sh.getRange(row, 3).getValue()) sh.getRange(row, 3).setValue(now);
    }
    sh.getRange(row, 6).setValue(now);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() { return json_({ ok: true, service: 'blossom-rally-sheets' }); }

// Stop spreadsheet formula injection (=, +, -, @ at the start of a cell).
function safe_(v) {
  const s = String(v == null ? '' : v).slice(0, 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
