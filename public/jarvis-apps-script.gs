const JARVIS_TEMPLATE_SPREADSHEET_ID = '1_Q4b5ClVDpl0Q6UPmKZ_NKWv1ecAQU42YrGDkHZRrWU'
const JARVIS_OUTPUT_FOLDER_ID = '1rqR7_DTNGRm4_xMViTkZeK6J6xbCDibv'
const JARVIS_APP_URL = 'https://jarvis-warehouse.zinovevkirill234.workers.dev'
const JARVIS_TOKEN_PROPERTY = 'JARVIS_ACCESS_TOKEN_V1'
const JARVIS_HISTORY_PREFIX = 'JARVIS_RUN_V1_'
const JARVIS_MAX_DIRECTIONS = 100
const JARVIS_MAX_ROWS = 20000

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Jarvis')
    .addItem('Показать код доступа', 'showJarvisAccessCode')
    .addToUi()
}

function showJarvisAccessCode() {
  const properties = PropertiesService.getScriptProperties()
  let token = properties.getProperty(JARVIS_TOKEN_PROPERTY)
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '')
    properties.setProperty(JARVIS_TOKEN_PROPERTY, token)
  }

  const html = [
    '<!doctype html><html><head><base target="_top"><style>',
    'body{font:14px Arial,sans-serif;color:#15274f;padding:16px}',
    'p{line-height:1.5;color:#53647e}',
    'textarea{box-sizing:border-box;width:100%;height:78px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font:12px monospace;resize:none}',
    '</style></head><body>',
    '<p>Скопируйте этот код в секрет JARVIS_APPS_SCRIPT_TOKEN в настройках Cloudflare Worker. Не сообщайте его сотрудникам.</p>',
    '<textarea readonly onclick="this.select()">', escapeHtml_(token), '</textarea>',
    '<p>Код сохранён в свойствах скрипта. Его можно снова открыть через меню «Jarvis».</p>',
    '</body></html>',
  ].join('')
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(420).setHeight(240), 'Код доступа Jarvis')
}

function doPost(event) {
  const parameters = event && event.parameter ? event.parameter : {}
  try {
    const expectedToken = PropertiesService.getScriptProperties().getProperty(JARVIS_TOKEN_PROPERTY)
    if (!expectedToken || !constantTimeEquals_(String(parameters.token || ''), expectedToken)) {
      throw new Error('Неверный код доступа. Откройте в таблице меню Jarvis и скопируйте актуальный код.')
    }

    const payloadText = String(parameters.payload || '')
    if (!payloadText || payloadText.length > 5000000) throw new Error('Пустой или слишком большой запрос.')
    const payload = JSON.parse(payloadText)
    const templateSpreadsheet = SpreadsheetApp.openById(JARVIS_TEMPLATE_SPREADSHEET_ID)

    if (payload.action === 'test') {
      return outputResult_(parameters, true, 'Подключение работает', 'Jarvis получил доступ к шаблону «' + templateSpreadsheet.getName() + '».', '')
    }
    if (payload.action !== 'publish') throw new Error('Неизвестная команда Jarvis.')

    const result = publish_(templateSpreadsheet, payload)
    if (result.duplicate) {
      return outputResult_(parameters, true, 'Эта отправка уже обработана', 'Повторная таблица не создавалась.', result.summaryUrl)
    }

    return outputResult_(parameters, true, 'Готово — отдельная таблица создана', 'Созданы городские вкладки: ' + result.reportTitles.join(', ') + ' и сводка.', result.summaryUrl)
  } catch (error) {
    const message = error && error.message ? error.message : 'Не удалось обработать запрос.'
    return outputResult_(parameters, false, 'Не удалось записать отчёт', message, '')
  }
}

function outputResult_(parameters, success, title, message, summaryUrl) {
  if (String(parameters.response || '') === 'json') {
    return ContentService.createTextOutput(JSON.stringify({
      success: success,
      title: title,
      message: message,
      summaryUrl: summaryUrl,
    })).setMimeType(ContentService.MimeType.JSON)
  }
  return resultPage_(success, title, message, summaryUrl)
}

