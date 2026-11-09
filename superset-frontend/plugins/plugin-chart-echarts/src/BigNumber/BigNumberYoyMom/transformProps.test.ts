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
import { BigNumberYoyMomChartProps } from './types';
import transformProps from './transformProps';

jest.mock('@apache-superset/core/translation', () => ({
  t: (text: string) => text,
}));

jest.mock('@superset-ui/core', () => ({
  getMetricLabel: jest.fn(metric => metric),
  getNumberFormatter: jest.fn((format: string) => (value: number) => {
    const precision = /^,\.(\d)%$/.exec(format);
    if (precision) return `${(value * 100).toFixed(Number(precision[1]))}%`;
    const fixed = /^,\.(\d)f$/.exec(format);
    if (fixed) return value.toFixed(Number(fixed[1]));
    return String(value);
  }),
  getValueFormatter: jest.fn(
    () => (value: number) => `$${value.toLocaleString('en-US')}`,
  ),
  NumberFormats: { PERCENT_2_POINT: ',.2%' },
}));

describe('BigNumberYoyMom transformProps', () => {
  const baseFormData = {
    metric: 'SUM(sales)',
    headerText: '本月销售额',
    yAxisFormat: 'SMART_NUMBER',
    currencyFormat: undefined,
  };

  const baseDatasource = {
    currencyFormats: {},
    columnFormats: {},
    metrics: [{ metric_name: 'SUM(sales)', d3format: '.2f' }],
  };

  const buildChartProps = (
    data: Record<string, number | string | null>[],
    formData: Record<string, unknown> = {},
    seriesData?: Record<string, number | string | null>[],
  ) =>
    ({
      width: 400,
      height: 300,
      queriesData: [
        { data, detected_currency: null },
        ...(seriesData
          ? [
              {
                data: seriesData,
                colnames: ['报表时间', 'SUM(sales)'],
                detected_currency: null,
              },
            ]
          : []),
      ],
      formData: { ...baseFormData, ...formData },
      datasource: baseDatasource,
    }) as unknown as BigNumberYoyMomChartProps;

  test('renders title, big number and both comparisons from data', () => {
    const result = transformProps(
      buildChartProps([
        {
          'SUM(sales)': 1234567,
          'SUM(sales)__1 month ago': 1000000,
          'SUM(sales)__1 year ago': 1500000,
        },
      ]),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];

    expect(graphic[0].style.text).toBe('本月销售额');
    expect(graphic[0].style.fontSize).toBe(45);
    expect(graphic[0].style.fill).toBe('rgb(102, 102, 102)');
    expect(graphic[0].left).toBe(20);
    // The big number "1,234,567" would overflow a 400px tile at the default
    // 120px font, so it is auto-shrunk to fit and the whole stack re-centers.
    expect(graphic[0].top).toBeCloseTo(79.2);

    expect(graphic[1].style.text).toBe('$1,234,567');
    expect(graphic[1].style.fontSize).toBe(52);
    expect(graphic[1].style.fontWeight).toBe('bold');
    expect(graphic[1].style.fill).toBe('rgb(51, 51, 51)');

    expect(graphic[2].style.text).toBe('MoM ↑23.46%');
    expect(graphic[2].style.fill).toBe('rgb(0, 180, 42)');
    expect(graphic[2].left).toBe(20);
    // Both slots side by side (~702px at 45px) overflow the 360px available
    // width, so the comparison row is auto-shrunk to 21px and the stack
    // re-centers with the final heights.
    expect(graphic[2].style.fontSize).toBe(21);
    expect(graphic[2].top).toBeCloseTo(195.6);

    expect(graphic[3].style.text).toBe('YoY ↓17.70%');
    expect(graphic[3].style.fill).toBe('rgb(245, 63, 63)');
    // The second slot starts after the shrunk MoM width (154px) plus the gap.
    expect(graphic[3].left).toBe(198);
  });

  test('separates comparisons by estimated width when the gap is zero', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 90,
            'SUM(sales)__1 year ago': 80,
          },
        ],
        { comparisonGap: 0 },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // No overlap even at gap 0: YoY starts after the shrunk MoM width (168px).
    expect(graphic[2].left).toBe(20);
    expect(graphic[2].left + 168).toBeLessThanOrEqual(graphic[3].left);
    expect(graphic[3].left).toBe(188);
  });

  test('formats MoM and YoY percentages with their own formats', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 90,
            'SUM(sales)__1 year ago': 80,
          },
        ],
        {
          comparison1PercentDifferenceFormat: ',.1%',
          comparison2PercentDifferenceFormat: ',.3%',
        },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // .1% rounds 11.11% to one decimal, .3% keeps 25.00% with three decimals.
    expect(graphic[2].style.text).toBe('MoM ↑11.1%');
    expect(graphic[3].style.text).toBe('YoY ↑25.000%');
  });

  test('scales percentages by 100 for plain number formats', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 90,
          },
        ],
        { comparison1PercentDifferenceFormat: ',.2f' },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // ",.2f" has no "%": the decimal 0.1111 is scaled to 11.11 first.
    expect(graphic[2].style.text).toBe('MoM ↑11.11');
  });

  test('keeps the comparison row near the bottom on a tall tile', () => {
    const result = transformProps({
      ...buildChartProps([
        {
          'SUM(sales)': 100,
          'SUM(sales)__1 month ago': 90,
        },
      ]),
      height: 500,
    });
    const graphic = result.echartOptions.graphic as Record<string, any>[];

    // The title, number and comparison rows stay centered as one stack. The
    // title ("本月销售额" at the requested 75px would be 413px wide) and the
    // big number are auto-shrunk to fit the 400px tile (with a 3px safety
    // margin), and the comparison row (~1140px side by side at the requested
    // 75px) is shrunk to 21px too, so the stack re-centers with the final
    // heights.
    expect(graphic[2].style.fontSize).toBe(21);
    expect(graphic[2].top).toBeCloseTo(354.4);
  });

  test('does not shrink the big number when it already fits the tile width', () => {
    const result = transformProps({
      ...buildChartProps([
        {
          'SUM(sales)': 100,
          'SUM(sales)__1 month ago': 90,
        },
      ]),
      // Wide tile: "$100" at the default 0.4*300 = 120px font fits easily.
      width: 800,
    });
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[1].style.text).toBe('$100');
    expect(graphic[1].style.fontSize).toBe(120);
  });

  test('shrinks the big number to fit a narrow tile and stays readable', () => {
    const result = transformProps({
      ...buildChartProps([
        {
          'SUM(sales)': 15145470,
          'SUM(sales)__1 month ago': 14000000,
        },
      ]),
      // Narrow tile like a dashboard KPI card; the long number used to be
      // clipped on the right.
      width: 240,
    });
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    const bigNumber = graphic[1];
    // Font is reduced below the requested 120px, but not below the 12px floor.
    expect(bigNumber.style.fontSize).toBeLessThan(120);
    expect(bigNumber.style.fontSize).toBeGreaterThanOrEqual(12);
    // The whole formatted value is still rendered (not truncated).
    expect(bigNumber.style.text).toBeDefined();
    expect(String(bigNumber.style.text).length).toBeGreaterThan(0);
  });

  const getBigNumberFontSize = (
    value: number,
    formData: Record<string, unknown> = {},
    chartSize: { width?: number; height?: number } = {},
  ): number => {
    const result = transformProps({
      ...buildChartProps([{ 'SUM(sales)': value }], formData),
      ...chartSize,
    });
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    return graphic[1].style.fontSize;
  };

  test('keeps the big number font size uniform across tiles when enabled', () => {
    const uniform = { uniformBigNumberFontSize: true };
    const short = getBigNumberFontSize(7.81, uniform);
    const long = getBigNumberFontSize(1234567, uniform);
    // One size for every tile of this width, derived from the tile width and
    // the eight-character design number. The value plays no part in it.
    expect(short).toBe(92);
    expect(long).toBe(92);
  });

  test('keeps per-tile auto sizing when uniform sizing is disabled', () => {
    const short = getBigNumberFontSize(7.81);
    const long = getBigNumberFontSize(1234567);
    expect(long).toBe(52);
    expect(short).toBeGreaterThan(long);
  });

  test('uses the configured dashboard font size as an absolute pixel value', () => {
    expect(
      getBigNumberFontSize(7.81, {
        uniformBigNumberFontSize: true,
        uniformBigNumberFontSizePx: 48,
      }),
    ).toBe(48);
    expect(
      getBigNumberFontSize(7.81, {
        uniformBigNumberFontSize: true,
        uniformBigNumberFontSizePx: 80,
      }),
    ).toBe(80);
  });

  test('honours the chart own font size when no dashboard size is set', () => {
    expect(
      getBigNumberFontSize(7.81, {
        uniformBigNumberFontSize: true,
        bigNumberFontSize: 60,
      }),
    ).toBe(60);
  });

  test('never shrinks a tile for its own long value', () => {
    const uniform = {
      uniformBigNumberFontSize: true,
      uniformBigNumberFontSizePx: 48,
    };
    expect(getBigNumberFontSize(7.81, uniform)).toBe(48);
    expect(getBigNumberFontSize(3808637.34, uniform)).toBe(48);
  });

  test('derives the size from the tile width, never from the value', () => {
    const uniform = { uniformBigNumberFontSize: true };
    const wide = getBigNumberFontSize(7.81, uniform, { width: 800 });
    const normal = getBigNumberFontSize(7.81, uniform);
    const narrow = getBigNumberFontSize(7.81, uniform, { width: 240 });

    // Wider tiles get a bigger shared size. Sizing for the longest number on
    // the dashboard used to drag every tile down to ~44px, leaving a lot of
    // empty space on the right; the tile-width capacity fills much more of it.
    expect(wide).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(70);
    expect(normal).toBeGreaterThan(narrow);
    // A long value no longer shrinks its own tile.
    expect(getBigNumberFontSize(3808637.34, uniform, { width: 240 })).toBe(
      narrow,
    );

    // The whole value is still rendered, not truncated at the canvas edge.
    const result = transformProps(
      buildChartProps([{ 'SUM(sales)': 3808637.34 }], uniform),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[1].style.text).toBe('$3,808,637.34');
  });

  test('adapts a narrow tile down from its default size', () => {
    // A 200px tile cannot hold the default 0.4 * 120 = 48px font even with a
    // short value: the shared size follows the tile width, not the data.
    const result = transformProps({
      ...buildChartProps([{ 'SUM(sales)': 9457.13 }], {
        uniformBigNumberFontSize: true,
      }),
      width: 200,
      height: 120,
    });
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[1].style.fontSize).toBeLessThan(48);
    expect(graphic[1].style.text).toBe('$9,457.13');
    // Title and comparison rows stay legible instead of shrinking away.
    expect(graphic[0].style.fontSize).toBeGreaterThanOrEqual(10);
    expect(graphic[2].style.fontSize).toBeGreaterThanOrEqual(10);
  });

  const getAllFontSizes = (
    value: number,
    formData: Record<string, unknown> = {},
  ): number[] => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': value,
            'SUM(sales)__1 month ago': 90,
            'SUM(sales)__1 year ago': 80,
          },
        ],
        formData,
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    return graphic.map(element => element.style.fontSize);
  };

  test('scales the whole tile by one ratio when uniform sizing is enabled', () => {
    const uniform = {
      uniformBigNumberFontSize: true,
      uniformBigNumberFontSizePx: 48,
    };
    const shortTile = getAllFontSizes(7.81, uniform);
    const longTile = getAllFontSizes(1234567, uniform);

    // Title, big number and both comparison rows all land on the same sizes.
    expect(longTile).toEqual(shortTile);
    expect(shortTile).toEqual([18, 48, 18, 18]);

    const autoSizedTile = getAllFontSizes(7.81);
    expect(shortTile[0]).toBeLessThan(autoSizedTile[0]);
    expect(shortTile[1]).toBeLessThan(autoSizedTile[1]);
    expect(shortTile[2]).toBeLessThan(autoSizedTile[2]);
    expect(shortTile[3]).toBeLessThan(autoSizedTile[3]);
  });

  test('scales internal gaps by the same ratio as the tile text', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 7.81,
            'SUM(sales)__1 month ago': 90,
            'SUM(sales)__1 year ago': 80,
          },
        ],
        {
          uniformBigNumberFontSize: true,
          uniformBigNumberFontSizePx: 48,
          bigNumberTop: 50,
          comparisonTop: 100,
        },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    const titleRowHeight = graphic[0].style.fontSize * 1.2;
    const bigNumberRowHeight = graphic[1].style.fontSize * 1.2;
    // The 48px size is 0.4 of the 120px default, so 50/100px gaps become
    // 20/40px and every text size is scaled by the same 0.4 ratio.
    expect(graphic[1].top - graphic[0].top - titleRowHeight).toBeCloseTo(20);
    expect(graphic[2].top - graphic[1].top - bigNumberRowHeight).toBeCloseTo(
      40,
    );
  });

  test('applies the dashboard size to every text size in the tile', () => {
    const smaller = getAllFontSizes(7.81, {
      uniformBigNumberFontSize: true,
      uniformBigNumberFontSizePx: 24,
    });
    const larger = getAllFontSizes(7.81, {
      uniformBigNumberFontSize: true,
      uniformBigNumberFontSizePx: 48,
    });

    expect(larger[0]).toBeGreaterThan(smaller[0]);
    expect(larger[1]).toBeGreaterThan(smaller[1]);
    expect(larger[2]).toBeGreaterThan(smaller[2]);
    expect(larger[3]).toBeGreaterThan(smaller[3]);
  });

  test('shrinks a long comparison label to fit a narrow tile', () => {
    const result = transformProps({
      ...buildChartProps(
        [{ 'SUM(sales)': 100, 'SUM(sales)__1 month ago': 90 }],
        {
          comparison1Label: '费用占比',
          showComparison2: false,
        },
      ),
      // Narrow dashboard KPI card; the label used to be clipped on the right
      // (e.g. "46.93" losing its "%").
      width: 200,
    });
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // The full label and value survive and the font is reduced below the
    // requested 45px so the row fits inside the 160px available width.
    expect(graphic[2].style.text).toBe('费用占比 ↑11.11%');
    expect(graphic[2].style.fontSize).toBeLessThan(45);
    expect(graphic[2].left).toBe(20);
  });

  test('keeps the comparison font size when both slots fit the tile', () => {
    const result = transformProps({
      ...buildChartProps([
        {
          'SUM(sales)': 100,
          'SUM(sales)__1 month ago': 90,
          'SUM(sales)__1 year ago': 80,
        },
      ]),
      // Wide tile: the MoM + YoY row (~702px at 45px) fits within 760px.
      width: 800,
    });
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[2].style.fontSize).toBe(45);
    expect(graphic[3].style.fontSize).toBe(45);
  });

  test('reads comparison values from configured result columns', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            prev_month_sales: 80,
            prev_year_sales: 120,
          },
        ],
        {
          comparison1Column: 'prev_month_sales',
          comparison2Column: 'prev_year_sales',
        },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];

    // A comparison value column renders the value itself, like the big number.
    expect(graphic[2].style.text).toBe('MoM ↑80');
    expect(graphic[2].style.fill).toBe('rgb(0, 180, 42)');
    expect(graphic[3].style.text).toBe('YoY ↑120');
    expect(graphic[3].style.fill).toBe('rgb(0, 180, 42)');
  });

  test('reads custom SQL comparison values even when the column name has normalized whitespace', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'MIN(monthly_sales_count - 100000)': 80,
          },
        ],
        {
          comparison1Mode: 'metric',
          comparison1Column: {
            expressionType: 'SQL',
            sqlExpression: 'MIN(monthly_sales_count-100000)',
          },
        },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // The whitespace-normalized column is matched and the value rendered.
    expect(graphic[2].style.text).toBe('MoM ↑80');
  });

  test('formats comparison values with the slot percent difference format', () => {
    const result = transformProps(
      buildChartProps([{ 'SUM(sales)': 100, prev_month_sales: 80 }], {
        comparison1Mode: 'metric',
        comparison1Column: 'prev_month_sales',
        comparison1PercentDifferenceFormat: ',.3f',
      }),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // The slot's configured number format applies to comparison values.
    expect(graphic[2].style.text).toBe('MoM ↑80.000');
  });

  test('reads snake_case form data keys exactly as Explore saves them', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            count: 80,
            xx: -100000,
          },
        ],
        {
          comparison1_mode: 'metric',
          comparison1_column: 'count',
          comparison2_mode: 'metric',
          comparison2_column: {
            expressionType: 'SQL',
            sqlExpression: 'MIN(monthly_sales_count-100000)',
            label: 'xx',
            hasCustomLabel: true,
          },
        },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // snake_case keys from the saved form data are picked up and both slots
    // render their comparison values, not percentages.
    expect(graphic[2].style.text).toBe('MoM ↑80');
    expect(graphic[3].style.text).toBe('YoY ↓-100000');
  });

  test('time_shift mode wins over a leftover comparison column', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 90,
            prev_month_sales: 80,
          },
        ],
        {
          comparison1Mode: 'time_shift',
          comparison1Column: 'prev_month_sales',
          comparison1Offset: '1 month ago',
        },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[2].style.text).toBe('MoM ↑11.11%');
  });

  test('metric mode reads the comparison metric explicitly', () => {
    const result = transformProps(
      buildChartProps([{ 'SUM(sales)': 100, prev_month_sales: 80 }], {
        comparison1Mode: 'metric',
        comparison1Column: 'prev_month_sales',
      }),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[2].style.text).toBe('MoM ↑80');
  });

  test('shows "—" when the configured comparison column is missing', () => {
    const result = transformProps(
      buildChartProps([{ 'SUM(sales)': 100 }], {
        comparison1Column: 'prev_month_sales',
      }),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[2].style.text).toBe('MoM —');
    expect(graphic[2].style.fill).toBe('rgb(102, 102, 102)');
  });

  test('applies configurable positions, font sizes and colors', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 100,
          },
        ],
        {
          headerText: 'Revenue',
          titleFontSize: 18,
          titleColor: { r: 1, g: 2, b: 3 },
          titleLeft: 30,
          titleTop: 40,
          bigNumberFontSize: 44,
          bigNumberColor: { r: 10, g: 20, b: 30 },
          bigNumberLeft: 50,
          bigNumberTop: 80,
          comparisonFontSize: 16,
          comparisonTop: 120,
          comparison1Left: 60,
          comparison2Left: 200,
          comparisonPositiveColor: { r: 0, g: 128, b: 0 },
          comparisonNegativeColor: { r: 128, g: 0, b: 0 },
          comparisonZeroColor: { r: 200, g: 200, b: 200 },
        },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    const title = graphic[0];
    const bigNumber = graphic[1];
    const mom = graphic[2];

    expect(title.style.text).toBe('Revenue');
    expect(title.style.fontSize).toBe(18);
    expect(title.style.fill).toBe('rgb(1, 2, 3)');
    expect(title.left).toBe(30);
    expect(title.top).toBe(40);

    expect(bigNumber.style.fontSize).toBe(44);
    expect(bigNumber.style.fill).toBe('rgb(10, 20, 30)');
    expect(bigNumber.left).toBe(50);
    // bigNumberTop is the gap below the title: 40 + 18*1.2 + 80 = 141.6
    expect(bigNumber.top).toBe(141.6);

    // zero percent change renders without an arrow, in the zero color
    expect(mom.style.text).toBe('MoM 0.00%');
    expect(mom.style.fill).toBe('rgb(200, 200, 200)');
    expect(mom.style.fontSize).toBe(16);
    expect(mom.left).toBe(60);
    // The configured stack (141.6 + 44*1.2 + 120 + 16*1.2 = 314.4) would
    // overflow the 300px tile, so the internal gaps are compressed first and
    // the comparison row lands at 141.6 + 52.8 + 86.4 = 280.8.
    expect(mom.top).toBeCloseTo(280.8);
  });

  test('aligns the comparison row with a custom big number left offset', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 90,
            'SUM(sales)__1 year ago': 80,
          },
        ],
        { bigNumberLeft: 100 },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // The comparison row starts at the big number's left offset instead of a
    // hard-coded 20, so both rows stay aligned and share the same available
    // width rule.
    expect(graphic[1].left).toBe(100);
    expect(graphic[2].left).toBe(100);
    expect(graphic[3].left).toBeGreaterThan(100);
  });

  test('hides title when header text is empty', () => {
    const result = transformProps(
      buildChartProps([], {
        headerText: '',
        showComparison1: false,
        showComparison2: false,
      }),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // only the big number placeholder remains
    expect(graphic).toHaveLength(1);
    expect(graphic[0].style.text).toBe('No data');
  });

  test('moves the big number and comparisons up when the title is hidden', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 90,
            'SUM(sales)__1 year ago': 80,
          },
        ],
        { headerText: '' },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // no title element: big number and comparisons stay centered as a stack.
    expect(graphic).toHaveLength(3);
    expect(graphic[0].style.text).toBe('$100');
    expect(graphic[0].top).toBeCloseTo(65.4);
    expect(graphic[1].top).toBeCloseTo(209.4);
    expect(graphic[2].top).toBeCloseTo(209.4);
  });

  test('pushes comparisons below a large big number without overlapping', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 90,
          },
        ],
        { headerText: '', bigNumberFontSize: 60 },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // The stack is centered while preserving the configured internal gap.
    expect(graphic[0].top).toBeCloseTo(101.4);
    expect(graphic[1].top).toBeCloseTo(173.4);
  });

  test('maps title font size ratios to pixels', () => {
    const tiny = transformProps(
      buildChartProps([{ 'SUM(sales)': 100 }], { titleFontSize: 0.125 }),
    );
    const huge = transformProps(
      buildChartProps([{ 'SUM(sales)': 100 }], { titleFontSize: 0.4 }),
    );
    const graphicTiny = tiny.echartOptions.graphic as Record<string, any>[];
    const graphicHuge = huge.echartOptions.graphic as Record<string, any>[];
    expect(graphicTiny[0].style.fontSize).toBe(38);
    // The "MoM —" + "YoY —" row (368px at 45px) overflows the 357px available
    // width (400px minus the 20px margins and the 3px safety margin), so it
    // shrinks to 43px and nudges the stack.
    expect(graphicTiny[1].top).toBeCloseTo(75);
    // At 0.4*300 the title ("本月销售额") would be 660px wide, so it
    // auto-shrinks to 64px to fit the same available width and the stack
    // re-centers.
    expect(graphicHuge[0].style.fontSize).toBe(64);
    expect(graphicHuge[1].top).toBeCloseTo(90.6);
  });

  test('pushes the big number below a large title', () => {
    const result = transformProps(
      buildChartProps([{ 'SUM(sales)': 100 }], { titleFontSize: 40 }),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // graphic[0]=title, graphic[1]=big number. The comparison row shrinks to
    // 43px under the 357px available width, so the centered stack sits lower.
    expect(graphic[0].top).toBeCloseTo(28.2);
    expect(graphic[1].top).toBeCloseTo(76.2);
  });

  test('shrinks a long title to fit a narrow tile', () => {
    const result = transformProps({
      ...buildChartProps(
        [{ 'SUM(sales)': 100, 'SUM(sales)__1 month ago': 90 }],
        { headerText: '2026年全年销售收入汇总' },
      ),
      // A narrow dashboard KPI card; the long Chinese title would be clipped
      // on the right without the same auto-shrink applied to the other rows.
      width: 200,
    });
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // The full title survives and the font is reduced below the requested
    // 45px, but not below the 12px floor.
    expect(graphic[0].style.text).toBe('2026年全年销售收入汇总');
    expect(graphic[0].style.fontSize).toBeLessThan(45);
    expect(graphic[0].style.fontSize).toBeGreaterThanOrEqual(12);
  });

  test('uses the configured comparison gap below the big number', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 90,
          },
        ],
        { bigNumberFontSize: 80, comparisonTop: 120 },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // graphic[0]=title, graphic[1]=big number (0+54+0=54), graphic[2]=MoM line.
    // The comparison row is shrunk to 21px, so the stack is a bit shorter and
    // comparison sits at 56.4 + 80*1.2 + 120 = 272.4.
    expect(graphic[1].top).toBeCloseTo(56.4);
    expect(graphic[2].top).toBeCloseTo(272.4);
  });

  test('compresses internal gaps when content overflows the tile height', () => {
    const result = transformProps({
      ...buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 90,
          },
        ],
        { bigNumberTop: 50, comparisonTop: 100 },
      ),
      // The requested stack (36 + 50 + 96 + 100 + 25.2 = 307.2px) exceeds the
      // tile, so the internal gaps shrink to 42.8/0 and the comparison row
      // stays inside the 200px height instead of being pushed out of the
      // bottom.
      height: 200,
    });
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    const comparisonRowHeight = graphic[2].style.fontSize * 1.2;
    expect(graphic[2].top).toBeCloseTo(174.8);
    expect(graphic[2].top + comparisonRowHeight).toBeLessThanOrEqual(200);
  });

  test('treats blank gap controls as zero like an explicit zero', () => {
    const withBlank = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 90,
          },
        ],
        { bigNumberTop: '', comparisonTop: '' },
      ),
    );
    const withZero = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 90,
          },
        ],
        { bigNumberTop: 0, comparisonTop: 0 },
      ),
    );
    const blankGraphic = withBlank.echartOptions.graphic as Record<
      string,
      any
    >[];
    const zeroGraphic = withZero.echartOptions.graphic as Record<string, any>[];
    // The comparison row lands at the same position for '' and 0.
    expect(blankGraphic[2].top).toBe(zeroGraphic[2].top);
  });

  test('shows placeholders when there is no data', () => {
    const result = transformProps(buildChartProps([]));
    const graphic = result.echartOptions.graphic as Record<string, any>[];

    // title element comes first, then the big number placeholder
    expect(graphic[0].style.text).toBe('本月销售额');
    expect(graphic[1].style.text).toBe('No data');
    expect(graphic[2].style.text).toBe('MoM —');
    expect(graphic[3].style.text).toBe('YoY —');
  });

  test('hides comparisons when disabled', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 90,
          },
        ],
        { showComparison1: false, showComparison2: false },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic).toHaveLength(2); // title + big number
  });

  test('shows "—" when comparison offset is missing from the data', () => {
    const result = transformProps(buildChartProps([{ 'SUM(sales)': 100 }]));
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[2].style.text).toBe('MoM —');
    expect(graphic[2].style.fill).toBe('rgb(102, 102, 102)');
  });

  test('matches point series for "No filter" time shifts', () => {
    const result = transformProps(
      buildChartProps(
        [{ 'SUM(sales)': 27656 }],
        {
          comparison1Offset: '1 month ago',
          comparison2Offset: '1 year ago',
          timeGrainSqla: 'month',
        },
        [
          { 报表时间: '2026-09-01', 'SUM(sales)': 3260 },
          { 报表时间: '2026-08-01', 'SUM(sales)': 3243 },
          { 报表时间: '2026-07-01', 'SUM(sales)': 3068 },
          { 报表时间: '2026-01-01', 'SUM(sales)': 3169 },
        ],
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];

    // (3260 - 3243) / 3243 ≈ 0.52%
    expect(graphic[2].style.text).toBe('MoM ↑0.52%');
    expect(graphic[2].style.fill).toBe('rgb(0, 180, 42)');
    // 2025-09 is not in the series → "—"
    expect(graphic[3].style.text).toBe('YoY —');
  });

  test('matches epoch-millisecond time points from expression columns', () => {
    const result = transformProps(
      buildChartProps(
        [{ 'SUM(sales)': 100 }],
        { comparison1Offset: '1 month ago', timeGrainSqla: 'month' },
        [
          { 报表时间: 1788220800000, 'SUM(sales)': 60 }, // 2026-09-01
          { 报表时间: 1785542400000, 'SUM(sales)': 50 }, // 2026-08-01
        ],
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[2].style.text).toBe('MoM ↑20.00%');
  });

  test('falls back to the offset column when no point series is present', () => {
    const result = transformProps(
      buildChartProps([{ 'SUM(sales)': 100, 'SUM(sales)__1 month ago': 90 }], {
        comparison1Offset: '1 month ago',
      }),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[2].style.text).toBe('MoM ↑11.11%');
  });

  test('hides the trend arrow when show arrow is disabled', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 90,
            'SUM(sales)__1 year ago': 110,
          },
        ],
        { comparisonShowArrow: false },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // Still colored by direction, but no ↑/↓ prefix.
    expect(graphic[2].style.text).toBe('MoM 11.11%');
    expect(graphic[2].style.fill).toBe('rgb(0, 180, 42)');
    expect(graphic[3].style.text).toBe('YoY 9.09%');
    expect(graphic[3].style.fill).toBe('rgb(245, 63, 63)');
  });

  test('treats small changes as no-change when a threshold is set', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 99.9, // +0.1%
            'SUM(sales)__1 year ago': 110, // +10%
          },
        ],
        { comparisonThreshold: 0.05 }, // 5%
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // 0.1% is below the 5% threshold → no-change color, no arrow.
    expect(graphic[2].style.text).toBe('MoM 0.10%');
    expect(graphic[2].style.fill).toBe('rgb(102, 102, 102)');
    // 10% is above the threshold → normal increase styling.
    expect(graphic[3].style.text).toBe('YoY ↓9.09%');
    expect(graphic[3].style.fill).toBe('rgb(245, 63, 63)');
  });
});
