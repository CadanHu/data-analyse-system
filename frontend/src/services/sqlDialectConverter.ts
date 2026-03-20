/**
 * sqlDialectConverter.ts — MySQL → SQLite SQL 方言转换层
 *
 * 离线模式下，AI 会生成 MySQL 方言的 SQL，但本地只有 SQLite。
 * 该模块将常见的 MySQL 函数和语法翻译为 SQLite 兼容版本。
 *
 * 同时将表名从原始名 (如 orders) 转换为本地前缀名 (如 biz_classic_business__orders)。
 */

// ==================== 类型映射 ====================

/** 将 MySQL 列类型字符串映射到 SQLite 类型 */
export function mysqlTypeToSQLite(mysqlType: string): string {
  const t = mysqlType.toUpperCase()
  if (/INT|BIT\b|BOOL/.test(t)) return 'INTEGER'
  if (/FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL/.test(t)) return 'REAL'
  if (/BLOB|BINARY/.test(t)) return 'BLOB'
  return 'TEXT' // VARCHAR, CHAR, TEXT, DATE, DATETIME, TIMESTAMP, ENUM, SET, JSON…
}

// ==================== SQL 方言转换 ====================

/**
 * 将 MySQL 方言 SQL 转换为 SQLite 兼容 SQL。
 * @param sql       AI 生成的 MySQL SQL
 * @param dbKey     当前业务数据库 key（用于重写表名前缀）
 * @param tableNames 该库所有已同步的表名（用于精确匹配）
 */