function publish_(templateSpreadsheet, payload) {
  if (!Array.isArray(payload.directions) || !payload.directions.length || payload.directions.length > JARVIS_MAX_DIRECTIONS) {
    throw new Error('Проверьте количество направлений в Jarvis.')
  }
  if (typeof payload.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(payload.requestId)) {
    throw new Error('Не удалось проверить номер отправки. Повторите выгрузку из Jarvis.')
  }
  const directions = normalizeDirections_(payload.directions)
  const totalRows = directions.reduce(function (sum, direction) { return sum + direction.rows.length }, 0)
  if (totalRows > JARVIS_MAX_ROWS) throw new Error('В отчёте слишком много строк для одной отправки.')

  const requestKey = requestKey_(payload.requestId)
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(30000)) throw new Error('Уже обрабатывается другая выгрузка. Подождите и попробуйте ещё раз.')

  try {
    const properties = PropertiesService.getScriptProperties()
    const previous = properties.getProperty(requestKey)
    if (previous) {
      const saved = JSON.parse(previous)
      return { duplicate: true, summaryUrl: saved.summaryUrl }
    }

    const templateSheets = templateSpreadsheet.getSheets()
    const photoFormula = findPhotoFormula_(findTemplate_(templateSheets, 'МСК'))
    const dateTime = Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM.yyyy HH-mm')
    const output = SpreadsheetApp.create('Jarvis — направления — ' + dateTime)
    const createdSheets = []
    try {
      const usedTitles = new Set(output.getSheets().map(function (sheet) { return sheet.getName().toLocaleLowerCase('ru-RU') }))
      const reports = directions.map(function (direction) {
        const destination = destinationFor_(direction.name)
        const title = uniqueTitle_(destination.label, usedTitles)
        const template = findTemplate_(templateSheets, direction.name)
        const reportSheet = createReportSheet_(output, template, title, direction, photoFormula, createdSheets)
        return { title: title, sheet: reportSheet }
      })

      const summaryTitle = uniqueTitle_('Сводка', usedTitles)
      const summarySheet = createSummarySheet_(output, null, summaryTitle, directions, reports, createdSheets)
      const createdSheetIds = new Set(createdSheets.map(function (sheet) { return sheet.getSheetId() }))
      output.getSheets().filter(function (sheet) { return !createdSheetIds.has(sheet.getSheetId()) })
        .forEach(function (sheet) { output.deleteSheet(sheet) })
      summarySheet.activate()
      output.moveActiveSheet(output.getSheets().length)
      SpreadsheetApp.flush()
      const outputFile = DriveApp.getFileById(output.getId())
      outputFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT)
      outputFile.moveTo(DriveApp.getFolderById(JARVIS_OUTPUT_FOLDER_ID))
      trimHistory_(properties)
      const summaryUrl = output.getUrl() + '#gid=' + summarySheet.getSheetId()
      const entry = { spreadsheetId: output.getId(), summaryUrl: summaryUrl, createdAt: Date.now() }
      properties.setProperty(requestKey, JSON.stringify(entry))

      return {
        duplicate: false,
        reportTitles: reports.map(function (report) { return report.title }),
        summaryTitle: summaryTitle,
        summaryUrl: summaryUrl,
      }
    } catch (error) {
      try { DriveApp.getFileById(output.getId()).setTrashed(true) } catch (_cleanupError) { /* Keep the original failure. */ }
      throw error
    }
  } finally {
    lock.releaseLock()
  }
}

function normalizeDirections_(value) {
  if (!Array.isArray(value)) throw new Error('В запросе не найден список направлений.')
  return value.map(function (item) {
    if (!item || typeof item.name !== 'string' || !Array.isArray(item.rows)) {
      throw new Error('Структура одного из направлений повреждена.')
    }
    const rows = item.rows.map(function (row) {
      if (!row || typeof row.article !== 'string') throw new Error('В отчёте найдена строка без артикула.')
      return {
        article: safeText_(row.article, 250),
        needed: safeNumber_(row.needed),
        box: safeText_(row.box || '—', 120),
        section: safeText_(row.section || '—', 120),
        available: safeNumber_(row.available),
        allocated: safeNumber_(row.allocated),
        remainingNeed: safeNumber_(row.remainingNeed),
        status: row.status === 'not_found' || row.status === 'shortage' ? row.status : 'enough',
        shortage: safeNumber_(row.shortage),
      }
    })
    return {
      name: safeText_(item.name, 160) || 'Направление',
      sourceFileName: safeText_(item.sourceFileName || '', 240),
      rows: rows,
    }
  })
}

