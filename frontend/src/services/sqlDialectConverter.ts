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
  s = s.replace(/DATE_FORMAT\s*\(\s*([^,]+?)\s*,\s*'([^']+)'\s*\)/gi, (_, col, fmt) => {
    return `strftime('${fmt}', ${col.trim()})`
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

  // 10. Backtick identifiers → double-quote (SQLite prefers double-quotes)
  //     But SQLite also accepts backticks, so this is optional.
  //     We do it anyway for cleanliness.
  s = s.replace(/`([^`]+)`/g, '"$1"')

  // 11. Rewrite table names to prefixed biz_ names
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
