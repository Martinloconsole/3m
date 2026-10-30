/**
 * 3M · Backend en Google Apps Script
 *
 * Recibe por POST las 3 tareas de un día y las guarda en la solapa "Histórico"
 * con el formato: Fecha | Tarea 1 | Estado 1 | Tarea 2 | Estado 2 | Tarea 3 | Estado 3
 *
 * - Si la fecha ya existe, reemplaza esa fila (así los reintentos no duplican).
 * - La solapa "Control" muestra la última sincronización y estadísticas.
 */

// Cambia este valor y pon el mismo en Ajustes de la app.
const SECRET = 'CAMBIA_ESTE_TOKEN';

const SHEET_CONTROL = 'Control';
const SHEET_HIST = 'Histórico';
const HEADERS = ['Fecha', 'Tarea 1', 'Estado 1', 'Tarea 2', 'Estado 2', 'Tarea 3', 'Estado 3'];

/** Ejecútala una vez a mano para crear las solapas y autorizar permisos. */
function setup() {
  ensureSheets_(SpreadsheetApp.getActiveSpreadsheet());
}

function doGet() {
  return json_({ ok: true, service: '3M' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SECRET && data.token !== SECRET) return json_({ ok: false, error: 'Token inválido' });

    const fecha = String(data.fecha || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json_({ ok: false, error: 'Fecha inválida' });

    const tareas = Array.isArray(data.tareas) ? data.tareas : [];
    const row = [fecha];
    for (let i = 0; i < 3; i++) {
      const t = tareas[i] || {};
      row.push(clean_(t.texto), clean_(t.estado));
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ensureSheets_(ss);
    const hist = sheets.hist;

    // Buscar si ya existe esa fecha
    const last = hist.getLastRow();
    let target = last + 1;
    if (last > 1) {
      const fechas = hist.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
      const idx = fechas.indexOf(fecha);
      if (idx !== -1) target = idx + 2;
    }
    hist.getRange(target, 1, 1, HEADERS.length).setValues([row]);

    sheets.control.getRange('B3').setValue(new Date());
    return json_({ ok: true, fila: target });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/* ---------------- Utilidades ---------------- */

function ensureSheets_(ss) {
  let control = ss.getSheetByName(SHEET_CONTROL);
  let hist = ss.getSheetByName(SHEET_HIST);

  if (!hist) {
    hist = ss.insertSheet(SHEET_HIST);
    hist.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight('bold').setBackground('#1C132B').setFontColor('#E2E8F0');
    hist.getRange('A:A').setNumberFormat('@'); // evita que Sheets convierta la fecha
    hist.setFrozenRows(1);
    hist.setColumnWidths(1, 1, 100);
    [2, 4, 6].forEach(c => hist.setColumnWidth(c, 260));
    [3, 5, 7].forEach(c => hist.setColumnWidth(c, 80));
  }

  if (!control) {
    control = ss.insertSheet(SHEET_CONTROL, 0);
    const h = "'" + SHEET_HIST + "'!";
    const hechas = 'COUNTIF(' + h + 'C2:C,"Sí")+COUNTIF(' + h + 'E2:E,"Sí")+COUNTIF(' + h + 'G2:G,"Sí")';
    const total = 'COUNTIF(' + h + 'C2:C,"?*")+COUNTIF(' + h + 'E2:E,"?*")+COUNTIF(' + h + 'G2:G,"?*")';
    control.getRange('A1').setValue('3M · Panel de control').setFontWeight('bold').setFontSize(14);
    control.getRange('A2:A5').setValues([['Días registrados'], ['Última sincronización'], ['Tareas definidas'], ['Tareas cumplidas (%)']]);
    control.getRange('B2').setFormula('=COUNTA(' + h + 'A2:A)');
    control.getRange('B4').setFormula('=' + total);
    control.getRange('B5').setFormula('=IFERROR((' + hechas + ')/(' + total + '),0)').setNumberFormat('0%');
    control.getRange('B3').setNumberFormat('yyyy-mm-dd hh:mm');
    control.setColumnWidth(1, 200);
    control.setColumnWidth(2, 160);
  }

  // Si se eliminó Control pero existe Histórico, o viceversa, ya quedaron ambas creadas arriba.
  return { control: control, hist: hist };
}

function clean_(v) {
  let s = String(v == null ? '' : v).trim().slice(0, 200);
  // Evita que un texto que empieza con = + - @ se interprete como fórmula
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
