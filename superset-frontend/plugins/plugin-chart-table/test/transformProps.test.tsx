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
import { ChartProps } from '@superset-ui/core';
import { supersetTheme } from '@apache-superset/core/theme';
import { render, screen } from '@superset-ui/core/spec';
import { withChartDisplayLabels } from 'src/dashboard/util/withChartDisplayLabels';
import TableChart from '../src/TableChart';
import transformProps from '../src/transformProps';
import testData from './testData';

test('renders authorized chart display labels in table headers without changing data keys', () => {
  const datasource = withChartDisplayLabels(
    {
      chart_display_labels: {
        '12': { name: 'Person', sum__num: 'Population' },
        '13': { 'abc.com': 'Other chart column' },
      },
    },
    12,
  );
  const chartProps = new ChartProps({ datasource, theme: supersetTheme });
  const transformed = transformProps({
    ...testData.basic,
    datasource: chartProps.datasource,
  });

  render(<TableChart {...transformed} sticky={false} />);

  expect(
    screen.getByRole('columnheader', { name: /^Person/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('columnheader', { name: /^Population/ }),
  ).toBeInTheDocument();
  expect(screen.queryByText('Other chart column')).not.toBeInTheDocument();
  expect(transformed.columns.map(column => column.key)).toEqual(
    testData.basic.queriesData[0].colnames,
  );
  expect(transformed.data[0]).toEqual(
    expect.objectContaining({ name: 'Michael', sum__num: 2467063 }),
  );
});

test('maps header & border styling controls to CSS variables on the table container', () => {
  const transformed = transformProps({
    ...testData.basic,
    rawFormData: {
      ...testData.basic.rawFormData,
      header_text_bold: false,
      header_text_color: '#ff0000',
      header_font_size: '18',
      // Charts saved before the hex output was configured store an rgba object.
      border_color: { r: 0, g: 0, b: 255, a: 1 },
      border_width: '3',
      header_border_width: '4',
    },
  });

  expect(transformed.tableStyle).toEqual({
    headerFontWeight: 'normal',
    headerTextColor: '#ff0000',
    headerFontSize: 18,
    borderColor: 'rgb(0, 0, 255)',
    borderWidth: 3,
    headerBorderWidth: 4,
  });

  const { container } = render(<TableChart {...transformed} sticky={false} />);
  const wrapper = container.firstElementChild as HTMLElement;
  expect(wrapper.style.getPropertyValue('--table-header-text-color')).toBe(
    '#ff0000',
  );
  expect(wrapper.style.getPropertyValue('--table-header-font-weight')).toBe(
    'normal',
  );
  expect(wrapper.style.getPropertyValue('--table-header-font-size')).toBe(
    '18px',
  );
  expect(wrapper.style.getPropertyValue('--table-border-color')).toBe(
    'rgb(0, 0, 255)',
  );
  expect(wrapper.style.getPropertyValue('--table-border-width')).toBe('3px');
  expect(wrapper.style.getPropertyValue('--table-header-border-width')).toBe(
    '4px',
  );
  // Default (original) behavior: the body emphasis line follows the header
  // width too, so no body-specific variable is emitted.
  expect(
    wrapper.style.getPropertyValue('--table-body-emphasis-line-width'),
  ).toBe('');
});

test('keeps thick vertical lines in the header only', () => {
  const transformed = transformProps({
    ...testData.basic,
    rawFormData: {
      ...testData.basic.rawFormData,
      header_vertical_line_only: true,
      header_border_width: '4',
      border_width: '1',
    },
  });

  expect(transformed.tableStyle).toEqual({
    headerVerticalLineOnly: true,
    headerBorderWidth: 4,
    borderWidth: 1,
  });

  const { container } = render(<TableChart {...transformed} sticky={false} />);
  const wrapper = container.firstElementChild as HTMLElement;
  // The header keeps the thick line and the underline is still rendered.
  expect(wrapper.style.getPropertyValue('--table-header-border-width')).toBe(
    '4px',
  );
  const inlineStyle = wrapper.getAttribute('style') ?? '';
  expect(inlineStyle).toContain('--table-body-emphasis-line-width');
  expect(inlineStyle).toContain('var(--table-border-width, 2px)');
});

test('charts without styling controls keep the theme defaults', () => {
  const transformed = transformProps(testData.basic);
  expect(transformed.tableStyle).toEqual({});

  const { container } = render(<TableChart {...transformed} sticky={false} />);
  const wrapper = container.firstElementChild as HTMLElement;
  expect(wrapper.getAttribute('style') ?? '').not.toContain(
    '--table-border-color',
  );
  // No show/hide toggle: the underline falls back to the theme's 2px line.
  expect(wrapper.style.getPropertyValue('--table-header-border-width')).toBe(
    '',
  );
});

test('maps visual formatting toggles to transformed props', () => {
  const transformed = transformProps({
    ...testData.basic,
    rawFormData: {
      ...testData.basic.rawFormData,
      show_outer_border: true,
      show_null_as_blank: true,
    },
  });

  expect(transformed.showOuterBorder).toBe(true);
  expect(transformed.showNullAsBlank).toBe(true);
});

test('visual formatting toggles are off for charts saved without them', () => {
  const transformed = transformProps(testData.basic);

  expect(transformed.showOuterBorder).toBe(false);
  expect(transformed.showNullAsBlank).toBe(false);
});

test('outer border emits its CSS variables only when enabled', () => {
  const enabled = transformProps({
    ...testData.basic,
    rawFormData: {
      ...testData.basic.rawFormData,
      show_outer_border: true,
    },
  });
  const enabledRender = render(<TableChart {...enabled} sticky={false} />);
  const enabledWrapper = enabledRender.container
    .firstElementChild as HTMLElement;
  expect(
    enabledWrapper.style.getPropertyValue('--table-outer-border-width'),
  ).toBe('var(--table-header-border-width, 2px)');
  expect(
    enabledWrapper.style.getPropertyValue('--table-outer-border-color'),
  ).toContain('var(--table-border-color');
  enabledRender.unmount();

  const { container } = render(
    <TableChart {...transformProps(testData.basic)} sticky={false} />,
  );
  const wrapper = container.firstElementChild as HTMLElement;
  expect(wrapper.getAttribute('style') ?? '').not.toContain(
    '--table-outer-border-width',
  );
  expect(wrapper.getAttribute('style') ?? '').not.toContain(
    '--table-outer-border-color',
  );
});

test('outer border frame follows header width and the shared line color', () => {
  const transformed = transformProps({
    ...testData.basic,
    rawFormData: {
      ...testData.basic.rawFormData,
      show_outer_border: true,
      header_border_width: '4',
      border_color: '#36a9c9',
    },
  });

  const { container } = render(<TableChart {...transformed} sticky={false} />);
  const wrapper = container.firstElementChild as HTMLElement;
  expect(wrapper.style.getPropertyValue('--table-header-border-width')).toBe(
    '4px',
  );
  expect(wrapper.style.getPropertyValue('--table-border-color')).toBe(
    '#36a9c9',
  );
  // The frame resolves both variables at paint time, so it always has the
  // header width and exactly the same color as the header/grid lines.
  expect(wrapper.style.getPropertyValue('--table-outer-border-width')).toBe(
    'var(--table-header-border-width, 2px)',
  );
  expect(
    wrapper.style.getPropertyValue('--table-outer-border-color'),
  ).toContain('var(--table-border-color');
});

test('renders null values as blank when the option is enabled', () => {
  const transformed = transformProps({
    ...testData.basic,
    rawFormData: {
      ...testData.basic.rawFormData,
      show_null_as_blank: true,
    },
  });

  render(<TableChart {...transformed} sticky={false} />);
  const firstDataRow = screen.getAllByRole('rowgroup')[1];
  const cells = firstDataRow.querySelectorAll('td');
  expect(cells[8].textContent).toBe('');
  // The cell keeps its null marker so conditional styling still applies.
  expect(cells[8].classList.contains('dt-is-null')).toBe(true);
  expect(screen.queryByText('N/A')).not.toBeInTheDocument();
});