function createReportSheet_(spreadsheet, template, title, direction, photoFormula, createdSheets) {
  const rows = direction.rows.filter(function (row) { return row.allocated > 0 })
  const sheet = createSheetFromTemplate_(spreadsheet, template, title, 4, rows.length + 2, createdSheets)
  const destination = destinationFor_(direction.name)

  sheet.getRange(1, 1).setValue(destination.label)
  sheet.getRange(2, 1, 1, 4).setValues([['Артикул', 'Короб', 'Взять, шт.', 'ФОТО']])
  if (rows.length) {
    sheet.getRange(3, 1, rows.length, 3).setValues(rows.map(function (row) {
      return [safeSheetText_(row.article), safeSheetText_(row.box), row.allocated]
    }))
    if (photoFormula) {
      sheet.getRange(3, 4, rows.length, 1).setFormulas(rows.map(function () { return [photoFormula] }))
    }
  }

  sheet.setFrozenRows(2)
  if (rows.length) sheet.setRowHeights(3, rows.length, 150)
  fitSheetGrid_(sheet, 4, rows.length + 2)
  if (!template) styleManualReportSheet_(sheet, rows.length)
  return sheet
}

function findPhotoFormula_(template) {
  if (!template || template.getMaxRows() < 3 || template.getMaxColumns() < 4) return ''
  const sampleCount = Math.min(20, template.getMaxRows() - 2)
  return template.getRange(3, 4, sampleCount, 1).getFormulas()
    .map(function (row) { return row[0] })
    .find(function (formula) { return Boolean(formula) }) || ''
}

function styleManualReportSheet_(sheet, rowCount) {
  sheet.setColumnWidth(1, 190)
  sheet.setColumnWidth(2, 130)
  sheet.setColumnWidth(3, 130)
  sheet.setColumnWidth(4, 110)
  sheet.getRange(1, 1, 1, 4)
    .setBackground('#ffffff')
    .setFontFamily('Calibri')
    .setFontSize(11)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
  sheet.getRange(2, 1, 1, 4)
    .setBackground('#334155')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
  if (!rowCount) return

  sheet.getRange(3, 1, rowCount, 4).setVerticalAlignment('middle').setHorizontalAlignment('center')
  sheet.getRange(3, 1, rowCount, 1).setFontWeight('bold').setFontColor('#111827')
  sheet.getRange(3, 2, rowCount, 1).setFontColor('#334155')
  sheet.getRange(3, 3, rowCount, 1).setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold')
  sheet.getRange(3, 4, rowCount, 1).setBackground('#d9ead3')
}

function createSummarySheet_(spreadsheet, template, title, directions, reports, createdSheets) {
  const sheet = createSheetFromTemplate_(spreadsheet, template, title, 9, directions.length + 2, createdSheets)
  const values = [['Направление', 'Исходный файл', 'Артикулов', 'Строк', 'Нужно, шт.', 'Взять, шт.', 'Дефицит, шт.', 'Не найдено', 'Отчёт']]
  const totals = { articles: 0, rows: 0, needed: 0, allocated: 0, shortage: 0, notFound: 0 }

  directions.forEach(function (direction, index) {
    const summary = summarizeRows_(direction.rows)
    totals.articles += summary.articles
    totals.rows += summary.rows
    totals.needed += summary.needed
    totals.allocated += summary.allocated
    totals.shortage += summary.shortage
    totals.notFound += summary.notFound
    values.push([
      safeSheetText_(direction.name),
      safeSheetText_(direction.sourceFileName),
      summary.articles,
      summary.rows,
      summary.needed,
      summary.allocated,
      summary.shortage,
      summary.notFound,
      '',
    ])
  })
  values.push(['ИТОГО', '', totals.articles, totals.rows, totals.needed, totals.allocated, totals.shortage, totals.notFound, ''])

  writeTable_(sheet, values, 9)
  directions.forEach(function (_direction, index) {
    const reportSheet = reports[index].sheet
    const url = spreadsheet.getUrl() + '#gid=' + reportSheet.getSheetId()
    sheet.getRange(index + 2, 9).setFormula('=HYPERLINK("' + url + '","Открыть")')
  })
  sheet.getRange(values.length, 1, 1, 9).setBackground('#e2e8f0').setFontColor('#172554').setFontWeight('bold')
  sheet.setColumnWidth(1, 180)
  sheet.setColumnWidth(2, 230)
  sheet.setColumnWidths(3, 6, 110)
  sheet.setColumnWidth(9, 110)
  fitSheetGrid_(sheet, 9, values.length)
  return sheet
}

