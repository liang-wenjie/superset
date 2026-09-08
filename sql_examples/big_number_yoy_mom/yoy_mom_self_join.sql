-- ============================================================================
-- 大数字（Big Number）同比 / 环比 指标预计算 —— 自关联版
--
-- 适用数据库：不支持窗口函数的库（如 MySQL 5.7 及以下、部分老版本 Hive），
--             或希望用显式 JOIN 表达的场景。
--
-- 日期偏移函数按数据库调整：
--   PostgreSQL: a.month - INTERVAL '1 month' / INTERVAL '1 year'
--   MySQL:      DATE_SUB(a.month, INTERVAL 1 MONTH) / DATE_SUB(a.month, INTERVAL 1 YEAR)
--   SQL Server: DATEADD(MONTH, -1, a.month) / DATEADD(YEAR, -1, a.month)
--
-- 用法与口径同 yoy_mom_window.sql：
--   mom_pct = (当期 - 上一月) / 上一月；yoy_pct = (当期 - 去年同月) / 去年同月
-- ============================================================================

WITH monthly AS (
  SELECT
    DATE_TRUNC('month', order_date) AS month,
    SUM(amount) AS sales
  FROM orders
  GROUP BY 1
)
SELECT
  a.month,
  a.sales,
  b.sales AS prev_month,
  c.sales AS prev_year,
  (a.sales - b.sales) / NULLIF(b.sales, 0) AS mom_pct,
  (a.sales - c.sales) / NULLIF(c.sales, 0) AS yoy_pct
FROM monthly a
LEFT JOIN monthly b ON b.month = a.month - INTERVAL '1 month'  -- 环比：上一月
LEFT JOIN monthly c ON c.month = a.month - INTERVAL '1 year'   -- 同比：去年同月
ORDER BY a.month DESC;
