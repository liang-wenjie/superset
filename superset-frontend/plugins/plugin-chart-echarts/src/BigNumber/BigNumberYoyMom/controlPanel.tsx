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
  MAX_COMPARISON_GAP,
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
                'Rows of metrics shown below the big number. Add as many rows as you need, then add or remove indicators inside any row (up to six): a row can hold one, two, three or more independently configured slots. Drag a row by its grip to reorder it. The first row starts as the MoM/YoY pair. A slot either shows a time comparison percentage or a metric value with its own label and number format. Each slot also has its own Style mode: inherit the chart-level defaults, show no color change, or customize the increase/decrease/no-change colors, trend arrow and no-change threshold for that indicator only. All rows share ONE column grid sized by the row with the most indicators, so rows with different indicator counts still line up.',
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
                // The slot editor reuses the NATIVE metric popover, so hand it
                // exactly the same datasource metadata as `MetricsControl`:
                // columns for the Simple tab, saved metrics for the Saved tab
                // and the datasource itself for SQL validation / dataset save.
                const datasource = explore?.datasource as
                  | {
                      columns?: unknown[];
                      metrics?: unknown[];
                    }
                  | undefined;
                const isObject = (
                  entry: unknown,
                ): entry is Record<string, unknown> =>
                  Boolean(entry && typeof entry === 'object');
                const columns = (datasource?.columns ?? []).filter(isObject);
                const savedMetrics = (datasource?.metrics ?? []).filter(
                  entry =>
                    isObject(entry) && typeof entry.metric_name === 'string',
                );
                const formData = (explore?.form_data ?? {}) as Record<
                  string,
                  unknown
                >;
                // The five chart-level comparison styles are the DEFAULTS for
                // every indicator. Raw form_data uses snake_case while chart
                // props are camelCase, so accept both. Controls that were
                // never touched fall back to the shipped constants.
                const styleValue = (
                  snakeKey: string,
                  camelKey: string,
                  fallback: unknown,
                ) => formData[snakeKey] ?? formData[camelKey] ?? fallback;
                return {
                  columns,
                  savedMetrics,
                  datasource: explore?.datasource,
                  offsetChoices: COMPARISON_OFFSET_CHOICES.map(([offset]) =>
                    String(offset),
                  ),
                  // Charts saved before this control existed still show their
                  // MoM/YoY pair as row 1 instead of an empty list.
                  defaultRows: resolveMetricRows(formData),
                  // Prefill a slot's Custom style with the current defaults.
                  styleDefaults: {
                    positiveColor: styleValue(
                      'comparison_positive_color',
                      'comparisonPositiveColor',
                      DEFAULT_COMPARISON_POSITIVE_COLOR,
                    ),
                    negativeColor: styleValue(
                      'comparison_negative_color',
                      'comparisonNegativeColor',
                      DEFAULT_COMPARISON_NEGATIVE_COLOR,
                    ),
                    zeroColor: styleValue(
                      'comparison_zero_color',
                      'comparisonZeroColor',
                      DEFAULT_COMPARISON_ZERO_COLOR,
                    ),
                    showArrow: styleValue(
                      'comparison_show_arrow',
                      'comparisonShowArrow',
                      DEFAULT_COMPARISON_SHOW_ARROW,
                    ),
                    threshold: styleValue(
                      'comparison_threshold',
                      'comparisonThreshold',
                      DEFAULT_COMPARISON_THRESHOLD,
                    ),
                  },
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
              // Deprecated but kept registered: charts saved before
              // equal-width columns existed still carry this flag in their
              // form data. Hide it from the editor and never read it in the
              // renderer so no indicator is pinned to the center line.
              visibility: () => false,
              label: t('Anchor second slot to center'),
              default: false,
              renderTrigger: true,
              description: t(
                'Deprecated: metric rows now split the tile into equal columns for every indicator. This control is kept only so charts saved with it keep their settings; it no longer affects the layout.',
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
              max: MAX_COMPARISON_GAP,
              step: 4,
              // New charts default to the widest possible spacing. The
              // renderer caps the step by the tile width, so text can never
              // be clipped by the right border at this default.
              default: MAX_COMPARISON_GAP,
              renderTrigger: true,
              description: t(
                'Distance between indicators in a row. The default is the WIDEST spacing that still keeps every indicator inside the tile - drag left to bring the shared columns back to the exact 1/N split (at 24) or closer together. N is the LARGEST indicator count of any row, so a two-indicator row uses the same 1/3 columns as a three-indicator row and the two rows stay aligned. It only moves the indicators and never changes the font size, and the text is never clipped by the tile border.',
              ),
            },
          },
        ],
        [
          {
            name: 'swap_comparison_order',
            config: {
              type: 'CheckboxControl',
              label: t('Reverse slot order'),
              default: false,
              renderTrigger: true,
              description: t(
                'Reverse the indicators of every row. With two indicators this simply swaps the two columns; with three or more the whole row is laid out right to left.',
              ),
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
              description: t(
                'Default increase color for every indicator. Set a slot to Custom in Metric rows to override it per indicator, or to No color change to skip coloring entirely.',
              ),
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
              description: t(
                'Default decrease color for every indicator. Set a slot to Custom in Metric rows to override it per indicator.',
              ),
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
              description: t(
                'Default no-change color for every indicator. Set a slot to Custom in Metric rows to override it per indicator.',
              ),
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
                'Display the up/down arrow (↑/↓) before the comparison value. This is the default for every indicator and can be overridden per indicator with its Custom style in Metric rows.',
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
                'When the absolute change is below this value, the comparison is shown in the no-change color with no arrow. In time-comparison mode this is a fraction (0.01 = 1%); in comparison-metric mode it is an absolute value. This is the default for every indicator and can be overridden per indicator with its Custom style in Metric rows.',
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
