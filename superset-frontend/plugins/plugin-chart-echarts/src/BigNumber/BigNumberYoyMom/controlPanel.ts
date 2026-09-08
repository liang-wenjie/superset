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
import {
  ControlPanelConfig,
  ControlPanelsContainerProps,
  getStandardizedControls,
  sharedControls,
  sections,
} from '@superset-ui/chart-controls';
import {
  headerFontSize,
  subtitleControl,
  subtitleFontSize,
  showMetricNameControl,
  metricNameFontSizeWithVisibility,
} from '../sharedControls';

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t('Query'),
      expanded: true,
      controlSetRows: [
        ['metric'],
        ['adhoc_filters'],
        [
          {
            name: 'comparison_mode',
            config: {
              type: 'SelectControl',
              label: t('Comparison mode'),
              default: 'auto',
              choices: [
                ['auto', t('Automatic (time offset)')],
                ['manual', t('Manual (previous value in row)')],
              ],
              description: t(
                'Automatic shifts the selected time range to compute the ' +
                  'comparison. Manual reads a previous-period metric that sits ' +
                  'in the same row as the current-period value, which keeps ' +
                  'the comparison working even when the dataset only holds a ' +
                  'single period of data.',
              ),
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'comparison_metric',
            config: {
              type: 'MetricControl',
              label: t('Previous period metric'),
              description: t(
                'In manual mode, the metric holding the previous-period value ' +
                  'in the same row (e.g. a SQL-computed `prev_month` or ' +
                  '`prev_year` column).',
              ),
              visibility: ({ controls }: ControlPanelsContainerProps) =>
                controls?.comparison_mode?.value === 'manual',
            },
          },
        ],
        [
          {
            name: 'row_limit',
            config: sharedControls.row_limit,
          },
        ],
      ],
    },
    {
      label: t('Chart Options'),
      expanded: true,
      controlSetRows: [
        ['y_axis_format'],
        [
          {
            name: 'percentDifferenceFormat',
            config: {
              ...sharedControls.y_axis_format,
              label: t('Percent Difference format'),
            },
          },
        ],
        ['currency_format'],
        [headerFontSize],
        [subtitleControl],
        [subtitleFontSize],
        [showMetricNameControl],
        [metricNameFontSizeWithVisibility],
        [
          {
            name: 'show_prev_value',
            config: {
              type: 'CheckboxControl',
              label: t('Show Previous Value'),
              renderTrigger: true,
              default: true,
              description: t('Display the comparison-period value (e.g. last month / last year).'),
            },
          },
        ],
        [
          {
            name: 'show_value_difference',
            config: {
              type: 'CheckboxControl',
              label: t('Show Value Difference'),
              renderTrigger: true,
              default: true,
              description: t('Display the absolute difference between the current and comparison periods.'),
            },
          },
        ],
        [
          {
            name: 'show_percent_change',
            config: {
              type: 'CheckboxControl',
              label: t('Show Percent Change'),
              renderTrigger: true,
              default: true,
              description: t('Display the percent change between the current and comparison periods.'),
            },
          },
        ],
        [
          {
            name: 'comparison_color_enabled',
            config: {
              type: 'CheckboxControl',
              label: t('Add color for positive/negative change'),
              renderTrigger: true,
              default: false,
              description: t('Add color to the change badges based on the sign of the change.'),
            },
          },
        ],
      ],
    },
    {
      ...sections.timeComparisonControls({
        multi: false,
        showCalculationType: false,
        showFullChoices: false,
      }),
      visibility: ({ controls }: ControlPanelsContainerProps) =>
        controls?.comparison_mode?.value !== 'manual',
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
};

export default config;
