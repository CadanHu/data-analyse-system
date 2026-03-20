# 方案A（内置演示数据）+ 方案B（CSV 导入）规格说明

> **最后更新**: 2026-03-19
> **主力分支**: `main`
> **状态**: 已实现，待设备验证

---

## 一、背景与目标

无后端用户安装 APK 后，本地 SQLite 没有业务数据，AI 数据分析功能完全不可用。
需要两条独立路径让用户自给数据：

| 方案 | 目标用户 | 特点 |
|------|---------|------|
| **方案A**：内置演示数据 | 所有新用户 | 零门槛，开箱即用，无需任何文件 |
| **方案B**：CSV 文件导入 | 有自有数据的用户 | 支持手机本地 CSV，分析自己的数据 |

两方案共用同一套底层 API，UI 入口均在 `BizSyncModal`，互不冲突，同时也保留原有服务器同步功能。

---

## 二、新增文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `scripts/generate_demo_ts.py` | 工具脚本 | 生成演示数据，固定随机种子 42，一次性运行后提交 |
| `frontend/src/services/demoData.ts` | **自动生成，勿手改** | 列定义 + 行数据静态 TypeScript 常量 |
| `frontend/src/services/demoDataService.ts` | 服务层 | 方案A：初始化/检查演示数据库 |
| `frontend/src/services/csvImportService.ts` | 服务层 | 方案B：解析 CSV 并写入本地 SQLite |

---

## 三、方案A：内置演示数据

### 3.1 演示数据库标识

```
DEMO_DB_KEY = 'demo_classic_business'
```

本地表名格式：`biz_demo_classic_business__<tableName>`

### 3.2 数据规模

| 表名 | 行数 | 关键字段 |
|------|------|---------|
| `products` | 50 | product_id, product_name, category, buy_price, msrp, quantity_in_stock, tags, created_at |
| `customers` | 300 | customer_id, customer_name, segment, city, province, email, phone, **latitude, longitude** |
| `marketing_campaigns` | 3 | campaign_id, campaign_name, start_date, end_date, budget |
| `orders` | 3,000 | order_id, order_date, customer_id, campaign_id, status, shipping_cost, payment_method |
| `order_details` | 9,000 | detail_id, order_id, product_id, quantity_ordered, price_each, discount_amount |
| `returns` | 90 | return_id, order_id, product_id, return_date, reason, refund_amount |
| **合计** | **12,443** | |

> **customers 表额外字段说明**：`latitude` / `longitude` 为各城市坐标（加轻微抖动），用于地图可视化。

### 3.3 城市坐标数据

```python
CITY_COORDS = {
    '北京':  ('北京', 39.9042, 116.4074),
    '上海':  ('上海', 31.2304, 121.4737),
    '广州':  ('广东', 23.1291, 113.2644),
    '深圳':  ('广东', 22.5431, 114.0579),
    '杭州':  ('浙江', 30.2741, 120.1551),
    '武汉':  ('湖北', 30.5928, 114.3055),
    '成都':  ('四川', 30.5728, 104.0668),
    '南京':  ('江苏', 32.0603, 118.7969),
    '西安':  ('陕西', 34.3416, 108.9398),
    '重庆':  ('重庆', 29.5630, 106.5516),
    '苏州':  ('江苏', 31.2990, 120.5853),
    '郑州':  ('河南', 34.7472, 113.6249),
}
```

### 3.4 服务层 API（`demoDataService.ts`）

```typescript
export const DEMO_DB_KEY = 'demo_classic_business'

// 检查所有表是否已在 biz_sync_meta 中（幂等检查）
export async function isDemoDbInitialized(): Promise<boolean>

// 获取演示库总行数（用于 UI 显示）
export async function getDemoDbRowCount(): Promise<number>

// 初始化或重新初始化演示库
// force=true 时先 clearBizSyncMeta 再重建
export async function initDemoDatabase(
  onProgress?: ProgressCallback,
  force = false
): Promise<void>
```

### 3.5 初始化流程

