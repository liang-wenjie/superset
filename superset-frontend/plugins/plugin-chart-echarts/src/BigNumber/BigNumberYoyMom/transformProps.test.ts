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

  // Width of one comparison slot, using the same estimator the plugin uses.
  const comparisonTextWidth = (element: Record<string, any>): number =>
    Math.ceil(
      Array.from(String(element.style.text)).reduce(
        (total, char) => total + (char.charCodeAt(0) > 255 ? 1 : 0.5),
        0,
      ) * element.style.fontSize,
    );

  const DARK_THEME = {
    colorBgContainer: '#141414',
    colorText: 'rgba(255, 255, 255, 0.88)',
    colorTextSecondary: 'rgba(255, 255, 255, 0.65)',
    colorTextTertiary: 'rgba(255, 255, 255, 0.45)',
    colorSuccess: '#49aa19',
    colorError: '#dc4446',
  };

  const LIGHT_THEME = {
    colorBgContainer: '#ffffff',
    colorText: '#000000',
    colorTextSecondary: '#555555',
    colorTextTertiary: '#888888',
    colorSuccess: '#52c41a',
    colorError: '#ff4d4f',
  };

  const withTheme = (
    props: BigNumberYoyMomChartProps,
    theme: Record<string, unknown>,
  ): BigNumberYoyMomChartProps =>
    ({ ...props, theme }) as unknown as BigNumberYoyMomChartProps;

  const savedDefaultColors = {
    titleColor: { r: 102, g: 102, b: 102 },
    bigNumberColor: { r: 51, g: 51, b: 51 },
    comparisonPositiveColor: { r: 0, g: 180, b: 42 },
    comparisonNegativeColor: { r: 245, g: 63, b: 63 },
    comparisonZeroColor: { r: 102, g: 102, b: 102 },
  };

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
    expect(graphic[0].top).toBeCloseTo(81);

    expect(graphic[1].style.text).toBe('$1,234,567');
    expect(graphic[1].style.fontSize).toBe(52);
    expect(graphic[1].style.fontWeight).toBe('bold');
    expect(graphic[1].style.fill).toBe('rgb(51, 51, 51)');

    expect(graphic[2].style.text).toBe('MoM ↑23.46%');
    expect(graphic[2].style.fill).toBe('rgb(0, 180, 42)');
    expect(graphic[2].left).toBe(20);
    // Both slots side by side overflow the 400px canvas at the requested
    // 45px, so the comparison row is kept at the fixed 18px and the stack
    // re-centers with the final heights. The comparison-specific width model
    // (0.5em ASCII / 1em full-width) is much tighter than the old generic
    // one, so the row keeps a larger, configurable size.
    expect(graphic[2].style.fontSize).toBe(18);
    expect(graphic[2].top).toBeCloseTo(197.4);

    expect(graphic[3].style.text).toBe('YoY ↓17.70%');
    expect(graphic[3].style.fill).toBe('rgb(245, 63, 63)');
    // Equal columns: 400px tile minus the 20px left offset leaves 380px, so
    // the second indicator starts at 20 + 380/2 instead of right after MoM.
    expect(graphic[3].left).toBe(210);
  });

  test('pulls the equal columns together at gap zero without overlapping', () => {
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
    // The default 24px is the exact equal split; gap 0 pulls the columns
    // 24px closer (20 + 190 - 24), still leaving plenty of room for MoM.
    expect(graphic[2].left).toBe(20);
    expect(graphic[3].left).toBe(186);
    expect(graphic[3].left).toBeGreaterThanOrEqual(
      graphic[2].left + comparisonTextWidth(graphic[2]),
    );
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
    // 75px) is now a fixed 18px, so the stack re-centers with the final
    // heights.
    expect(graphic[2].style.fontSize).toBe(18);
    expect(graphic[2].top).toBeCloseTo(356.2);
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

  // Same width model the plugin uses when it caps the shared font size.
  const numericWidthPerPx = (text: string): number =>
    Array.from(text).reduce((width, char) => {
      if (char.charCodeAt(0) > 255) return width + 1;
      if (char >= '0' && char <= '9') return width + 0.58;
      if (',.- '.includes(char)) return width + 0.3;
      return width + 0.62;
    }, 0);

  const TILE_WIDTH = 400;
  // Rightmost pixel of the YoY/MoM graphic text. Anything past the tile width
  // is clipped by the canvas.
  const comparisonRightEdge = (graphic: Record<string, any>[]): number =>
    Math.max(
      ...graphic
        .slice(2)
        .map(element => element.left + comparisonTextWidth(element)),
    );
  // left offset + uniform right padding + safety margin
  const UNIFORM_AVAILABLE_WIDTH = TILE_WIDTH - 20 - 4 - 3;

  test('keeps one font size and fits the longest number of the group', () => {
    // The dashboard injects the very same list into every tile of one area.
    const uniform = {
      uniformBigNumberFontSize: true,
      uniformBigNumberReferenceTexts: [
        '$3,808,637.34',
        '3,808,637.34',
        '$7.81',
      ],
    };
    const short = getBigNumberFontSize(7.81, uniform);
    const long = getBigNumberFontSize(3808637.34, uniform);
    // Neither tile shrinks on its own: the WHOLE group uses one size.
    expect(short).toBe(long);
    // ... and that size was chosen so the longest number is not clipped.
    expect(numericWidthPerPx('$3,808,637.34') * long).toBeLessThanOrEqual(
      UNIFORM_AVAILABLE_WIDTH,
    );
    expect(numericWidthPerPx('$7.81') * short).toBeLessThanOrEqual(
      UNIFORM_AVAILABLE_WIDTH,
    );
    // A tile with a short number would otherwise keep the width-only size,
    // which cannot fit the long number of another tile in the same group.
    const widthOnlyShortTile = getBigNumberFontSize(7.81, {
      uniformBigNumberFontSize: true,
    });
    expect(widthOnlyShortTile).toBeGreaterThan(long);
    expect(
      numericWidthPerPx('$3,808,637.34') * widthOnlyShortTile,
    ).toBeGreaterThan(UNIFORM_AVAILABLE_WIDTH);
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

  test('shrinks the whole group together when one tile has a long value', () => {
    const uniform = {
      uniformBigNumberFontSize: true,
      uniformBigNumberFontSizePx: 48,
      uniformBigNumberReferenceTexts: ['$3,808,637.34', '3,808,637.34'],
    };
    const shortTile = getBigNumberFontSize(7.81, uniform);
    const longTile = getBigNumberFontSize(3808637.34, uniform);
    // No tile shrinks alone: the whole group lands on one size.
    expect(shortTile).toBe(longTile);
    // The configured 48px is an upper bound, not a promise: the group fits
    // the longest number instead of letting that tile clip its value.
    expect(longTile).toBeLessThanOrEqual(48);
    expect(numericWidthPerPx('$3,808,637.34') * longTile).toBeLessThanOrEqual(
      UNIFORM_AVAILABLE_WIDTH,
    );
  });

  test('derives the shared size from tile width and the longest group number', () => {
    const uniform = {
      uniformBigNumberFontSize: true,
      uniformBigNumberReferenceTexts: ['$7.81'],
    };
    const wide = getBigNumberFontSize(7.81, uniform, { width: 800 });
    const normal = getBigNumberFontSize(7.81, uniform);
    const narrow = getBigNumberFontSize(7.81, uniform, { width: 240 });

    // Wider tiles still get a bigger shared size.
    expect(wide).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(narrow);

    // A long number elsewhere in the group shrinks this short tile too.
    const longGroup = {
      ...uniform,
      uniformBigNumberReferenceTexts: ['$3,808,637.34'],
    };
    const longGroupSize = getBigNumberFontSize(7.81, longGroup);
    expect(longGroupSize).toBeLessThan(normal);
    expect(
      numericWidthPerPx('$3,808,637.34') * longGroupSize,
    ).toBeLessThanOrEqual(UNIFORM_AVAILABLE_WIDTH);

    // The whole value is still rendered, not truncated at the canvas edge.
    const result = transformProps(
      buildChartProps([{ 'SUM(sales)': 3808637.34 }], longGroup),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[1].style.text).toBe('$3,808,637.34');
    expect(
      numericWidthPerPx('$3,808,637.34') * graphic[1].style.fontSize,
    ).toBeLessThanOrEqual(UNIFORM_AVAILABLE_WIDTH);
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
    // Title stays legible; the comparison row may go smaller than the
    // legacy 10px floor on a tile this narrow, but must never be clipped.
    expect(graphic[0].style.fontSize).toBeGreaterThanOrEqual(10);
    expect(graphic[2].style.fontSize).toBeGreaterThanOrEqual(8);
    expect(comparisonRightEdge(graphic)).toBeLessThanOrEqual(200);
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
    // A realistic long value: keeps the comparison percentages in a normal
    // range so both tiles exercise the same shared comparison size.
    const longTile = getAllFontSizes(123.4567, uniform);

    // Title, big number and both comparison rows all land on the same sizes.
    // The comparison row is capped by the tile width (one shared cap), so it
    // no longer overflows the canvas on narrow dashboards. Its glyphs are
    // narrower than the number's, so it takes a larger share than the title.
    expect(longTile).toEqual(shortTile);
    expect(shortTile).toEqual([18, 48, 22, 22]);

    const autoSizedTile = getAllFontSizes(7.81);
    expect(shortTile[0]).toBeLessThan(autoSizedTile[0]);
    expect(shortTile[1]).toBeLessThan(autoSizedTile[1]);
    // The comparison row uses a wider, more accurate width model in uniform
    // mode, so it may be slightly larger than the free auto-fit size (22 vs 21
    // here). What matters is that both slots share ONE size and stay inside
    // the canvas -- the clipping tests cover that separately.
    expect(shortTile[2]).toBe(shortTile[3]);
  });

  test('keeps label sizes identical across tiles with different saved controls', () => {
    const shared = {
      uniformBigNumberFontSize: true,
      uniformBigNumberFontSizePx: 48,
      uniformBigNumberReferenceTexts: ['$3,808,637.34'],
    };
    const plain = getAllFontSizes(7.81, shared);
    const customized = getAllFontSizes(123.4567, {
      ...shared,
      titleFontSize: 0.5,
      comparisonFontSize: 0.3,
    });

    // Saved per-chart title/comparison sizes no longer leak into the shared
    // sizing: this was the reason the YoY/MoM rows looked different per tile.
    expect(customized).toEqual(plain);
    expect(plain[2]).toBe(plain[3]);
  });

  test('keeps one shared comparison size while the group shrinks', () => {
    const shortGroup = getAllFontSizes(7.81, {
      uniformBigNumberFontSize: true,
      uniformBigNumberReferenceTexts: ['$7.81'],
    });
    const longGroup = getAllFontSizes(7.81, {
      uniformBigNumberFontSize: true,
      uniformBigNumberReferenceTexts: ['$3,808,637.34'],
    });

    // Big number and title shrink with the group, while the comparison rows
    // stay on the one tile-width-derived size shared by the dashboard.
    expect(longGroup[1]).toBeLessThan(shortGroup[1]);
    expect(longGroup[0]).toBeLessThan(shortGroup[0]);
    expect(longGroup[2]).toBe(shortGroup[2]);
    expect(longGroup[3]).toBe(shortGroup[3]);
    expect(longGroup[2]).toBe(longGroup[3]);
  });

  test('never clips the second comparison slot in uniform mode', () => {
    // A real dashboard KPI tile is only ~150 CSS px wide; at 240px the row
    // happens to fit even without the fix, so the test must use a real card.
    const narrowWidth = 160;
    const uniform = {
      uniformBigNumberFontSize: true,
      uniformBigNumberReferenceTexts: ['$3,808,637.34'],
      comparison1Label: '同比',
      comparison2Label: '环比',
    };
    const buildNarrow = (value: number) =>
      transformProps({
        ...buildChartProps(
          [
            {
              'SUM(sales)': value,
              'SUM(sales)__1 month ago': 10,
              'SUM(sales)__1 year ago': 20,
            },
          ],
          uniform,
        ),
        width: narrowWidth,
      });
    const shortGraphic = buildNarrow(100).echartOptions.graphic as Record<
      string,
      any
    >[];
    const longGraphic = buildNarrow(1000).echartOptions.graphic as Record<
      string,
      any
    >[];

    // Reproduces the dashboard screenshot: the second slot used to be cut
    // off at the canvas edge. Both tiles now keep the whole row inside the
    // canvas and use exactly one shared comparison font size.
    expect(comparisonRightEdge(shortGraphic)).toBeLessThanOrEqual(narrowWidth);
    expect(comparisonRightEdge(longGraphic)).toBeLessThanOrEqual(narrowWidth);
    expect(shortGraphic[2].style.fontSize).toBe(longGraphic[2].style.fontSize);
    expect(shortGraphic[3].style.fontSize).toBe(longGraphic[3].style.fontSize);
  });

  test('fits the YoY/MoM row on dashboard 5 KPI cards', () => {
    // dashboard 5: uniform sizing on with no pixel cap, big_number_left=0,
    // comparison_gap=24, Chinese labels, longest value 3,808,637.34. Cards
    // saved different comparison font sizes (0.125 / 0.15) but must render
    // one shared size without clipping the second slot. The tile is ~150 CSS
    // px wide in the reported dashboard screenshot.
    const tileWidth = 150;
    const shared = {
      uniformBigNumberFontSize: true,
      uniformBigNumberReferenceTexts: ['$3,808,637.34', '$7.81', '$9,457.13'],
      bigNumberLeft: 0,
      comparisonGap: 24,
      comparison1Label: '同比',
      comparison2Label: '环比',
      comparison1PercentDifferenceFormat: ',.2%',
      comparison2PercentDifferenceFormat: ',.2%',
    };
    const build = (value: number, comparisonFontSize: number) =>
      transformProps({
        ...buildChartProps(
          [
            {
              'SUM(sales)': value,
              'SUM(sales)__1 month ago': value / 2,
              'SUM(sales)__1 year ago': value / 3,
            },
          ],
          { ...shared, comparisonFontSize },
        ),
        width: tileWidth,
        height: 120,
      }).echartOptions.graphic as Record<string, any>[];

    const profit = build(3808637.34, 0.125);
    const net = build(7.81, 0.15);

    expect(net[2].style.fontSize).toBe(profit[2].style.fontSize);
    expect(net[3].style.fontSize).toBe(profit[3].style.fontSize);
    expect(comparisonRightEdge(profit)).toBeLessThanOrEqual(tileWidth);
    expect(comparisonRightEdge(net)).toBeLessThanOrEqual(tileWidth);
    expect(profit[2].style.fontSize).toBeGreaterThanOrEqual(8);
  });

  test('enlarges the comparison row on a real-width dashboard tile', () => {
    // dashboard 5 renders ~290 CSS px wide tiles. The legacy width estimator
    // overstated a "同比 ↑104.79%" slot by ~60%, leaving the YoY/MoM text at
    // 13px with a wide empty gap on the right.
    const tileWidth = 290;
    const shared = {
      uniformBigNumberFontSize: true,
      uniformBigNumberReferenceTexts: [
        '$3,808,637.34',
        '$7.81',
        '$9,457.13',
        '$383,184',
      ],
      bigNumberLeft: 0,
      comparisonGap: 24,
      comparison1Label: '同比',
      comparison2Label: '环比',
      comparison1PercentDifferenceFormat: ',.2%',
      comparison2PercentDifferenceFormat: ',.2%',
    };
    const build = (value: number, monthAgo: number, yearAgo: number) =>
      transformProps({
        ...buildChartProps(
          [
            {
              'SUM(sales)': value,
              'SUM(sales)__1 month ago': monthAgo,
              'SUM(sales)__1 year ago': yearAgo,
            },
          ],
          shared,
        ),
        width: tileWidth,
        height: 190,
      }).echartOptions.graphic as Record<string, any>[];

    const profit = build(3808637.34, 1860000, 2100000);
    const net = build(7.81, 9.29, 10.51);

    // Visibly larger than the old 13px, one shared size across tiles, and
    // still entirely inside the canvas.
    expect(profit[2].style.fontSize).toBeGreaterThanOrEqual(17);
    expect(net[2].style.fontSize).toBe(profit[2].style.fontSize);
    expect(net[3].style.fontSize).toBe(profit[3].style.fontSize);
    expect(comparisonRightEdge(profit)).toBeLessThanOrEqual(tileWidth);
    expect(comparisonRightEdge(net)).toBeLessThanOrEqual(tileWidth);
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
    expect(graphic[2].style.fontSize).toBe(18);
    expect(graphic[3].style.fontSize).toBe(18);
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
    expect(graphic[0].top).toBeCloseTo(67.2);
    expect(graphic[1].top).toBeCloseTo(211.2);
    expect(graphic[2].top).toBeCloseTo(211.2);
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
    expect(graphic[0].top).toBeCloseTo(103.2);
    expect(graphic[1].top).toBeCloseTo(175.2);
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
    // The "MoM —" + "YoY —" row fits the 400px canvas at the requested 45px,
    // so the configured comparison size is kept instead of being flattened
    // by an over-estimating auto-fit.
    expect(graphicTiny[1].top).toBeCloseTo(90);
    // At 0.4*300 the title ("本月销售额") would be 660px wide, so it
    // auto-shrinks to 64px to fit the same available width and the stack
    // re-centers.
    expect(graphicHuge[0].style.fontSize).toBe(64);
    expect(graphicHuge[1].top).toBeCloseTo(105.6);
  });

  test('pushes the big number below a large title', () => {
    const result = transformProps(
      buildChartProps([{ 'SUM(sales)': 100 }], { titleFontSize: 40 }),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // graphic[0]=title, graphic[1]=big number. The comparison row keeps its
    // configured 45px because it fits, so the centered stack sits lower.
    expect(graphic[0].top).toBeCloseTo(43.2);
    expect(graphic[1].top).toBeCloseTo(91.2);
  });

  test('shrinks a long title to fit a narrow tile', () => {
    const result = transformProps({
      ...buildChartProps(
        [{ 'SUM(sales)': 100, 'SUM(sales)__1 month ago': 90 }],
        {
          headerText: '2026年全年销售收入汇总',
        },
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
    // The comparison row stays at 18px, so the stack is shorter and the
    // internal gaps are compressed to keep everything inside the tile.
    expect(graphic[1].top).toBeCloseTo(58.2);
    expect(graphic[2].top).toBeCloseTo(274.2);
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
      // The requested stack exceeds the 200px tile, so the internal gaps
      // shrink and the comparison row stays inside instead of being pushed
      // out of the bottom.
      height: 200,
    });
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    const comparisonRowHeight = graphic[2].style.fontSize * 1.2;
    expect(graphic[2].top).toBeCloseTo(178.4);
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

  // The control panel persists its light-mode color defaults into form_data.
  // ECharts graphic text is canvas, so dark theme CSS cannot restyle it: on a
  // dark tile those dark greys have to be replaced with theme text tokens.
  test('renders saved default colors with theme tokens on dark dashboards', () => {
    const result = transformProps(
      withTheme(
        buildChartProps(
          [
            {
              'SUM(sales)': 100,
              'SUM(sales)__1 month ago': 90, // +11.11%, increase color
              'SUM(sales)__1 year ago': 100, // 0%, no-change color
            },
          ],
          savedDefaultColors,
        ),
        DARK_THEME,
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[0].style.fill).toBe(DARK_THEME.colorTextSecondary);
    expect(graphic[1].style.fill).toBe(DARK_THEME.colorText);
    // Readable trend colors keep their hue in dark mode.
    expect(graphic[2].style.fill).toBe('rgb(0, 180, 42)');
    expect(graphic[3].style.fill).toBe(DARK_THEME.colorTextTertiary);
  });

  test('uses theme tokens when no colors were saved in dark mode', () => {
    const result = transformProps(
      withTheme(buildChartProps([{ 'SUM(sales)': 100 }]), DARK_THEME),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[0].style.fill).toBe(DARK_THEME.colorTextSecondary);
    expect(graphic[1].style.fill).toBe(DARK_THEME.colorText);
  });

  test('keeps saved default colors on light dashboards', () => {
    const result = transformProps(
      withTheme(
        buildChartProps(
          [{ 'SUM(sales)': 100, 'SUM(sales)__1 month ago': 90 }],
          savedDefaultColors,
        ),
        LIGHT_THEME,
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[0].style.fill).toBe('rgb(102, 102, 102)');
    expect(graphic[1].style.fill).toBe('rgb(51, 51, 51)');
    expect(graphic[2].style.fill).toBe('rgb(0, 180, 42)');
  });

  test('honors custom colors by contrast on dark dashboards', () => {
    const readable = transformProps(
      withTheme(
        buildChartProps([{ 'SUM(sales)': 100 }], {
          bigNumberColor: { r: 255, g: 220, b: 0 },
        }),
        DARK_THEME,
      ),
    );
    const readableGraphic = readable.echartOptions.graphic as Record<
      string,
      any
    >[];
    expect(readableGraphic[1].style.fill).toBe('rgb(255, 220, 0)');

    const tooDark = transformProps(
      withTheme(
        buildChartProps([{ 'SUM(sales)': 100 }], {
          bigNumberColor: { r: 30, g: 30, b: 30 },
        }),
        DARK_THEME,
      ),
    );
    const tooDarkGraphic = tooDark.echartOptions.graphic as Record<
      string,
      any
    >[];
    expect(tooDarkGraphic[1].style.fill).toBe(DARK_THEME.colorText);
  });

  test('uses the dashboard tile background token when configured', () => {
    const result = transformProps(
      withTheme(buildChartProps([{ 'SUM(sales)': 100 }], savedDefaultColors), {
        ...DARK_THEME,
        colorBgContainer: '#ffffff',
        dashboardTileBg: '#141414',
      }),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic[1].style.fill).toBe(DARK_THEME.colorText);
  });

  // --- Equal-width metric columns and comparison sizing controls ----------

  const sizingRows = [
    {
      'SUM(sales)': 100,
      'SUM(sales)__1 month ago': 90,
      'SUM(sales)__1 year ago': 80,
    },
  ];

  const buildSizedTile = (
    tileWidth: number,
    tileHeight: number,
    formData: Record<string, unknown>,
  ): Record<string, any>[] =>
    transformProps({
      ...buildChartProps(sizingRows, formData),
      width: tileWidth,
      height: tileHeight,
    }).echartOptions.graphic as Record<string, any>[];

  test('splits a two-indicator row into equal halves', () => {
    const graphic = buildSizedTile(400, 200, { bigNumberLeft: 0 });
    expect(graphic[2].left).toBe(0);
    // At the default spacing the second indicator starts at exactly 1/2 of
    // the available width, not right after the first text.
    expect(graphic[3].left).toBe(200);
    expect(comparisonRightEdge(graphic)).toBeLessThanOrEqual(400);
  });

  test('starts the second indicator at one third with three indicators', () => {
    const graphic = buildSizedTile(400, 200, {
      bigNumberLeft: 0,
      metric_rows: [
        {
          slots: [
            { label: 'A', mode: 'time_shift', offset: '1 month ago' },
            { label: 'B', mode: 'time_shift', offset: '1 year ago' },
            { label: 'C', mode: 'time_shift', offset: '1 year ago' },
          ],
        },
      ],
    });
    const lefts = graphic.slice(2).map(element => element.left);
    expect(lefts).toHaveLength(3);
    expect(lefts[0]).toBe(0);
    expect(lefts[1]).toBeCloseTo(400 / 3, 1);
    expect(lefts[2]).toBeCloseTo(800 / 3, 1);
    // Adding an indicator narrows EVERY column instead of pinning the row to
    // the center line. No overlap, nothing clipped.
    expect(lefts[1]).toBeLessThan(200);
    expect(lefts[1]).toBeGreaterThanOrEqual(
      lefts[0] + comparisonTextWidth(graphic[2]),
    );
    expect(lefts[2]).toBeGreaterThanOrEqual(
      lefts[1] + comparisonTextWidth(graphic[3]),
    );
    expect(comparisonRightEdge(graphic)).toBeLessThanOrEqual(400);
  });

  test('equal columns stay put when the first label changes length', () => {
    const base = { bigNumberLeft: 0 };
    const normal = buildSizedTile(400, 200, base);
    const longLabel = buildSizedTile(400, 200, {
      ...base,
      comparison1Label: '环比',
    });
    const shortLabel = buildSizedTile(400, 200, {
      ...base,
      comparison1Label: 'M',
    });
    expect(longLabel[2].style.text).not.toBe(normal[2].style.text);
    expect(longLabel[3].left).toBe(200);
    expect(shortLabel[3].left).toBe(200);
    expect(comparisonRightEdge(longLabel)).toBeLessThanOrEqual(400);
  });

  test('ignores the deprecated center-anchor flag, including snake_case', () => {
    const shared = { bigNumberLeft: 0, comparisonGap: 12 };
    const legacyChart = buildSizedTile(400, 200, shared);
    const camelCase = buildSizedTile(400, 200, {
      ...shared,
      comparisonUseCenterGap: true,
    });
    const snakeCase = buildSizedTile(400, 200, {
      bigNumberLeft: 0,
      comparison_use_center_gap: true,
      comparison_gap: 12,
    });
    // 200 - (24 - 12): the slider pulls the columns together by its delta.
    expect(legacyChart[3].left).toBe(188);
    expect(camelCase[3].left).toBe(legacyChart[3].left);
    expect(snakeCase[3].left).toBe(legacyChart[3].left);
    expect(comparisonRightEdge(legacyChart)).toBeLessThanOrEqual(400);
  });

  test('the spacing slider pulls the equal columns apart and together', () => {
    const build = (comparisonGap: number): Record<string, any>[] =>
      buildSizedTile(400, 200, { bigNumberLeft: 0, comparisonGap });
    const zero = build(0);
    const small = build(8);
    const large = build(40);
    // The default (24) is the exact 1/2 split; every step away from it moves
    // the columns by the same delta.
    expect(zero[3].left).toBe(176);
    expect(small[3].left).toBe(184);
    expect(large[3].left).toBe(216);
    expect(large[3].left - small[3].left).toBe(32);
    expect(comparisonRightEdge(large)).toBeLessThanOrEqual(400);
  });

  test('reverses the row without changing the equal columns', () => {
    const graphic = buildSizedTile(400, 200, {
      bigNumberLeft: 0,
      comparisonGap: 8,
      swapComparisonOrder: true,
    });
    // Columns are fixed positions; reverse decides which label sits there.
    expect(graphic[2].style.text).toContain('MoM');
    expect(graphic[2].left).toBe(184);
    expect(graphic[3].left).toBe(0);
    expect(comparisonRightEdge(graphic)).toBeLessThanOrEqual(400);
  });

  test('keeps the equal columns from overlapping on a long MoM label', () => {
    const graphic = buildSizedTile(300, 200, {
      bigNumberLeft: 0,
      comparisonGap: 8,
      comparison1Label: 'A very long MoM comparison label',
    });
    expect(
      graphic[2].left + comparisonTextWidth(graphic[2]),
    ).toBeLessThanOrEqual(graphic[3].left);
    expect(comparisonRightEdge(graphic)).toBeLessThanOrEqual(300);
  });

  test('keeps one fixed comparison size while a uniform tile is resized', () => {
    const uniform = {
      uniformBigNumberFontSize: true,
      uniformBigNumberReferenceTexts: ['$7.81'],
      bigNumberLeft: 0,
      comparisonGap: 24,
    };
    const widths = [290, 360, 440];
    const heights = [190, 220, 260];
    const tiles = widths.map((tileWidth, index) =>
      buildSizedTile(tileWidth, heights[index], uniform),
    );
    const comparisonSizes = tiles.map(graphic => graphic[2].style.fontSize);
    // Dragging a tile used to make the YoY/MoM text grow and shrink, because
    // its size was derived from the measured big-number font size.
    expect(new Set(comparisonSizes).size).toBe(1);
    expect(comparisonSizes[0]).toBe(18);
    // The tile really did change size: the big number still follows it.
    expect(
      new Set(tiles.map(graphic => graphic[1].style.fontSize)).size,
    ).toBeGreaterThan(1);
    tiles.forEach((graphic, index) => {
      expect(comparisonRightEdge(graphic)).toBeLessThanOrEqual(widths[index]);
    });
  });

  test('honours the comparison font size control when uniform sizing is off', () => {
    const comparisonSize = (fontSize: number): number =>
      buildSizedTile(600, 300, {
        bigNumberLeft: 20,
        comparisonFontSize: fontSize,
      })[2].style.fontSize;
    // Tiny (0.125) and Small (0.15) map to 15px and 18px against a fixed
    // 120px reference height, so a tall tile cannot inflate these labels.
    expect(comparisonSize(0.125)).toBe(15);
    expect(comparisonSize(0.15)).toBe(18);
  });

  test('never clips the comparison row when uniform sizing is off', () => {
    const shared = {
      bigNumberLeft: 0,
      comparisonGap: 24,
      comparison1Label: '同比',
      comparison2Label: '环比',
      comparison1PercentDifferenceFormat: ',.2%',
      comparison2PercentDifferenceFormat: ',.2%',
    };
    [160, 150].forEach(tileWidth => {
      const graphic = buildSizedTile(tileWidth, 190, shared);
      // The 10px readability floor used to stop the shrink here, leaving the
      // second slot past the canvas edge with no guard to catch it.
      expect(comparisonRightEdge(graphic)).toBeLessThanOrEqual(tileWidth);
      expect(graphic[2].style.fontSize).toBeGreaterThan(0);
    });
  });

  test('keeps an equal-split row inside the canvas on a narrow tile', () => {
    const tileWidth = 200;
    const graphic = buildSizedTile(tileWidth, 190, {
      bigNumberLeft: 0,
      comparisonGap: 8,
      comparison1Label: '同比',
      comparison2Label: '环比',
    });
    // Pulling the columns together stops as soon as the texts would touch.
    expect(graphic[3].left).toBeGreaterThan(0);
    expect(graphic[3].left).toBeLessThanOrEqual(tileWidth);
    expect(comparisonRightEdge(graphic)).toBeLessThanOrEqual(tileWidth);
    expect(
      graphic[2].left + comparisonTextWidth(graphic[2]),
    ).toBeLessThanOrEqual(graphic[3].left);
  });

  test('comparison spacing never changes the comparison font size', () => {
    const build = (gap: number): Record<string, any>[] =>
      buildSizedTile(400, 200, { bigNumberLeft: 0, comparisonGap: gap });
    const sizes = [0, 24, 120, 240].map(gap => build(gap)[2].style.fontSize);
    // The spacing control only MOVES the columns. Sizing splits the width
    // into equal columns and never reads this control.
    expect(new Set(sizes).size).toBe(1);
    expect(build(0)[3].left).toBeLessThan(build(24)[3].left);
    expect(build(24)[3].left).toBeLessThan(build(120)[3].left);
    [0, 24, 120, 240].forEach(gap => {
      const graphic = build(gap);
      // Even a slider pushed to its maximum stays inside the canvas and
      // never lets two indicators overlap.
      expect(comparisonRightEdge(graphic)).toBeLessThanOrEqual(400);
      expect(
        graphic[2].left + comparisonTextWidth(graphic[2]),
      ).toBeLessThanOrEqual(graphic[3].left);
    });
  });

  test('adding an indicator shares one smaller font size across every row', () => {
    const two = buildSizedTile(400, 200, { bigNumberLeft: 0 });
    const three = buildSizedTile(240, 200, {
      bigNumberLeft: 0,
      metric_rows: [
        {
          slots: [
            { label: 'A', mode: 'time_shift', offset: '1 month ago' },
            { label: 'B', mode: 'time_shift', offset: '1 year ago' },
            { label: 'C', mode: 'time_shift', offset: '1 year ago' },
          ],
        },
      ],
    });
    const sizes = three
      .slice(2)
      .map(element => element.style.fontSize as number);
    expect(new Set(sizes).size).toBe(1);
    expect(sizes[0]).toBeLessThan(two[2].style.fontSize);
    expect(comparisonRightEdge(three)).toBeLessThanOrEqual(240);
  });

  test('deprecated center-anchor fields never move the row', () => {
    const shared = { bigNumberLeft: 0, comparisonGap: 40 };
    const withStaleField = buildSizedTile(400, 200, {
      ...shared,
      comparisonUseCenterGap: true,
      comparisonYoyAxisGap: 8,
    });
    const withoutStaleField = buildSizedTile(400, 200, shared);
    // 200 + (40 - 24): the equal split pulled apart by the slider delta.
    expect(withStaleField[3].left).toBe(216);
    expect(withStaleField[3].left).toBe(withoutStaleField[3].left);
    expect(withStaleField[2].style.fontSize).toBe(
      withoutStaleField[2].style.fontSize,
    );
  });

  test('renders additional metric rows below the MoM/YoY pair', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            'SUM(sales)__1 month ago': 90,
            'SUM(sales)__1 year ago': 80,
            headcount: 1234,
            cost: 5678,
          },
        ],
        {
          metric_rows: [
            {
              slots: [
                { label: 'MoM', mode: 'time_shift', offset: '1 month ago' },
                { label: 'YoY', mode: 'time_shift', offset: '1 year ago' },
              ],
            },
            {
              slots: [
                { label: '在职', mode: 'metric', column: 'headcount' },
                { label: '成本', mode: 'metric', column: 'cost' },
              ],
            },
          ],
        },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // Title, big number and four slots (two rows x two slots).
    expect(graphic).toHaveLength(6);
    expect(graphic[2].style.text).toContain('MoM');
    expect(graphic[3].style.text).toContain('YoY');
    expect(graphic[4].style.text).toContain('在职');
    expect(graphic[4].style.text).toContain('1234');
    expect(graphic[5].style.text).toContain('5678');
    // Both rows split the SAME available width into two equal columns, so
    // their second indicators line up even though the labels differ. Rows
    // with different indicator counts share the widest row's grid too.
    expect(graphic[4].left).toBe(graphic[2].left);
    expect(graphic[5].left).toBe(graphic[3].left);
    expect(graphic[3].left).toBeGreaterThanOrEqual(
      graphic[2].left + comparisonTextWidth(graphic[2]),
    );
    expect(graphic[5].left).toBeGreaterThanOrEqual(
      graphic[4].left + comparisonTextWidth(graphic[4]),
    );
    // All rows still share one font size.
    expect(graphic[4].style.fontSize).toBe(graphic[2].style.fontSize);
    // The added row sits strictly below row 1, with both slots on one line.
    expect(graphic[4].top).toBeGreaterThan(graphic[2].top);
    expect(graphic[5].top).toBe(graphic[4].top);
  });

  test('flows three indicators in one row without overlapping or clipping', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            headcount: 1234,
            cost: 5678,
            margin: 42,
          },
        ],
        {
          metric_rows: [
            {
              slots: [
                { label: '在职', mode: 'metric', column: 'headcount' },
                { label: '成本', mode: 'metric', column: 'cost' },
                { label: '利润率', mode: 'metric', column: 'margin' },
              ],
            },
          ],
        },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    // Title, big number and three indicators.
    expect(graphic).toHaveLength(5);
    expect(graphic[2].style.text).toContain('1234');
    expect(graphic[3].style.text).toContain('5678');
    expect(graphic[4].style.text).toContain('42');
    // One line, strictly increasing positions, no overlap.
    expect(graphic[3].top).toBe(graphic[2].top);
    expect(graphic[4].top).toBe(graphic[2].top);
    expect(graphic[3].left).toBeGreaterThanOrEqual(
      graphic[2].left + comparisonTextWidth(graphic[2]),
    );
    expect(graphic[4].left).toBeGreaterThanOrEqual(
      graphic[3].left + comparisonTextWidth(graphic[3]),
    );
    expect(comparisonRightEdge(graphic)).toBeLessThanOrEqual(400);
    // All three indicators share the one comparison font size.
    expect(graphic[3].style.fontSize).toBe(graphic[2].style.fontSize);
    expect(graphic[4].style.fontSize).toBe(graphic[2].style.fontSize);
  });

  test('rows with different slot counts share the widest row grid', () => {
    const result = transformProps(
      buildChartProps(
        [
          {
            'SUM(sales)': 100,
            headcount: 1234,
            cost: 5678,
            margin: 42,
          },
        ],
        {
          metric_rows: [
            {
              slots: [
                { label: '在职', mode: 'metric', column: 'headcount' },
                { label: '成本', mode: 'metric', column: 'cost' },
                { label: '利润率', mode: 'metric', column: 'margin' },
              ],
            },
            {
              slots: [{ label: '单独', mode: 'metric', column: 'margin' }],
            },
          ],
        },
      ),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic).toHaveLength(6);
    // The first row still owns three 1/3 columns of the shared grid.
    expect(graphic[3].left).toBeCloseTo(20 + 380 / 3, 1);
    expect(graphic[4].left).toBeCloseTo(20 + (2 * 380) / 3, 1);
    // The single-indicator row starts at the left edge instead of being
    // pushed to the third column of the row above it.
    expect(graphic[5].left).toBe(graphic[2].left);
    expect(graphic[5].top).toBeGreaterThan(graphic[2].top);
    expect(comparisonRightEdge(graphic)).toBeLessThanOrEqual(400);
  });

  const mixedRows = [
    {
      slots: [
        { label: 'A', mode: 'time_shift', offset: '1 month ago' },
        { label: 'B', mode: 'time_shift', offset: '1 year ago' },
        { label: 'C', mode: 'time_shift', offset: '1 year ago' },
      ],
    },
    {
      slots: [
        { label: 'D', mode: 'time_shift', offset: '1 month ago' },
        { label: 'E', mode: 'time_shift', offset: '1 year ago' },
      ],
    },
  ];

  test('a two-indicator row lines up with the three-column grid', () => {
    const graphic = buildSizedTile(400, 260, {
      bigNumberLeft: 0,
      metric_rows: mixedRows,
    });
    // Title, big number, three indicators on row 1, two on row 2.
    expect(graphic).toHaveLength(7);
    // Row 2 uses the SAME first two 1/3 columns as row 1 instead of its
    // own wider 1/2 columns.
    expect(graphic[5].left).toBe(graphic[2].left);
    expect(graphic[6].left).toBe(graphic[3].left);
    expect(graphic[3].left).toBeCloseTo(400 / 3, 1);
    expect(graphic[4].left).toBeCloseTo(800 / 3, 1);
    expect(graphic[6].left).toBeLessThan(200);
    // The whole chart still renders at ONE comparison font size.
    expect(graphic[5].style.fontSize).toBe(graphic[2].style.fontSize);
    expect(comparisonRightEdge(graphic)).toBeLessThanOrEqual(400);
  });

  test('the spacing slider moves every row by the same amount', () => {
    const build = (comparisonGap: number) =>
      buildSizedTile(400, 260, {
        bigNumberLeft: 0,
        comparisonGap,
        metric_rows: mixedRows,
      });
    const tight = build(0);
    const normal = build(24);
    const loose = build(40);
    [tight, normal, loose].forEach(graphic => {
      expect(graphic[6].left).toBe(graphic[3].left);
      expect(comparisonRightEdge(graphic)).toBeLessThanOrEqual(400);
    });
    expect(tight[3].left).toBeLessThan(normal[3].left);
    expect(normal[3].left).toBeLessThan(loose[3].left);
  });

  test('a hidden slot in a three-indicator row does not reserve a column', () => {
    const result = transformProps(
      buildChartProps([{ 'SUM(sales)': 100, cost: 5678, margin: 42 }], {
        metric_rows: [
          {
            slots: [
              { show: false, mode: 'metric', column: 'headcount' },
              { label: '成本', mode: 'metric', column: 'cost' },
              { label: '利润率', mode: 'metric', column: 'margin' },
            ],
          },
        ],
      }),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic).toHaveLength(4);
    // The first visible indicator sits at the left edge, not in column 2.
    expect(graphic[2].left).toBe(20);
    expect(graphic[2].style.text).toContain('5678');
    expect(graphic[3].left).toBeGreaterThanOrEqual(
      graphic[2].left + comparisonTextWidth(graphic[2]),
    );
    expect(comparisonRightEdge(graphic)).toBeLessThanOrEqual(400);
  });

  test('an explicitly empty metric_rows list hides all comparison rows', () => {
    const result = transformProps(
      buildChartProps([{ 'SUM(sales)': 100 }], { metric_rows: [] }),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic).toHaveLength(2);
    expect(graphic[1].style.text).toBe('$100');
  });

  test('legacy charts with no comparison data keep both placeholders', () => {
    const result = transformProps(buildChartProps([{ 'SUM(sales)': 100 }]));
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic).toHaveLength(4);
    expect(graphic[2].style.text).toBe('MoM —');
    expect(graphic[3].style.text).toBe('YoY —');
    expect(graphic[3].top).toBe(graphic[2].top);
  });

  test('a disabled slot does not reserve its own text', () => {
    const result = transformProps(
      buildChartProps([{ 'SUM(sales)': 100, headcount: 42 }], {
        metric_rows: [
          {
            slots: [
              { show: false, mode: 'metric', column: 'headcount' },
              { label: '在职', mode: 'metric', column: 'headcount' },
            ],
          },
        ],
      }),
    );
    const graphic = result.echartOptions.graphic as Record<string, any>[];
    expect(graphic).toHaveLength(3);
    expect(graphic[2].style.text).toContain('42');
  });
});
