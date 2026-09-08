-- ============================================================================
-- 大数字（Big Number）同比 / 环比 指标预计算 —— 窗口函数版
--
-- 适用数据库：PostgreSQL / MySQL 8+ / SQL Server / ClickHouse 等支持窗口函数的库
--
-- 用法：
--   1. 在 SQL Lab 中运行本查询
--   2. 结果点 Save -> Save as dataset，保存为数据集
--   3. Explore 中用"大数字"或"表格"图表展示
--
-- 口径（按月粒度示例）：
--   环比（mom）= 当期 - 上一周期          （LAG 1 期）
--   同比（yoy）= 当期 - 去年同期          （LAG 12 期）
--   百分比变化  = (当期 - 基期) / 基期     （NULLIF 防除零）
--
-- 替换说明：
--   把 orders / order_date / amount 换成你自己的表名、时间列、指标列；
--   粒度按日/周/季度时，调整 DATE_TRUNC 的粒度与 LAG 偏移数
--   （日粒度：LAG 1 为昨日环比、LAG 365 为同比；周粒度：LAG 52 为同比）。
-- ============================================================================

WITH monthly AS (
  SELECT
    DATE_TRUNC('month', order_date) AS month,   -- 时间粒度（月）
    SUM(amount) AS sales                         -- 主指标
  FROM orders
  -- WHERE order_date >= '2024-01-01'           -- 按需限制时间范围
  GROUP BY 1
)
SELECT
  month,
  sales,
  -- 环比：上一周期
  LAG(sales, 1)  OVER (ORDER BY month) AS prev_month,
  -- 同比：去年同期
  LAG(sales, 12) OVER (ORDER BY month) AS prev_year,
  -- 环比差值
  sales - LAG(sales, 1)  OVER (ORDER BY month) AS mom_diff,
  -- 同比差值
  sales - LAG(sales, 12) OVER (ORDER BY month) AS yoy_diff,
  -- 环比 %
  (sales - LAG(sales, 1)  OVER (ORDER BY month))
    / NULLIF(LAG(sales, 1)  OVER (ORDER BY month), 0) AS mom_pct,
  -- 同比 %
  (sales - LAG(sales, 12) OVER (ORDER BY month))
    / NULLIF(LAG(sales, 12) OVER (ORDER BY month), 0) AS yoy_pct
FROM monthly
ORDER BY month DESC;