1. 非 native 平台 → 直接 return（no-op）
2. `!force && isDemoDbInitialized()` → return（幂等）
3. `clearBizSyncMeta(DEMO_DB_KEY)`
4. 计算 `totalRows` = 所有表行数之和（用于全局进度百分比）
5. 逐表执行：
   - `createBusinessTable(bizTableName(DEMO_DB_KEY, tbl), cols)`
   - 每 500 行一批 `bulkInsertBusinessRows` + 调 `onProgress`（全局行权重百分比）
   - `upsertBizSyncMeta({ db_key, table_name, synced_at, row_count })`

> **进度计算**：以全局已插入行数 / 总行数计算 percent，避免 order_details（9000行）独占末段导致进度假跳。

### 3.6 重新生成演示数据

如需修改数据规模或字段，重新运行生成脚本后提交：

```bash
cd scripts && python3 generate_demo_ts.py
# 输出写到 ../frontend/src/services/demoData.ts
```

---

## 四、方案B：CSV 文件导入

### 4.1 依赖

```json
"papaparse": "^5.4.1"         // dependencies
"@types/papaparse": "^5.3.14" // devDependencies
```

### 4.2 服务层 API（`csvImportService.ts`）

```typescript
export interface CsvPreview {
  headers: string[]                        // sanitized 列名
  rawHeaders: string[]                     // 原始 CSV 表头
  types: string[]                          // 推断的 SQLite 类型
  rows: (string | number | null)[][]       // 前 N 行（默认5行）
}

// 预览（不导入），供 UI 渲染表格
export async function previewCsvFile(file: File, maxRows = 5): Promise<CsvPreview>

// 完整导入
export async function importCsvFile(
  file: File,
  dbKey: string,
  tableName: string,
  onProgress?: ProgressCallback
): Promise<{ rowCount: number; dbKey: string; tableName: string }>
```

### 4.3 列名清洗规则（`sanitizeIdentifier`）

```
lowercase
→ 非字母数字替换为 _
→ 合并连续 _
→ 去除开头数字/下划线
→ 截断至 64 字符
→ 若结果为空，fallback 为 'col'
```

### 4.4 类型推断规则（`inferSqliteType`）

| 条件 | 推断类型 |
|------|---------|
| 所有非空值均为整数（`Number.isInteger`） | `INTEGER` |
| 所有非空值均为有限浮点数（`isFinite`） | `REAL` |
| 其他（含日期、布尔、混合）| `TEXT` |

### 4.5 导入流程

1. `Papa.parse(file, { header:true, dynamicTyping:true, skipEmptyLines:true })` 全量解析
2. sanitize 所有列名
3. 对全量数据推断每列类型
4. `createBusinessTable(bizTableName(dbKey, tableName), colDefs)` — drop + recreate
5. 每 500 行批次 `bulkInsertBusinessRows` + `onProgress`
6. `upsertBizSyncMeta({ db_key, table_name, synced_at, row_count })`

> **注意**：每次导入同一 dbKey + tableName 会覆盖原表（`createBusinessTable` 内部执行 `DROP TABLE IF EXISTS`）。

---

## 五、UI 结构（`BizSyncModal.tsx`）

### 5.1 三段式布局

```
┌─ 演示数据区块（绿色边框）────────────────────────────────────┐
│  • 未初始化：[加载演示数据] 按钮 + 说明"~12,440 行样本数据"   │
│  • 已初始化：✓ 已加载 12,443 行  [重新初始化] 按钮           │
│  • 初始化中：进度条（全局行权重百分比）                       │
└────────────────────────────────────────────────────────────┘
┌─ 导入本地 CSV 区块（蓝色边框）───────────────────────────────┐
│  初始态：[选择 CSV 文件] 虚线按钮                             │
│  已选文件：列名+类型标签 + 5行预览表格 + 数据库名/表名输入框  │
│  导入中：进度条                                               │
│  成功：绿色成功横条 + "再次导入" 链接                         │
└────────────────────────────────────────────────────────────┘
┌─ 服务器同步区块（灰色边框）──────────────────────────────────┐
│  isOfflineMode=true：WifiOff 图标 + 提示                     │
│  isOfflineMode=false：原有数据库列表 + 同步按钮               │
└────────────────────────────────────────────────────────────┘
```

### 5.2 同步状态互锁

```typescript
const isAnySyncing = syncing !== null || demoLoading || csvImporting
```

三段任一进行中时，所有操作按钮均 `disabled`，关闭按钮亦禁用。

