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
import { t } from '@apache-superset/core/translation';
import { SMART_DATE_ID } from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/common';
import {
  ControlPanelConfig,
  D3_FORMAT_DOCS,
  D3_TIME_FORMAT_OPTIONS,
  Dataset,
  getStandardizedControls,
  ControlPanelsContainerProps,
  sharedControls,
  sections,
} from '@superset-ui/chart-controls';
import {
  headerFontSize,
  subtitleFontSize,
  subtitleControl,
  showMetricNameControl,
  metricNameFontSizeWithVisibility,
} from '../sharedControls';

export default {
  controlPanelSections: [
    {
      label: t('Query'),
      expanded: true,
      controlSetRows: [
        ['metric'],
        ['adhoc_filters'],
        [{
          name: 'comparison_mode',
          config: {
            type: 'SelectControl',
            label: t('Comparison mode'),
            default: 'none',
            choices: [
              ['none', t('None')],
              ['auto', t('Automatic time comparison')],
              ['manual', t('SQL calculated values')],
            ],
            renderTrigger: true,
          },
        }],
        [{
          name: 'comparison_metric_month',
          config: {
            ...sharedControls.metric,
            label: t('Previous month metric'),
            visibility: ({ controls }: ControlPanelsContainerProps) =>
              controls?.comparison_mode?.value === 'manual',
          },
        }],
        [{
          name: 'comparison_metric_year',
          config: {
            ...sharedControls.metric,
            label: t('Previous year metric'),
            visibility: ({ controls }: ControlPanelsContainerProps) =>
              controls?.comparison_mode?.value === 'manual',
          },
        }],
      ],
    },
    {
      label: t('Chart Options'),
      expanded: true,
      controlSetRows: [
        [headerFontSize],
        [subtitleControl],
        [subtitleFontSize],
        [showMetricNameControl],
        [metricNameFontSizeWithVisibility],
        ['y_axis_format'],
        ['currency_format'],
        [
          {
            name: 'time_format',
            config: {
              type: 'SelectControl',
              freeForm: true,
              label: t('Date format'),
              renderTrigger: true,
              choices: D3_TIME_FORMAT_OPTIONS,
              description: D3_FORMAT_DOCS,
              default: SMART_DATE_ID,
            },
          },
        ],
        [
          {
            name: 'force_timestamp_formatting',
            config: {
              type: 'CheckboxControl',
              label: t('Force date format'),
              renderTrigger: true,
              default: false,
              description: t(
                'Use date formatting even when metric value is not a timestamp',
              ),
            },
          },
        ],
        [
          {
            name: 'conditional_formatting',
            config: {
              type: 'ConditionalFormattingControl',
              renderTrigger: true,
              label: t('Conditional Formatting'),
              description: t('Apply conditional color formatting to metric'),
              shouldMapStateToProps() {
                return true;
              },
              mapStateToProps(explore, _, chart) {
                const verboseMap = explore?.datasource?.hasOwnProperty(
                  'verbose_map',
                )
                  ? (explore?.datasource as Dataset)?.verbose_map
                  : (explore?.datasource?.columns ?? {});
                const { colnames, coltypes } =
                  chart?.queriesResponse?.[0] ?? {};
                const numericColumns =
                  Array.isArray(colnames) && Array.isArray(coltypes)
                    ? colnames
                        .filter(
                          (_: string, index: number) =>
                            coltypes[index] === GenericDataType.Numeric,
                        )
                        .map((colname: string | number) => ({
                          value: colname,
                          label:
                            (Array.isArray(verboseMap)
                              ? verboseMap[colname as number]
                              : verboseMap[colname as string]) ?? colname,
                          dataType:
                            colnames && coltypes[colnames?.indexOf(colname)],
                        }))
                    : [];
                return {
                  columnOptions: numericColumns,
                  verboseMap,
                };
              },
            },
          },
        ],
      ],
    },
    {
      ...sections.timeComparisonControls({
        multi: true,
        showCalculationType: false,
        showFullChoices: false,
      }),
      visibility: ({ controls }: ControlPanelsContainerProps) =>
        controls?.comparison_mode?.value === 'auto',
    },
  ],
  controlOverrides: {
    y_axis_format: {
      label: t('Number format'),
    },
  },
  formDataOverrides: formData => ({
    ...formData,
    metric: getStandardizedControls().shiftMetric(),
  }),
} as ControlPanelConfig;
