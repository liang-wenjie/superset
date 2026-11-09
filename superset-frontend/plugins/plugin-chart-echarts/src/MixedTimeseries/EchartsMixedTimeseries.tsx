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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AxisType,
  BinaryQueryObjectFilterClause,
  DTTM_ALIAS,
  DataRecordValue,
  getColumnLabel,
  getNumberFormatter,
  getTimeFormatter,
} from '@superset-ui/core';
import {
  EchartsMixedTimeseriesChartTransformedProps,
  isHorizontalMixedChart,
} from './types';
import Echart from '../components/Echart';
import { EchartsHandler, EventHandlers } from '../types';
import ChartDataTable from '../components/ChartDataTable';
import {
  areColumnLayoutsEqual,
  buildDataTable,
  computeColumnLayout,
  DATA_TABLE_FONT_SIZE,
  getDataTableGridLeft,
  getDataTableHeight,
  type ColumnLayout,
} from '../components/chartDataTableUtils';
import { formatSeriesName } from '../utils/series';
import { useLegendEventHandlers } from '../utils/legendEventHandlers';

const MIN_CHART_HEIGHT = 80;
const EMPTY_COLUMN_LAYOUT: ColumnLayout = { boundaries: [], indexes: [] };

export default function EchartsMixedTimeseries({
  height,
  width,
  echartOptions,
  setDataMask,
  labelMap,
  labelMapB,
  groupby,
  groupbyB,
  selectedValues,
  formData,
  emitCrossFilters,
  seriesBreakdown,
  onContextMenu,
  onFocusedSeries,
  xValueFormatter,
  xAxis,
  refs,
  coltypeMapping,
  onLegendStateChanged,
  onLegendScroll,
}: EchartsMixedTimeseriesChartTransformedProps) {
  // The table is a per-chart control stored in form_data. Horizontal charts
  // have a value X axis, so there are no categories to align columns with.
  const showDataTable =
    Boolean(formData.showDataTable) && !isHorizontalMixedChart(formData);
  const echartRef = useRef<EchartsHandler | null>(null);

  const tableData = useMemo(
    () =>
      showDataTable
        ? buildDataTable(
            echartOptions,
            formData.yAxisFormat,
            formData.yAxisFormatSecondary,
          )
        : null,
    [
      showDataTable,
      echartOptions,
      formData.yAxisFormat,
      formData.yAxisFormatSecondary,
    ],
  );

  const [columnLayout, setColumnLayout] =
    useState<ColumnLayout>(EMPTY_COLUMN_LAYOUT);

  const handleRendered = useCallback(() => {
    const chart = echartRef.current?.getEchartInstance();
    if (!chart || !tableData) {
      return;
    }
    const next = computeColumnLayout(chart, tableData.columns, width);
    setColumnLayout(previous =>
      areColumnLayoutsEqual(previous, next) ? previous : next,
    );
  }, [tableData, width]);

  // `finished` covers repaint, resize and dataZoom. Recompute on size changes
  // as a safety net for resizes that do not emit a repaint.
  useEffect(() => {
    if (!showDataTable) {
      return undefined;
    }
    const frame = requestAnimationFrame(handleRendered);
    return () => cancelAnimationFrame(frame);
  }, [showDataTable, handleRendered, width, height]);

  const tableHeight = tableData ? getDataTableHeight(tableData.rows.length) : 0;
  const chartHeight = Math.max(
    height - tableHeight,
    Math.min(MIN_CHART_HEIGHT, height),
  );

  // Reserve enough room on the left for the longest series name. Raising
  // grid.left moves the Y axis and the plot area to the right; the table's
  // legend column then aligns to that new plot edge via computeColumnLayout.
  const requiredGridLeft = useMemo(
    () =>
      showDataTable && tableData
        ? getDataTableGridLeft(tableData.rows, DATA_TABLE_FONT_SIZE, width)
        : 0,
    [showDataTable, tableData, width],
  );

  const chartOptions = useMemo(() => {
    if (!requiredGridLeft) {
      return echartOptions;
    }
    const { grid } = echartOptions as { grid?: unknown };
    if (!grid || typeof grid !== 'object' || Array.isArray(grid)) {
      return echartOptions;
    }
    const gridObject = grid as Record<string, unknown>;
    const currentLeft =
      typeof gridObject.left === 'number' ? gridObject.left : 0;
    const nextLeft = Math.max(currentLeft, requiredGridLeft);
    if (nextLeft === currentLeft) {
      return echartOptions;
    }
    return { ...echartOptions, grid: { ...gridObject, left: nextLeft } };
  }, [echartOptions, requiredGridLeft]);

  const isFirstQuery = useCallback(
    (seriesIndex: number) => seriesIndex < seriesBreakdown,
    [seriesBreakdown],
  );

  // A horizontal chart stores each datum as [value, category]; a vertical
  // one as [category, value]. Drill filters always need the category.
  const categoryIndex = isHorizontalMixedChart(formData) ? 1 : 0;

  const getCrossFilterDataMask = useCallback(
    (seriesName: string, seriesIndex: number) => {
      const selected: string[] = Object.values(selectedValues || {});
      let values: string[];
      if (selected.includes(seriesName)) {
        values = selected.filter(v => v !== seriesName);
      } else {
        values = [seriesName];
      }

      const currentGroupBy = isFirstQuery(seriesIndex) ? groupby : groupbyB;
      const currentLabelMap = isFirstQuery(seriesIndex) ? labelMap : labelMapB;
      const groupbyValues = values
        .map(value => currentLabelMap?.[value])
        .filter(value => !!value);

      return {
        dataMask: {
          extraFormData: {
            // An empty lookup result means the clicked series could not be
            // resolved through the label map; emitting column filters anyway
            // would produce bogus `IS NULL` clauses (an empty array makes the
            // `every` below vacuously true), so clear the filters instead.
            filters:
              values.length === 0 || groupbyValues.length === 0
                ? []
                : currentGroupBy.map((col, idx) => {
                    const val: DataRecordValue[] = groupbyValues.map(v => {
                      const metricsCount = v.length - currentGroupBy.length;
                      return v[metricsCount + idx];
                    });
                    if (val.every(vv => vv == null))
                      return {
                        col,
                        op: 'IS NULL' as const,
                      };
                    return {
                      col,
                      op: 'IN' as const,
                      val: val as (string | number | boolean)[],
                    };
                  }),
          },
          filterState: {
            value: !groupbyValues.length ? null : groupbyValues,
            selectedValues: values.length ? values : null,
          },
        },
        isCurrentValueSelected: selected.includes(seriesName),
      };
    },
    [groupby, groupbyB, isFirstQuery, labelMap, labelMapB, selectedValues],
  );

  const handleChange = useCallback(
    (seriesName: string, seriesIndex: number) => {
      const isFirst = isFirstQuery(seriesIndex);
      if (
        !emitCrossFilters ||
        (isFirst && groupby.length === 0) ||
        (!isFirst && groupbyB.length === 0)
      ) {
        return;
      }

      setDataMask(getCrossFilterDataMask(seriesName, seriesIndex).dataMask);
    },
    [
      isFirstQuery,
      emitCrossFilters,
      groupby.length,
      groupbyB.length,
      setDataMask,
      getCrossFilterDataMask,
    ],
  );

  const legendEventHandlers = useLegendEventHandlers(
    onLegendStateChanged,
    onLegendScroll,
  );

  const eventHandlers: EventHandlers = {
    ...legendEventHandlers,
    click: props => {
      const { seriesName, seriesIndex } = props;
      handleChange(seriesName, seriesIndex);
    },
    mouseout: () => {
      onFocusedSeries(null);
    },
    mouseover: params => {
      onFocusedSeries(params.seriesName);
    },
    contextmenu: async eventParams => {
      if (onContextMenu) {
        eventParams.event.stop();
        const { data, seriesName, seriesIndex } = eventParams;
        const pointerEvent = eventParams.event.event;
        const drillToDetailFilters: BinaryQueryObjectFilterClause[] = [];
        const drillByFilters: BinaryQueryObjectFilterClause[] = [];
        const isFirst = isFirstQuery(seriesIndex);
        const currentGroupBy = isFirst ? formData.groupby : formData.groupbyB;
        const seriesValues = (isFirst ? labelMap : labelMapB)[seriesName] || [];
        // Label map values may carry metric/offset labels ahead of the
        // dimension values — anchor from the tail, like getCrossFilterDataMask.
        const metricsCount = seriesValues.length - currentGroupBy.length;
        if (data && xAxis.type === AxisType.Time) {
          drillToDetailFilters.push({
            col:
              xAxis.label === DTTM_ALIAS
                ? formData.granularitySqla
                : xAxis.label,
            grain: formData.timeGrainSqla,
            op: '==',
            val: data[categoryIndex],
            formattedVal: xValueFormatter(data[categoryIndex]),
          });
        }
        if (
          data &&
          xAxis.type === AxisType.Category &&
          eventParams.name != null
        ) {
          drillToDetailFilters.push({
            col: xAxis.label,
            op: '==',
            val: eventParams.name,
            formattedVal: String(eventParams.name),
          });
        }
        if (metricsCount >= 0) {
          currentGroupBy.forEach((dimension, i) => {
            const value = seriesValues[metricsCount + i];
            drillToDetailFilters.push({
              col: dimension,
              op: '==',
              val: value,
              formattedVal: String(value),
            });
            drillByFilters.push({
              col: dimension,
              op: '==',
              val: value,
              formattedVal: formatSeriesName(value, {
                timeFormatter: getTimeFormatter(formData.dateFormat),
                numberFormatter: getNumberFormatter(formData.numberFormat),
                coltype: coltypeMapping?.[getColumnLabel(dimension)],
              }),
            });
          });
        }
        const hasCrossFilter =
          (isFirst && groupby.length > 0) || (!isFirst && groupbyB.length > 0);

        onContextMenu(pointerEvent.clientX, pointerEvent.clientY, {
          drillToDetail: drillToDetailFilters,
          crossFilter: hasCrossFilter
            ? getCrossFilterDataMask(seriesName, seriesIndex)
            : undefined,
          drillBy: {
            filters: drillByFilters,
            groupbyFieldName: isFirst ? 'groupby' : 'groupby_b',
            adhocFilterFieldName: isFirst ? 'adhoc_filters' : 'adhoc_filters_b',
          },
        });
      }
    },
  };

  return (
    <>
      <Echart
        ref={echartRef}
        refs={refs}
        height={chartHeight}
        width={width}
        echartOptions={chartOptions}
        eventHandlers={eventHandlers}
        selectedValues={selectedValues}
        vizType={formData.vizType}
        onRendered={showDataTable ? handleRendered : undefined}
      />
      {showDataTable && tableData && tableData.rows.length > 0 && (
        <ChartDataTable width={width} data={tableData} layout={columnLayout} />
      )}
    </>
  );
}
