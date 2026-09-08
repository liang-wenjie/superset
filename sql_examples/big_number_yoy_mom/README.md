# 大数字图（Big Number）· 同比/环比 · SQL 直算方案

不改任何 Superset 代码，直接用 SQL 把当期值、上期值、同比、环比算好，再交给
大数字图 / 表格图展示；标题大小、指标个数均可在图表控制面板配置。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `yoy_mom_window.sql` | 窗口函数版（`LAG`），PostgreSQL / MySQL 8+ / SQL Server / ClickHouse |
| `yoy_mom_self_join.sql` | 自关联版（`LEFT JOIN`），兼容不支持窗口函数的旧库 |

两份脚本输出列一致：`month / sales / prev_month / prev_year / mom_diff / yoy_diff / mom_pct / yoy_pct`。

## 核心口径

- **环比（mom）** = 当期 − 上一周期（按月粒度即上一月）
- **同比（yoy）** = 当期 − 去年同期（按月粒度即去年同月）
- **百分比** = (当期 − 基期) / 基期，用 `NULLIF(基期, 0)` 防除零
- 粒度调整：日粒度用 `LAG 1 / LAG 365`，周粒度用 `LAG 1 / LAG 52`，季度粒度用 `LAG 1 / LAG 4`

> 为什么必须在 SQL 里算：Superset 的"指标/计算列"只支持聚合表达式，不支持窗口函数，
> 所以 `LAG` 这类计算要在数据集 SQL（虚拟表）里提前算好——这正是本方案的落点。

## 操作步骤

### 1. SQL Lab 预计算并保存为数据集

1. 打开 **SQL Lab**，选好数据库，运行 `yoy_mom_window.sql`（或自关联版）
2. 结果正确后点 **Save → Save as dataset**，命名保存
3. 在 **Datasets** 中把 `month` 列标记为时间列（用于时间过滤/趋势图）

### 2. 新建大数字图（单指标）

1. **Explore → 新建图表**，图表类型选 **Big Number**（viz type `big_number_total`）
2. **Query** 区：Metric 选 `sales`（或你算出的任意指标列）；时间过滤选最新一期
3. **Chart Options** 区配置标题与格式：

| 控件 | 含义 | 备注 |
| --- | --- | --- |
| `Big Number Font Size` | 大数字字号 | 值 0.2~0.6（相对高度比例） |
| `Subtitle` / `Subtitle Font Size` | 副标题文本与字号 | 可写"环比 +12.3%"等 |
| `Show Metric Name` | 是否显示指标名 | 开启后出现下项 |
| `Metric Name Font Size` | 指标名字号 | 需先开启 Show Metric Name |
| `Number format` | 数字格式 | 如 `%,.2f`、`%,.1f` |
| `Conditional Formatting` | 条件变色 | 如正数绿、负数红 |

### 3. 多指标同屏（指标个数自由控制）

按需选一种：

- **表格图（Table）**：Metric 或列选 `sales / mom_pct / yoy_pct` 多列，显示几个选几个
- **多个大数字图**：Dashboard 上并排放"当期值 / 环比% / 同比%"三个图，各自独立配标题大小
- **PopKPI（pop_kpi）**：内置"上一期值 / Δ差值 / %变化"三个对比徽标，
  在 **Customize columns**（`column_config`）中把不需要的列 `visible` 关掉即可控制显示个数

## 关联代码位置（本仓库）

- 大数字图实现：`superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/`
- 同比/环比控件：`superset-frontend/packages/superset-ui-chart-controls/src/sections/timeComparison.tsx`
- 对比后处理规则：`superset-frontend/packages/superset-ui-chart-controls/src/operators/timeCompareOperator.ts`
- 后端计算：`superset/utils/pandas_postprocessing/compare.py`

## 其他说明

- 如果你的库支持窗口函数，**优先用窗口函数版**（可读、一次扫表）；自关联版用于兼容旧库
- 指标列建议用别名（`AS sales`），保存数据集后 Explore 里直接按别名选择
- 大数字图一次只显示一个主指标；要"一个图里显示多个主指标"请走表格图或 PopKPI