export function convertMySQLToSQLite(sql: string, dbKey: string, tableNames: string[]): string {
  let s = sql

  // 1. DATE_FORMAT(col, '%Y-%m') → strftime('%Y-%m', col)
  //    Uses balanced-paren parser to handle nested function calls in first arg.
  s = replaceTopLevelFuncCalls(s, 'DATE_FORMAT', ([col, fmt]) => {
    if (!col || !fmt) return `DATE_FORMAT(${col ?? ''}, ${fmt ?? ''})`
    const sqliteFmt = fmt.trim().replace(/^'|'$/g, '')
    return `strftime('${sqliteFmt}', ${col.trim()})`
  })

  // 2. YEAR(col) → strftime('%Y', col)
  s = s.replace(/\bYEAR\s*\(\s*([^)]+)\s*\)/gi, (_, col) => `strftime('%Y', ${col.trim()})`)

  // 3. MONTH(col) → strftime('%m', col)
  s = s.replace(/\bMONTH\s*\(\s*([^)]+)\s*\)/gi, (_, col) => `strftime('%m', ${col.trim()})`)

  // 4. DAY(col) / DAYOFMONTH(col) → strftime('%d', col)
  s = s.replace(/\b(?:DAY|DAYOFMONTH)\s*\(\s*([^)]+)\s*\)/gi, (_, col) => `strftime('%d', ${col.trim()})`)

  // 5. HOUR(col) → strftime('%H', col)
  s = s.replace(/\bHOUR\s*\(\s*([^)]+)\s*\)/gi, (_, col) => `strftime('%H', ${col.trim()})`)

  // 6. NOW() → datetime('now')
  s = s.replace(/\bNOW\s*\(\s*\)/gi, "datetime('now')")

  // 7. CURDATE() / CURRENT_DATE() → date('now')
  s = s.replace(/\b(?:CURDATE|CURRENT_DATE)\s*\(\s*\)/gi, "date('now')")

  // 8. IFNULL(a, b) → COALESCE(a, b)
  s = s.replace(/\bIFNULL\s*\(/gi, 'COALESCE(')

  // 9. GROUP_CONCAT(col SEPARATOR 'x') → GROUP_CONCAT(col, 'x')
  s = s.replace(/GROUP_CONCAT\s*\(\s*([^)]+?)\s+SEPARATOR\s+'([^']*)'\s*\)/gi,
    (_, col, sep) => `GROUP_CONCAT(${col.trim()}, '${sep}')`)

  // 10. GROUP BY ... WITH ROLLUP → strip WITH ROLLUP (SQLite doesn't support)
  s = s.replace(/\bGROUP\s+BY\s+([\s\S]+?)\s+WITH\s+ROLLUP\b/gi,
    (_, groupCols) => `GROUP BY ${groupCols}`)

  // 11. DATEDIFF(d1, d2) → CAST(julianday(d1) - julianday(d2) AS INTEGER)
  s = s.replace(/\bDATEDIFF\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi,
    (_, d1, d2) => `CAST(julianday(${d1.trim()}) - julianday(${d2.trim()}) AS INTEGER)`)

  // 12. DATE_ADD(date, INTERVAL n unit) → date(date, '+n unit')
  //    Uses balanced-paren parser so first arg can be a nested function call.
  s = replaceTopLevelFuncCalls(s, 'DATE_ADD', ([dt, intervalExpr]) => {
    const m = intervalExpr?.match(/INTERVAL\s+(-?\d+)\s+(\w+)/i)
    if (!m) return `DATE_ADD(${dt ?? ''}, ${intervalExpr ?? ''})`
    return `date(${(dt ?? '').trim()}, '+${m[1]} ${m[2].toLowerCase()}')`
  })

  // 13. DATE_SUB(date, INTERVAL n unit) → date(date, '-n unit')
  //    Uses balanced-paren parser so first arg can be a nested function call.
  s = replaceTopLevelFuncCalls(s, 'DATE_SUB', ([dt, intervalExpr]) => {
    const m = intervalExpr?.match(/INTERVAL\s+(-?\d+)\s+(\w+)/i)
    if (!m) return `DATE_SUB(${dt ?? ''}, ${intervalExpr ?? ''})`
    return `date(${(dt ?? '').trim()}, '-${m[1]} ${m[2].toLowerCase()}')`
  })

  // 14. JSON_ARRAYAGG(col) → json_group_array(col)
  s = s.replace(/\bJSON_ARRAYAGG\s*\(/gi, 'json_group_array(')

  // 15. JSON_OBJECTAGG(k, v) → json_group_object(k, v)
  s = s.replace(/\bJSON_OBJECTAGG\s*\(/gi, 'json_group_object(')

  // 16. JSON_EXTRACT(col, path) → json_extract(col, path)  [SQLite already has this, just lowercase]
  s = s.replace(/\bJSON_EXTRACT\s*\(/gi, 'json_extract(')

  // 17. JSON_UNQUOTE(JSON_EXTRACT(...)) → json_extract(...)  [SQLite returns unquoted natively]
  s = s.replace(/\bJSON_UNQUOTE\s*\(\s*json_extract\s*\(/gi, 'json_extract(')
  s = s.replace(/\bJSON_UNQUOTE\s*\(\s*JSON_EXTRACT\s*\(/gi, 'json_extract(')

  // 18. TRUNCATE(num, digits) → ROUND(num, digits)  [close enough for analytics]
  s = s.replace(/\bTRUNCATE\s*\(\s*([^,]+?)\s*,\s*(\d+)\s*\)/gi,
    (_, num, digits) => `ROUND(${num.trim()}, ${digits})`)

  // 19. CAST(expr AS SIGNED/UNSIGNED) → CAST(expr AS INTEGER)
  s = s.replace(/\bCAST\s*\(\s*([^)]+?)\s+AS\s+(?:SIGNED|UNSIGNED)\s*\)/gi,
    (_, expr) => `CAST(${expr.trim()} AS INTEGER)`)

  // 20. CONVERT(expr, SIGNED/UNSIGNED/CHAR/DECIMAL) → CAST(expr AS ...)
  s = s.replace(/\bCONVERT\s*\(\s*([^,]+?)\s*,\s*(SIGNED|UNSIGNED|INTEGER|CHAR|DECIMAL|FLOAT)\s*\)/gi,
    (_, expr, type) => {
      const sqliteType = /SIGNED|UNSIGNED|INTEGER/.test(type.toUpperCase()) ? 'INTEGER'
        : /CHAR/.test(type.toUpperCase()) ? 'TEXT' : 'REAL'
      return `CAST(${expr.trim()} AS ${sqliteType})`
    })

  // 21. QUARTER(col) → ((CAST(strftime('%m', col) AS INTEGER) - 1) / 4 + 1)
  s = s.replace(/\bQUARTER\s*\(\s*([^)]+)\s*\)/gi,
    (_, col) => `((CAST(strftime('%m', ${col.trim()}) AS INTEGER) - 1) / 3 + 1)`)

  // 22. WEEK(col) → strftime('%W', col)
  s = s.replace(/\bWEEK\s*\(\s*([^),]+?)\s*(?:,\s*\d+\s*)?\)/gi,
    (_, col) => `CAST(strftime('%W', ${col.trim()}) AS INTEGER)`)

  // 23. WEEKDAY(col) → (strftime('%w', col) + 6) % 7  [MySQL: Mon=0, SQLite: Sun=0]
  s = s.replace(/\bWEEKDAY\s*\(\s*([^)]+)\s*\)/gi,
    (_, col) => `((CAST(strftime('%w', ${col.trim()}) AS INTEGER) + 6) % 7)`)

  // 24. DAYOFWEEK(col) → strftime('%w', col) + 1  [MySQL: Sun=1, SQLite: Sun=0]
  s = s.replace(/\bDAYOFWEEK\s*\(\s*([^)]+)\s*\)/gi,
    (_, col) => `(CAST(strftime('%w', ${col.trim()}) AS INTEGER) + 1)`)

  // 25. CONCAT(a, b, ...) → (a || b || ...)  [handles nested function args]
  s = replaceTopLevelFuncCalls(s, 'CONCAT', (args) => `(${args.join(' || ')})`)

  // 26. CONCAT_WS(sep, a, b, ...) → (a || sep || b || ...)
  s = replaceTopLevelFuncCalls(s, 'CONCAT_WS', ([sep, ...rest]) =>
    `(${rest.join(` || ${sep ?? ''} || `)})`)

  // 29b. STR_TO_DATE(expr, format) → expr
  //     SQLite reads ISO date strings natively; the expr is already a valid date string.
  s = replaceTopLevelFuncCalls(s, 'STR_TO_DATE', ([expr]) => expr?.trim() ?? '')

  // 29c. TIMESTAMPDIFF(unit, d1, d2) → SQLite equivalent
  s = replaceTopLevelFuncCalls(s, 'TIMESTAMPDIFF', ([unit, d1, d2]) => {
    const u = (unit ?? '').replace(/['"]/g, '').trim().toUpperCase()
    const a = (d1 ?? '').trim()
    const b = (d2 ?? '').trim()
    switch (u) {
      case 'MONTH':
        return `(CAST(strftime('%Y', ${b}) AS INTEGER) * 12 + CAST(strftime('%m', ${b}) AS INTEGER) - CAST(strftime('%Y', ${a}) AS INTEGER) * 12 - CAST(strftime('%m', ${a}) AS INTEGER))`
      case 'YEAR':
        return `(CAST(strftime('%Y', ${b}) AS INTEGER) - CAST(strftime('%Y', ${a}) AS INTEGER))`
      case 'HOUR':
        return `CAST((julianday(${b}) - julianday(${a})) * 24 AS INTEGER)`
      case 'MINUTE':
        return `CAST((julianday(${b}) - julianday(${a})) * 1440 AS INTEGER)`
      case 'SECOND':
        return `CAST((julianday(${b}) - julianday(${a})) * 86400 AS INTEGER)`
      default: // DAY and fallback
        return `CAST(julianday(${b}) - julianday(${a}) AS INTEGER)`
    }
  })

  // 27. LIMIT offset, count → LIMIT count OFFSET offset  (MySQL shorthand)
  s = s.replace(/\bLIMIT\s+(\d+)\s*,\s*(\d+)\b/gi,
    (_, offset, count) => `LIMIT ${count} OFFSET ${offset}`)

  // 28. Backtick identifiers → double-quote (SQLite prefers double-quotes)
  //     But SQLite also accepts backticks, so this is optional.
  //     We do it anyway for cleanliness.
  s = s.replace(/`([^`]+)`/g, '"$1"')

  // 29. Rewrite table names to prefixed biz_ names
  //     Only rewrite bare table names (not schema-qualified ones like db.table)
  if (dbKey && tableNames.length > 0) {
    const prefix = _bizTablePrefix(dbKey)
    // Sort longest first to avoid partial replacement (e.g., "orders" before "order")
    const sorted = [...tableNames].sort((a, b) => b.length - a.length)
    for (const tbl of sorted) {
      const localName = `${prefix}${tbl}`
      // Match word-boundary occurrence that isn't already prefixed
      const re = new RegExp(`(?<![\\w"'])\\b${escapeRegex(tbl)}\\b(?![\\w"'])`, 'gi')
      s = s.replace(re, `"${localName}"`)
    }
  }

  return s
}

/** Build the SQLite table name prefix for a given db_key */
export function bizTableName(dbKey: string, tableName: string): string {
  return `${_bizTablePrefix(dbKey)}${tableName}`
}

function _bizTablePrefix(dbKey: string): string {
  // Replace non-alphanumeric chars with underscore, then double-underscore as separator
  return `biz_${dbKey.replace(/[^a-zA-Z0-9]/g, '_')}__`
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ==================== Balanced-paren helpers ====================

/**
 * Find every top-level call to `funcName(...)` in `sql`, extract the
 * arguments (split on top-level commas), and replace the whole call with
 * the string returned by `replacer`.  Handles arbitrary nesting depth and
 * quoted strings containing parens/commas.
 */
function replaceTopLevelFuncCalls(
  sql: string,
  funcName: string,
  replacer: (args: string[]) => string
): string {
  const re = new RegExp(`\\b${escapeRegex(funcName)}\\s*\\(`, 'gi')
  let result = ''
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(sql)) !== null) {
    result += sql.slice(lastIndex, match.index)
    const start = match.index + match[0].length // position right after '('
    let depth = 1
    let inSingleQuote = false
    let i = start
    while (i < sql.length && depth > 0) {
      const c = sql[i]
      if (c === "'" && !inSingleQuote) {
        inSingleQuote = true
      } else if (c === "'" && inSingleQuote) {
        inSingleQuote = false
      } else if (!inSingleQuote) {
        if (c === '(') depth++
        else if (c === ')') depth--
      }
      i++
    }
    const argsStr = sql.slice(start, i - 1) // content between outer parens
    const args = splitTopLevelArgs(argsStr)
    result += replacer(args)
    lastIndex = i
    re.lastIndex = lastIndex
  }
  result += sql.slice(lastIndex)
  return result
}

/**
 * Split a function's argument string on top-level commas (ignoring commas
 * inside nested parens or single-quoted strings).
 */
function splitTopLevelArgs(argsStr: string): string[] {
  const args: string[] = []
  let depth = 0
  let inSingleQuote = false
  let current = ''
  for (let i = 0; i < argsStr.length; i++) {
    const c = argsStr[i]
    if (c === "'" && !inSingleQuote) {
      inSingleQuote = true
      current += c
    } else if (c === "'" && inSingleQuote) {
      inSingleQuote = false
      current += c
    } else if (!inSingleQuote && (c === '(' || c === '[')) {
      depth++
      current += c
    } else if (!inSingleQuote && (c === ')' || c === ']')) {
      depth--
      current += c
    } else if (!inSingleQuote && c === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
    } else {
      current += c
    }
  }
  if (current.trim()) args.push(current.trim())
  return args
}
