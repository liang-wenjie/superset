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
import { buildQueryContext, PostProcessingRule, ensureIsArray } from '@superset-ui/core';
import { isTimeComparison, timeCompareOperator } from '@superset-ui/chart-controls';
import { isEmpty } from 'lodash-es';
import { BigNumberYoyMomQueryFormData } from './types';

/**
 * Build the query for the Big Number YoY/MoM chart.
 *
 * The automatic comparison relies on the standard time-comparison mechanism:
 * - `timeCompareOperator` emits a `compare` post-processing rule when a
 *   `comparison_type` other than `values` is selected;
 * - `time_offsets` make the backend return the shifted metric columns
 *   (e.g. `SUM(sales)__1 year ago`), which `transformProps` reads to
 *   compute the previous-period value, difference and percent change.
 *
 * In manual mode (`comparison_mode === 'manual'`) no time shifting happens:
 * both the current and the previous-period values come from metrics in the
 * same row (e.g. a SQL-computed `prev_month` column), so the comparison keeps
 * working even when the dataset only holds a single period of data.
 *
 * Data can come from any dataset, including one backed by a SQL query
 * (see `sql_examples/big_number_yoy_mom/` in the repository root), so the
 * chart itself requires no custom SQL.
 */
export default function buildQuery(formData: BigNumberYoyMomQueryFormData) {
  const { cols: groupby, extra_form_data } = formData;

  if (formData.comparison_mode === 'manual') {
    // Manual comparison: fetch the current-period metric plus the
    // previous-period metric in the same row; no post-processing rules.
    return buildQueryContext(formData, baseQueryObject => [
      {
        ...baseQueryObject,
        groupby,
        metrics: ensureIsArray(baseQueryObject.metrics)
          .concat(ensureIsArray(formData.comparison_metric))
          .concat(ensureIsArray(formData.additional_metrics)),
        post_processing: [],
        time_offsets: [],
      },
    ]);
  }

  const queryContextA = buildQueryContext(formData, baseQueryObject => {
    const postProcessing: PostProcessingRule[] = [];
    postProcessing.push(timeCompareOperator(formData, baseQueryObject));

    const nonCustomNorInheritShifts = ensureIsArray(
      formData.time_compare,
    ).filter((shift: string) => shift !== 'custom' && shift !== 'inherit');
    const customOrInheritShifts = ensureIsArray(formData.time_compare).filter(
      (shift: string) => shift === 'custom' || shift === 'inherit',
    );

    let timeOffsets: string[] = [];

    // Shifts for non-custom or non-inherit time comparison
    if (!isEmpty(nonCustomNorInheritShifts)) {
      timeOffsets = nonCustomNorInheritShifts;
    }

    // Shifts for custom or inherit time comparison
    if (!isEmpty(customOrInheritShifts)) {
      if (customOrInheritShifts.includes('custom')) {
        timeOffsets = timeOffsets.concat([formData.start_date_offset]);
      }
      if (customOrInheritShifts.includes('inherit')) {
        timeOffsets = timeOffsets.concat(['inherit']);
      }
    }

    if (
      extra_form_data?.time_compare &&
      !timeOffsets.includes(extra_form_data.time_compare)
    ) {
      timeOffsets = [extra_form_data.time_compare];
    }

    return [
      {
        ...baseQueryObject,
        groupby,
        metrics: ensureIsArray(baseQueryObject.metrics).concat(
          ensureIsArray(formData.additional_metrics),
        ),
        post_processing: postProcessing,
        time_offsets:
          isTimeComparison(formData, baseQueryObject) ||
          extra_form_data?.time_compare
            ? ensureIsArray(timeOffsets)
            : [],
      },
    ];
  });

  return {
    ...queryContextA,
  };
}