---

## 六、Android 权限

在 `AndroidManifest.xml` 中追加（已修改）：

```xml
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
    android:maxSdkVersion="32" />
```

Android 13+（API 33+）使用分区存储，不需要此权限；`maxSdkVersion=32` 仅对旧版本生效。

---

## 七、复用的底层 API（未修改）

| 函数 | 文件 |
|------|------|
| `createBusinessTable(tableName, columns[])` | `frontend/src/services/db.ts` |
| `bulkInsertBusinessRows(tableName, columns, rows[][])` | `frontend/src/services/db.ts` |
| `upsertBizSyncMeta(meta)` | `frontend/src/services/db.ts` |
| `clearBizSyncMeta(dbKey)` | `frontend/src/services/db.ts` |
| `getAllBizSyncMeta()` | `frontend/src/services/db.ts` |
| `bizTableName(dbKey, table)` → `biz_<dbKey>__<table>` | `frontend/src/services/sqlDialectConverter.ts` |
| `ProgressCallback / SyncProgress` 类型 | `frontend/src/services/businessDataSync.ts` |

---

## 八、构建步骤

```bash
# 安装依赖（papaparse 已加入 package.json）
cd frontend && npm install

# 重新生成演示数据（如有修改需求）
cd ../scripts && python3 generate_demo_ts.py

# 构建 + 同步到 Android
cd ../frontend
npm run build
npx cap sync android

# 打包 APK
cd android && ./gradlew assembleDebug
```

---

## 九、验证清单

### 9.1 构建验证

- [ ] `npm run build` 无 TypeScript 报错
- [ ] `./gradlew assembleDebug` BUILD SUCCESSFUL

### 9.2 方案A — 演示数据

- [ ] 打开 BizSyncModal → 无网络 → 看到演示数据区块（不出现 WifiOff 提示）
- [ ] 点"加载演示数据" → 进度条流畅推进 → 完成显示 ~12,443 行 ✓
- [ ] 再次打开 Modal → 显示"已加载 12,443 行"，不重复初始化
- [ ] 新建会话 → 数据库选择器出现 `demo_classic_business`
- [ ] 问"各城市客户数量" → 本地 SQL 执行成功返回结果
- [ ] 问"地图展示各城市人均消费" → latitude/longitude 字段存在 → 地图正常渲染
- [ ] 点"重新初始化" → 清空后重建，最终行数一致

### 9.3 方案B — CSV 导入

- [ ] 选择一个 CSV 文件 → 预览表格显示列名 + 类型标签 + 前5行
- [ ] 列名包含中文/空格 → sanitize 后变为合法标识符
- [ ] 修改数据库名/表名 → 点确认导入 → 进度条 → 成功横条
- [ ] 导入的数据库出现在会话数据库选择列表
- [ ] 再次导入另一个 CSV → 使用不同 db_key → 两个库均存在，互不覆盖
- [ ] 导入同名 db_key + tableName → 旧表被覆盖，行数更新

### 9.4 互锁与边界

- [ ] 演示数据初始化中 → CSV 导入按钮 disabled
- [ ] CSV 导入中 → 服务器同步按钮 disabled
- [ ] 任意操作进行中 → Modal 关闭按钮 disabled
- [ ] Web 平台打开 → 演示数据和 CSV 导入按钮不报错（no-op，非 native 直接 return）

---

## 十、设计决策记录

| 决策 | 原因 |
|------|------|
| 演示数据静态内嵌 `.ts` 文件，不走网络 | 零门槛，安装即用，不依赖任何后端 |
| 进度以全局行数权重而非表索引计算 | order_details 占 72% 行数，放最后会导致进度条长时间停在低位 |
| `createBusinessTable` 内部 DROP + CREATE | 保证全量重建语义，避免脏数据残留 |
| CSV 导入全量 Papa.parse 后再批量写入 | < 50MB CSV 内存完全可控；全量数据才能准确推断列类型 |
| `READ_EXTERNAL_STORAGE` 加 `maxSdkVersion=32` | Android 13+ 不需要此权限，避免不必要的权限请求弹窗 |
| `DEMO_DB_KEY` 以 `demo_` 前缀区分 | 服务器同步列表过滤时可选择性排除演示库 |