function fitSheetGrid_(sheet, lastColumn, lastRow) {
  const maxColumns = sheet.getMaxColumns()
  sheet.showColumns(1, lastColumn)
  if (maxColumns > lastColumn) sheet.hideColumns(lastColumn + 1, maxColumns - lastColumn)

  const maxRows = sheet.getMaxRows()
  sheet.showRows(1, lastRow)
  if (maxRows > lastRow) sheet.hideRows(lastRow + 1, maxRows - lastRow)
}

function createSheetFromTemplate_(spreadsheet, template, title, columns, rows, createdSheets) {
  const sheet = template ? template.copyTo(spreadsheet) : spreadsheet.insertSheet()
  createdSheets.push(sheet)
  sheet.setName(title)
  sheet.clear({ contentsOnly: true })
  const filter = sheet.getFilter()
  if (filter) filter.remove()
  if (sheet.getMaxRows() < rows) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows())
  if (sheet.getMaxColumns() < columns) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns())
  return sheet
}

function writeTable_(sheet, values, columns) {
  const range = sheet.getRange(1, 1, values.length, columns)
  range.setValues(values)
  sheet.setFrozenRows(1)
  sheet.getRange(1, 1, 1, columns)
    .setBackground('#334155')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
  sheet.getRange(1, 1, values.length, columns).createFilter()
  sheet.getDataRange().setVerticalAlignment('middle')
}

function addStatusRules_(sheet, rowCount) {
  if (rowCount < 2) return
  const statusRange = sheet.getRange(2, 6, rowCount - 1, 1)
  const rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextStartsWith('Дефицит')
      .setBackground('#fff1f2')
      .setFontColor('#be123c')
      .setBold(true)
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Не найден')
      .setBackground('#fff7ed')
      .setFontColor('#c2410c')
      .setBold(true)
      .setRanges([statusRange])
      .build(),
  ]
  sheet.setConditionalFormatRules(rules)
}

function summarizeRows_(rows) {
  const byArticle = new Map()
  rows.forEach(function (row) {
    const existing = byArticle.get(row.article)
    if (existing) {
      existing.needed = Math.max(existing.needed, row.needed)
      existing.shortage = Math.max(existing.shortage, row.shortage)
      if (row.status === 'not_found' || (row.status === 'shortage' && existing.status === 'enough')) existing.status = row.status
    } else {
      byArticle.set(row.article, { needed: row.needed, shortage: row.shortage, status: row.status })
    }
  })
  const articles = Array.from(byArticle.values())
  return {
    articles: articles.length,
    rows: rows.length,
    needed: articles.reduce(function (sum, item) { return sum + item.needed }, 0),
    allocated: rows.reduce(function (sum, item) { return sum + item.allocated }, 0),
    shortage: articles.reduce(function (sum, item) { return sum + item.shortage }, 0),
    notFound: articles.filter(function (item) { return item.status === 'not_found' }).length,
  }
}

function requestKey_(requestId) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, requestId, Utilities.Charset.UTF_8)
  const hash = digest.map(function (byte) {
    return ('0' + (byte & 255).toString(16)).slice(-2)
  }).join('')
  return JARVIS_HISTORY_PREFIX + hash
}

