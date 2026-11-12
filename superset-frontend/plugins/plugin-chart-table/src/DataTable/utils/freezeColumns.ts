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
import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';

export const FROZEN_CELL_CLASS = 'dt-frozen-cell';
export const FROZEN_EDGE_CLASS = 'dt-frozen-edge';
/**
 * Only tables that actually freeze columns switch to separate borders. With
 * `border-collapse: collapse` the browser paints one border layer for the
 * whole table, so an elevated sticky cell covers the header rules and its own
 * border does not travel with it. Keeping every other chart on collapsed
 * borders means this fix has no effect when freezing is off.
 */
export const HAS_FROZEN_COLUMNS_CLASS = 'dt-has-frozen-columns';

/**
 * A frozen cell has to paint above the columns scrolling past it. The wrapper's
 * frame overlay and the header's `position: relative` cells already sit at
 * z-index 1, so pinning at that level lets scrolled columns cover the frozen
 * block (especially noticeable with `border-collapse: collapse`, where the
 * browser paints a second background/border pass for neighbouring cells).
 * Header and footer cells go one level above body cells so a multi-row grouped
 * header never slips underneath a frozen data cell.
 */
export const FROZEN_BODY_Z_INDEX = 5;
export const FROZEN_HEADER_Z_INDEX = 6;

type ElementProps = {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  colSpan?: number;
};

/** `offsets[i]` is the left edge of column i, measured from the table start. */
export function getColumnOffsets(widths: number[]): number[] {
  const offsets = [0];
  widths.forEach((width, index) => {
    offsets.push(offsets[index] + (Number.isFinite(width) ? width : 0));
  });
  return offsets;
}

/** Multi-level header rows are returned inside a Fragment by TableChart. */
function flattenRows(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap(child => {
    if (isValidElement(child) && child.type === Fragment) {
      return flattenRows((child.props as ElementProps).children);
    }
    return [child];
  });
}

/**
 * Clone a thead/tbody/tfoot and pin the leftmost `freezeColumns` logical
 * columns. Cells are located by logical column index so `colSpan` is honoured:
 * a grouped header crossing the freeze boundary is left unpinned instead of
 * covering columns that are supposed to scroll away.
 *
 * The sizer table used for measurement must keep the unmodified sections.
 */
export function freezeTableSection<T extends ReactElement<ElementProps>>(
  section: T,
  offsets: number[],
  freezeColumns: number,
): T {
  if (freezeColumns <= 0) {
    return section;
  }
  const zIndex =
    section.type === 'thead' || section.type === 'tfoot'
      ? FROZEN_HEADER_Z_INDEX
      : FROZEN_BODY_Z_INDEX;
  const rows = flattenRows(section.props.children).map(row => {
    if (!isValidElement(row)) {
      return row;
    }
    let columnIndex = 0;
    const cells = Children.toArray((row.props as ElementProps).children).map(
      cell => {
        if (!isValidElement(cell)) {
          return cell;
        }
        const cellProps = cell.props as ElementProps;
        const span = Math.max(1, Number(cellProps.colSpan) || 1);
        const start = columnIndex;
        columnIndex += span;
        if (columnIndex > freezeColumns) {
          return cell;
        }
        const classNames = [
          cellProps.className,
          FROZEN_CELL_CLASS,
          columnIndex === freezeColumns ? FROZEN_EDGE_CLASS : '',
        ]
          .filter(Boolean)
          .join(' ');
        return cloneElement(cell as ReactElement<ElementProps>, {
          className: classNames,
          style: {
            ...cellProps.style,
            position: 'sticky',
            left: offsets[start] ?? 0,
            zIndex,
          },
        });
      },
    );
    return cloneElement(row as ReactElement<ElementProps>, {}, cells);
  });
  return cloneElement(section, {}, rows) as T;
}
