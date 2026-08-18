const SPREADSHEET_ID = '1fiqRuxUcOAX2vMyiQ-5Wu8MZvSyfM_7aok8wJlKEonQ';
const INVENTORY_SHEET = 'Inventory';
const TRANSACTIONS_SHEET = 'Transactions';
const CONFIG_SHEET = 'Config';

function setupApi() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('STOCK_API_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('STOCK_API_TOKEN', token);
  }
  Logger.log('STOCK_API_TOKEN: ' + token);
  return token;
}

function doGet(e) {
  try {
    assertToken_(e && e.parameter ? e.parameter.token : '');
    const action = (e && e.parameter && e.parameter.action) || 'inventory';
    if (action === 'inventory') return json_({ ok: true, items: getInventory_() });
    if (action === 'transactions') {
      const limit = Math.min(Math.max(Number((e && e.parameter && e.parameter.limit) || 12), 1), 100);
      return json_({ ok: true, items: getTransactions_(limit) });
    }
    if (action === 'health') return json_({ ok: true, service: 'stationery-stock', time: new Date().toISOString() });
    throw new Error('Unknown action.');
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    assertToken_(body.token || '');
    if (body.action === 'record') return json_({ ok: true, result: recordMovement_(body) });
    if (body.action === 'addItem') return json_({ ok: true, result: addItem_(body) });
    throw new Error('Unknown action.');
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

function getInventory_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(INVENTORY_SHEET);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1).filter(r => r[0] && r[1]).map(r => ({
    airline: String(r[0]).trim(),
    item: String(r[1]).trim(),
    stockValue: r[2] === '' ? '' : r[2],
    valueType: String(r[3] || 'NUMBER').trim().toUpperCase(),
    remarks: String(r[4] || '').trim(),
    minLevel: r[5] === '' ? '' : Number(r[5]),
    lastUpdated: r[6] instanceof Date ? r[6].toISOString() : String(r[6] || ''),
    active: r[7] === '' ? true : Boolean(r[7])
  }));
}

function getTransactions_(limit) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TRANSACTIONS_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const count = Math.min(limit, lastRow - 1);
  const startRow = lastRow - count + 1;
  const values = sheet.getRange(startRow, 1, count, 10).getValues();
  return values.reverse().map(r => ({
    timestamp: r[0] instanceof Date ? r[0].toISOString() : String(r[0] || ''),
    staffName: String(r[1] || '').trim(),
    staffEmail: String(r[2] || '').trim(),
    airline: String(r[3] || '').trim(),
    item: String(r[4] || '').trim(),
    action: String(r[5] || '').trim(),
    previousValue: r[6] === '' ? '' : r[6],
    changeValue: r[7] === '' ? '' : r[7],
    resultingValue: r[8] === '' ? '' : r[8],
    remarks: String(r[9] || '').trim()
  }));
}

function recordMovement_(body) {
  requireText_(body.staffName, 'Staff name');
  requireText_(body.staffEmail, 'Staff email');
  requireText_(body.airline, 'Airline');
  requireText_(body.item, 'Item');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(INVENTORY_SHEET);
    const values = sheet.getDataRange().getValues();
    const targetAirline = String(body.airline).trim().toLowerCase();
    const targetItem = String(body.item).trim().toLowerCase();
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim().toLowerCase() === targetAirline && String(values[i][1]).trim().toLowerCase() === targetItem && values[i][7] !== false) {
        rowIndex = i + 1;
        break;
      }
    }
    if (rowIndex < 0) throw new Error('Stationery item was not found.');

    const row = sheet.getRange(rowIndex, 1, 1, 8).getValues()[0];
    const valueType = String(row[3] || 'NUMBER').toUpperCase();
    const previous = row[2];
    let resulting;
    let changeDisplay;
    let action = String(body.movement || '').toUpperCase();

    if (valueType === 'STATUS') {
      if (action !== 'SET_STATUS') throw new Error('This item uses availability status, not quantity.');
      resulting = String(body.value || '').trim();
      if (!resulting) throw new Error('Availability status is required.');
      changeDisplay = resulting;
    } else {
      const current = Number(previous || 0);
      const amount = Number(body.value);
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter a valid quantity.');
      if (action === 'RECEIVE') resulting = current + amount;
      else if (action === 'ISSUE') resulting = current - amount;
      else if (action === 'SET') resulting = amount;
      else throw new Error('Invalid stock action.');
      if (resulting < 0) throw new Error('Not enough stock is available for this issue.');
      changeDisplay = amount;
    }

    const now = new Date();
    sheet.getRange(rowIndex, 3).setValue(resulting);
    sheet.getRange(rowIndex, 7).setValue(now);
    appendTransaction_(ss, [
      now,
      String(body.staffName).trim(),
      String(body.staffEmail).trim(),
      String(body.airline).trim(),
      String(body.item).trim(),
      action,
      previous,
      changeDisplay,
      resulting,
      String(body.remarks || '').trim()
    ]);

    if (valueType === 'NUMBER') {
      const minLevel = row[5] === '' ? Number(getConfig_().DEFAULT_MIN_LEVEL || 5) : Number(row[5]);
      maybeSendLowStockAlert_(String(body.airline).trim(), String(body.item).trim(), Number(previous || 0), Number(resulting), minLevel);
    }
    return { airline: body.airline, item: body.item, previous: previous, resulting: resulting };
  } finally {
    lock.releaseLock();
  }
}