function trimHistory_(properties) {
  const all = properties.getProperties()
  const entries = Object.keys(all).filter(function (key) { return key.indexOf(JARVIS_HISTORY_PREFIX) === 0 })
    .map(function (key) {
      let createdAt = 0
      try { createdAt = JSON.parse(all[key]).createdAt || 0 } catch (_error) { createdAt = 0 }
      return { key: key, createdAt: createdAt }
    })
    .sort(function (left, right) { return right.createdAt - left.createdAt })
  entries.slice(1000).forEach(function (entry) { properties.deleteProperty(entry.key) })
}

function findTemplate_(sheets, routeName) {
  const destination = destinationFor_(routeName)
  const matches = sheets.filter(function (sheet) {
    if (sheet.isSheetHidden() || sheet.getMaxColumns() < 5) return false
    const title = normalizeName_(sheet.getName())
    return destination.aliases.some(function (alias) { return title.indexOf(normalizeName_(alias)) === 0 })
  })
  matches.sort(function (left, right) { return right.getIndex() - left.getIndex() })
  return matches[0] || null
}

function destinationFor_(name) {
  const key = normalizeName_(name)
  if (key.indexOf('мск') >= 0 || key.indexOf('москва') >= 0) return { label: 'МСК', aliases: ['мск', 'москва'] }
  if (key.indexOf('спб') >= 0 || key.indexOf('питер') >= 0 || key.indexOf('санктпетербург') >= 0) return { label: 'СПБ', aliases: ['спб', 'питер', 'санктпетербург'] }
  if (key.indexOf('ростов') >= 0) return { label: 'Ростов', aliases: ['ростов'] }
  if (key.indexOf('казань') >= 0) return { label: 'Казань', aliases: ['казань'] }
  if (key.indexOf('новосиб') >= 0 || key.indexOf('новосибирск') >= 0) return { label: 'Новосиб', aliases: ['новосиб', 'новосибирск'] }
  return { label: name.trim() || 'Направление', aliases: [key] }
}

function normalizeName_(value) {
  return String(value).normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[\s\u200B-\u200D\uFEFF_-]+/g, '')
}

function uniqueTitle_(base, usedTitles) {
  const safeBase = safeText_(base, 85).replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Отчёт Jarvis'
  let title = safeBase
  let suffix = 2
  while (usedTitles.has(title.toLocaleLowerCase('ru-RU'))) {
    title = safeText_(safeBase, 80) + ' (' + suffix + ')'
    suffix += 1
  }
  usedTitles.add(title.toLocaleLowerCase('ru-RU'))
  return title
}

function safeText_(value, maxLength) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLength)
}

function safeSheetText_(value) {
  const text = String(value == null ? '' : value)
  return text.charAt(0) === '=' ? "'" + text : text
}

function safeNumber_(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function constantTimeEquals_(left, right) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]
  })
}

function resultPage_(success, title, message, summaryUrl) {
  const color = success ? '#168653' : '#b4233f'
  const link = summaryUrl
    ? '<p><a href="' + escapeHtml_(summaryUrl) + '" target="_blank">Открыть результат в таблице</a></p>'
    : ''
  const html = [
    '<!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>body{margin:0;padding:32px;background:#f7f9fc;font:15px Arial,sans-serif;color:#15274f}.card{max-width:560px;margin:8vh auto;padding:28px;background:#fff;border:1px solid #dfe6ef;border-radius:16px}h1{font-size:22px;color:', color, '}p{line-height:1.6;color:#53647e}a{color:#2563a9;font-weight:bold}small{color:#8794a8}</style>',
    '</head><body><main class="card"><h1>', escapeHtml_(title), '</h1><p>', escapeHtml_(message), '</p>', link,
    '<p><a href="', JARVIS_APP_URL, '" target="_blank">Вернуться в Jarvis</a></p>',
    '<small>Окно можно закрыть после проверки результата.</small></main></body></html>',
  ].join('')
  return HtmlService.createHtmlOutput(html).setTitle('Jarvis — ' + title)
}
