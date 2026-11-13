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
  ControlPanelState,
  ControlSubSectionHeader,
  getStandardizedControls,
  sharedControls,
} from '@superset-ui/chart-controls';
import {
  headerFontSize,
  subheaderFontSize,
  subtitleFontSize,
} from '../sharedControls';
import {
  COMPARISON_OFFSET_CHOICES,
  DEFAULT_BIG_NUMBER_COLOR,
  DEFAULT_BIG_NUMBER_LEFT,
  DEFAULT_BIG_NUMBER_TOP,
  DEFAULT_COMPARISON_GAP,
  DEFAULT_COMPARISON_NEGATIVE_COLOR,
  DEFAULT_COMPARISON_POSITIVE_COLOR,
  DEFAULT_COMPARISON_SHOW_ARROW,
  DEFAULT_COMPARISON_THRESHOLD,
  DEFAULT_COMPARISON_TOP,
  DEFAULT_COMPARISON_ZERO_COLOR,
  DEFAULT_TITLE_COLOR,
  DEFAULT_TITLE_FONT_SIZE,
  DEFAULT_TITLE_LEFT,
  DEFAULT_TITLE_TOP,
} from './constants';
import { resolveMetricRows } from './metricRows';

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t('Query'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'granularity_sqla',
            config: sharedControls.granularity_sqla,
          },
        ],
        [
          {
            name: 'time_grain_sqla',
            config: sharedControls.time_grain_sqla,
          },
        ],
        ['metric'],
        [
          {
            name: 'metric_rows',
            config: {
              type: 'MetricRowsControl',
              label: t('Metric rows'),
              renderTrigger: true,
              description: t(
                'Rows of metrics shown below the big number. Each row holds two independently configured slots: the first row is the MoM/YoY pair, and you can add as many rows as you need. A slot either shows a time comparison percentage or a metric value with its own label and number format. All rows share the comparison style settings below.',
              ),
              // The old `comparison1_*` / `comparison2_*` controls no longer
              // exist, so form data rebuilt from `getFormDataFromControls()`
              // (initial `latestQueryFormData`, viz-type switches, ...) would
              // lose every comparison setting and the chart would fall back
              // to empty "MoM —" / "YoY —" placeholders. Resolve the legacy
              // pair into a REAL control value so every derived form data
              // carries `metric_rows` and the renderer sees the same rows as
              // the editor. Return nothing when there is no form data (the
              // dashboard hydration path passes null) so saved legacy keys
              // are left untouched there.
              default: (
                _controlState: unknown,
                controlPanelState?: Partial<ControlPanelState> | null,
              ) => {
                const formData = controlPanelState?.form_data;
                return formData
                  ? resolveMetricRows(
                      formData as unknown as Record<string, unknown>,
                    )
                  : undefined;
              },
              // Dataset metadata arrives asynchronously; rebuild the metric
              // options whenever Explore state changes.
              shouldMapStateToProps() {
                return true;
              },
              mapStateToProps(explore: ControlPanelState) {
                const datasource = explore?.datasource as
                  | { metrics?: unknown[] }
                  | undefined;
                const metrics: { label: string; value: string }[] = [];
                const seen = new Set<string>();
                (datasource?.metrics ?? []).forEach(entry => {
                  if (!entry || typeof entry !== 'object') return;
                  const record = entry as Record<string, unknown>;
                  const name =
                    typeof record.metric_name === 'string'
                      ? record.metric_name
                      : '';
                  if (!name || seen.has(name)) return;
                  seen.add(name);
                  const verboseName =
                    typeof record.verbose_name === 'string'
                      ? record.verbose_name
                      : '';
                  metrics.push({ label: verboseName || name, value: name });
                });
                const formData = (explore?.form_data ?? {}) as Record<
                  string,
                  unknown
                >;
                return {
                  metrics,
                  offsetChoices: COMPARISON_OFFSET_CHOICES.map(([offset]) =>
                    String(offset),
                  ),
                  // Charts saved before this control existed still show their
                  // MoM/YoY pair as row 1 instead of an empty list.
                  defaultRows: resolveMetricRows(formData),
                };
              },
            },
          },
        ],
        ['adhoc_filters'],
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
        [<ControlSubSectionHeader>{t('Title')}</ControlSubSectionHeader>],
        [
          {
            name: 'header_text',
            config: {
              type: 'TextControl',
              label: t('Title text'),
              renderTrigger: true,
              description: t(
                'Text displayed above the big number. Leave empty to hide it.',
              ),
            },
          },
        ],
        [
          {
            name: 'title_font_size',
            config: {
              ...subtitleFontSize.config,
              label: t('Title font size'),
              default: DEFAULT_TITLE_FONT_SIZE,
            },
          },
        ],
        [
          {
            name: 'title_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Title color'),
              renderTrigger: true,
              default: DEFAULT_TITLE_COLOR,
            },
          },
        ],
        [
          {
            name: 'title_left',
            config: {
              type: 'NumberControl',
              label: t('Title left position'),
              min: 0,
              step: 1,
              renderTrigger: true,
              default: DEFAULT_TITLE_LEFT,
              description: t('Horizontal offset in pixels from the left edge.'),
            },
          },
        ],
        [
          {
            name: 'title_top',
            config: {
              type: 'NumberControl',
              label: t('Title top position'),
              min: 0,
              step: 1,
              renderTrigger: true,
              default: DEFAULT_TITLE_TOP,
              description: t('Vertical offset in pixels from the top edge.'),
            },
          },
        ],
        [<ControlSubSectionHeader>{t('Big Number')}</ControlSubSectionHeader>],
        ['y_axis_format'],
        ['currency_format'],
        [
          {
            name: 'big_number_font_size',
            config: {
              ...headerFontSize.config,
              label: t('Big number font size'),
            },
          },
        ],
        [
          {
            name: 'big_number_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Big number color'),
              renderTrigger: true,
              default: DEFAULT_BIG_NUMBER_COLOR,
            },
          },
        ],
        [
          {
            name: 'big_number_left',
            config: {
              type: 'NumberControl',
              label: t('Big number left position'),
              min: 0,
              step: 1,
              renderTrigger: true,
              default: DEFAULT_BIG_NUMBER_LEFT,
              description: t('Horizontal offset in pixels from the left edge.'),
            },
          },
        ],
        [
          {
            name: 'big_number_top',
            config: {
              type: 'NumberControl',
              label: t('Gap from title'),
              min: 0,
              step: 1,
              renderTrigger: true,
              default: DEFAULT_BIG_NUMBER_TOP,
              description: t(
                'Vertical gap in pixels between the title and the big number.',
              ),
            },
          },
        ],
        [
          <ControlSubSectionHeader>
            {t('Metric Rows Style')}
          </ControlSubSectionHeader>,
        ],
        [
          {
            name: 'comparison_use_center_gap',
            config: {
              type: 'CheckboxControl',
              label: t('Second column gap from center'),
              default: false,
              renderTrigger: true,
              description: t(
                'Off (default): "Comparison spacing" is measured from the MoM text. On: the SAME slider is measured from the tile center line instead, so YoY no longer drifts when the MoM text changes length. Only the anchor changes - the slider, its drag behaviour and its saved value are shared by both modes.',
              ),
            },
          },
        ],
        [
          {
            name: 'comparison_gap',
            config: {
              type: 'SliderControl',
              label: t('Comparison spacing'),
              min: 0,
              max: 240,
              step: 4,
              default: DEFAULT_COMPARISON_GAP,
              renderTrigger: true,
              description: t(
                'Horizontal distance to YoY, applied from the MoM text by default or from the tile center line when "YoY gap from center" is checked. Both modes use this one slider. It only moves the second slot and never changes the font size.',
              ),
            },
          },
        ],
        [
          {
            name: 'swap_comparison_order',
            config: {
              type: 'CheckboxControl',
              label: t('Swap the two columns'),
              default: false,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'comparison_font_size',
            config: {
              ...subheaderFontSize.config,
              label: t('Comparison font size'),
              description: t(
                'Size of the YoY/MoM labels. The Tiny..Huge ratios are converted against a fixed reference height, so tall tiles do not make these secondary labels as large as the title. Applies when the dashboard-level "Uniform big number font size" setting is off; when it is on, one fixed dashboard-wide size is used instead.',
              ),
            },
          },
        ],
        [
          {
            name: 'comparison_top',
            config: {
              type: 'NumberControl',
              label: t('Gap from big number'),
              min: 0,
              step: 1,
              renderTrigger: true,
              default: DEFAULT_COMPARISON_TOP,
              description: t(
                'Vertical gap in pixels between the big number and the comparison rows.',
              ),
            },
          },
        ],
        [
          {
            name: 'comparison_positive_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Increase color'),
              renderTrigger: true,
              default: DEFAULT_COMPARISON_POSITIVE_COLOR,
            },
          },
        ],
        [
          {
            name: 'comparison_negative_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Decrease color'),
              renderTrigger: true,
              default: DEFAULT_COMPARISON_NEGATIVE_COLOR,
            },
          },
        ],
        [
          {
            name: 'comparison_zero_color',
            config: {
              type: 'ColorPickerControl',
              label: t('No change color'),
              renderTrigger: true,
              default: DEFAULT_COMPARISON_ZERO_COLOR,
            },
          },
        ],
        [
          {
            name: 'comparison_show_arrow',
            config: {
              type: 'CheckboxControl',
              label: t('Show trend arrow'),
              renderTrigger: true,
              default: DEFAULT_COMPARISON_SHOW_ARROW,
              description: t(
                'Display the up/down arrow (↑/↓) before the comparison value.',
              ),
            },
          },
        ],
        [
          {
            name: 'comparison_threshold',
            config: {
              type: 'NumberControl',
              label: t('No-change threshold'),
              min: 0,
              step: 0.01,
              renderTrigger: true,
              default: DEFAULT_COMPARISON_THRESHOLD,
              description: t(
                'When the absolute change is below this value, the comparison is shown in the no-change color with no arrow. In time-comparison mode this is a fraction (0.01 = 1%); in comparison-metric mode it is an absolute value.',
              ),
            },
          },
        ],
      ],
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
    // Switching to this viz type rebuilds form data from public controls
    // only. Persist the resolved rows so the saved form data keeps the
    // comparison configuration instead of reverting to empty placeholders.
    metric_rows: resolveMetricRows(
      formData as unknown as Record<string, unknown>,
    ),
  }),
};

export default config;
