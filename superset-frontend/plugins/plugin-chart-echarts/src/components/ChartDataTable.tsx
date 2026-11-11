/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { useTheme } from '@apache-superset/core/theme';
import {
  DATA_TABLE_FONT_SIZE,
  DATA_TABLE_ROW_HEIGHT,
  getDataTableHeight,
  LEGEND_GAP,
  LEGEND_MARKER_WIDTH,
  LEGEND_PADDING,
  type ColumnLayout,
  type DataTable,
} from './chartDataTableUtils';

type ChartDataTableProps = {
  width: number;
  data: DataTable;
  layout: ColumnLayout;
};

export default function ChartDataTable({
  width,
  data,
  layout,
}: ChartDataTableProps) {
  const theme = useTheme();
  const { boundaries, indexes } = layout;
  const hasLayout =
    indexes.length > 0 && boundaries.length === indexes.length + 1;
  // The legend column occupies exactly the Y axis label gutter, so its right
  // edge lines up with the left edge of the plot and the value columns start
  // at the same x position as the bars.
  const legendWidth = hasLayout ? boundaries[0] : Math.min(width * 0.1, 96);
  const columnWidths = hasLayout
    ? indexes.map((_, index) =>
        Math.max(boundaries[index + 1] - boundaries[index], 0),
      )
    : [];
  const visibleIndexes = hasLayout ? indexes : [];
  const height = getDataTableHeight(data.rows.length);
  // `boundaries` holds the legend column's right edge followed by the right
  // edge of every value column, including the last one. Draw them as an
  // overlay rather than as cell borders: a cell with no value, a missing cell,
  // or a column collapsed to zero width must still show its separator.
  const separators = hasLayout ? [...boundaries] : [];
  const separatorColor = theme.colorBorderSecondary;

  return (
    <div
      style={{
        width,
        height,
        overflow: 'hidden auto',
        boxSizing: 'border-box',
        backgroundColor: theme.colorBgContainer,
        borderTop: `1px solid ${separatorColor}`,
        color: theme.colorText,
        // Keep this in sync with DATA_TABLE_FONT_SIZE: getDataTableGridLeft
        // uses the same value to size the Y axis gutter for series names.
        fontSize: DATA_TABLE_FONT_SIZE,
      }}
    >
      {data.rows.map(row => (
        <div
          key={row.name}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            height: DATA_TABLE_ROW_HEIGHT,
            boxSizing: 'border-box',
            borderBottom: `1px solid ${separatorColor}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: LEGEND_GAP,
              flex: `0 0 ${legendWidth}px`,
              width: legendWidth,
              minWidth: 0,
              // getDataTableGridLeft() budgets LEGEND_PADDING for this pair.
              paddingLeft: LEGEND_PADDING / 2,
              paddingRight: LEGEND_PADDING / 2,
              boxSizing: 'border-box',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              color: theme.colorTextSecondary,
            }}
            title={row.name}
          >
            <span
              style={{
                flex: `0 0 ${LEGEND_MARKER_WIDTH}px`,
                width: LEGEND_MARKER_WIDTH,
                height: row.isLine ? 2 : LEGEND_MARKER_WIDTH,
                backgroundColor: row.color ?? theme.colorTextSecondary,
                borderRadius: row.isLine ? 0 : 2,
              }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {row.name}
            </span>
          </div>
          {visibleIndexes.map((columnIndex, index) => (
            <div
              key={columnIndex}
              data-test="data-table-value-cell"
              style={{
                flex: `0 0 ${columnWidths[index]}px`,
                width: columnWidths[index],
                minWidth: 0,
                // Column separators are drawn by the overlay below, so no
                // border here can shift the cells off the X axis categories.
                boxSizing: 'border-box',
                textAlign: 'center',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}
              title={row.cells[columnIndex] ?? ''}
            >
              {row.cells[columnIndex] ?? ''}
            </div>
          ))}
          {separators.map((boundary, index) => (
            <div
              key={`column-separator-${index}`}
              data-test="data-table-column-separator"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: Math.max(0, Math.round(boundary) - 1),
                width: 1,
                backgroundColor: separatorColor,
                pointerEvents: 'none',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