function addItem_(body) {
  requireText_(body.staffName, 'Staff name');
  requireText_(body.staffEmail, 'Staff email');
  requireText_(body.airline, 'Airline');
  requireText_(body.item, 'Item name');
  const valueType = String(body.valueType || 'NUMBER').toUpperCase();
  if (['NUMBER', 'STATUS'].indexOf(valueType) === -1) throw new Error('Invalid item type.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(INVENTORY_SHEET);
    const values = sheet.getDataRange().getValues();
    const airline = String(body.airline).trim();
    const item = String(body.item).trim();
    const duplicate = values.slice(1).some(r => String(r[0]).trim().toLowerCase() === airline.toLowerCase() && String(r[1]).trim().toLowerCase() === item.toLowerCase() && r[7] !== false);
    if (duplicate) throw new Error('This stationery item already exists for ' + airline + '.');

    let initialValue;
    let minLevel = '';
    if (valueType === 'NUMBER') {
      initialValue = Number(body.initialValue || 0);
      minLevel = Number(body.minLevel === '' || body.minLevel == null ? getConfig_().DEFAULT_MIN_LEVEL || 5 : body.minLevel);
      if (!Number.isFinite(initialValue) || initialValue < 0 || !Number.isFinite(minLevel) || minLevel < 0) throw new Error('Opening quantity and minimum level must be valid numbers.');
    } else {
      initialValue = String(body.initialValue || 'Yes').trim();
    }

    const now = new Date();
    sheet.appendRow([airline, item, initialValue, valueType, String(body.remarks || '').trim(), minLevel, now, true]);
    appendTransaction_(ss, [now, String(body.staffName).trim(), String(body.staffEmail).trim(), airline, item, 'ADD_ITEM', '', initialValue, initialValue, String(body.remarks || '').trim()]);
    if (valueType === 'NUMBER' && initialValue <= minLevel) maybeSendLowStockAlert_(airline, item, minLevel + 1, initialValue, minLevel);
    return { airline: airline, item: item, stockValue: initialValue };
  } finally {
    lock.releaseLock();
  }
}

function appendTransaction_(ss, row) {
  ss.getSheetByName(TRANSACTIONS_SHEET).appendRow(row);
}

function getConfig_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const values = sheet.getDataRange().getValues();
  const config = {};
  values.slice(1).forEach(r => { if (r[0]) config[String(r[0]).trim()] = r[1]; });
  return config;
}

function maybeSendLowStockAlert_(airline, item, previous, resulting, minLevel) {
  if (!(previous > minLevel && resulting <= minLevel)) return;
  const config = getConfig_();
  const to = String(config.ALERT_EMAIL || '').trim();
  if (!to) return;
  MailApp.sendEmail({
    to: to,
    subject: 'Low stationery stock: ' + airline + ' - ' + item,
    body: 'Stationery Stock Alert\n\nAirline: ' + airline + '\nItem: ' + item + '\nCurrent stock: ' + resulting + '\nMinimum level: ' + minLevel + '\n\nPlease arrange replenishment.',
    name: String(config.APP_NAME || 'Stationery Stock')
  });
}

function assertToken_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty('STOCK_API_TOKEN');
  if (!expected) throw new Error('API token has not been initialized. Run setupApi() once.');
  if (!provided || provided !== expected) throw new Error('Unauthorized request.');
}

function requireText_(value, label) {
  if (!String(value || '').trim()) throw new Error(label + ' is required.');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
