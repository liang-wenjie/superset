# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""Resolve a dashboard's chart holders (instances) for Excel exports.

A single slice can be placed several times on one dashboard. Every placement
(a ``CHART`` node in ``position_json``) is a distinct instance with its own
native-filter scope and per-holder targets, so an export must emit one copy per
holder and apply that holder's filters. At the same time, single-holder
dashboards must stay byte-for-byte identical to the legacy de-duplicated
export (same sheet names, cache keys and screenshot digests).
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from typing import Any, TYPE_CHECKING

from superset.dashboards.excel_export.layout import walk_chart_holders
from superset.utils import json

if TYPE_CHECKING:
    from superset.models.dashboard import Dashboard


def _position_dict(dashboard: Any) -> dict[str, Any]:
    """Return the parsed layout, tolerating ORM objects, mocks and bad JSON.

    The ORM exposes ``position`` (already parsed) and ``position_json`` (the
    raw text column); test doubles may set either shape. Non-dict parsed values
    are ignored so a malformed payload cannot break the export.
    """
    position = getattr(dashboard, "position", None)
    if isinstance(position, dict):
        return position
    raw = getattr(dashboard, "position_json", None)
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


def get_chart_instances(dashboard: Dashboard) -> list[tuple[Any, str | None]]:
    """Return one ``(slice, instance_id)`` per chart holder, in layout order.

    Walks every ``CHART`` node in the dashboard layout depth-first, in visual
    order, preserving duplicates, and keeps only holders whose ``meta.chartId``
    matches a slice on the dashboard. Slices that belong to the dashboard but
    appear in no holder are appended at the end ordered by id -- exactly as the
    legacy layout ordering did -- so no chart is silently dropped.

    ``instance_id`` is the ``CHART`` node id from ``position_json`` (the value
    the dashboard filter context uses to resolve ``scope.excludedInstances`` and
    ``targets[].instanceIds``). Compatibility: when a chart has exactly one
    holder, its ``instance_id`` is ``None``. That keeps single-holder dashboards
    identical to the previous export, including sheet names, cache keys and
    screenshot digests. Only duplicated holders carry a node id.

    :param dashboard: The dashboard whose chart holders to resolve
    :returns: ``(slice, instance_id)`` pairs in export order
    """
    slices_by_id: dict[Any, Any] = {slc.id: slc for slc in dashboard.slices}
    position = _position_dict(dashboard)

    # (chart_id, node_id) for every holder that maps to a dashboard slice.
    holders: list[tuple[Any, str]] = [
        (chart_id, node_id)
        for node_id, chart_id in walk_chart_holders(position)
        if chart_id in slices_by_id
    ]

    # Match the legacy walk's orphan handling so old dashboards export the same
    # charts in the same order. An orphan has no holder id at all.
    used = {chart_id for chart_id, _ in holders}
    for chart_id in sorted(set(slices_by_id) - used):
        holders.append((chart_id, ""))

    counts = Counter(chart_id for chart_id, _ in holders)
    return [
        (slices_by_id[chart_id], node_id if counts[chart_id] > 1 else None)
        for chart_id, node_id in holders
    ]


def instance_sheet_suffixes(
    instances: Sequence[tuple[Any, str | None]],
) -> list[str | None]:
    """Return a ``#N`` suffix per instance, aligned with ``instances``.

    Within each chart id, duplicated holders are numbered in appearance order
    (``#1``, ``#2``, ...). A chart with a single holder gets ``None`` so its
    sheet/image name stays exactly as before. The marker is short enough to
    survive the workbook's 31-character sheet-name cap; the workbook reserves
    room for it when composing the final name.

    :param instances: ``(slice, instance_id)`` pairs from ``get_chart_instances``
    :returns: A suffix (or ``None``) for each input entry, in the same order
    """
    counts = Counter(chart.id for chart, _ in instances)
    seen: dict[Any, int] = {}
    suffixes: list[str | None] = []
    for chart, _ in instances:
        if counts[chart.id] < 2:
            suffixes.append(None)
            continue
        number = seen.get(chart.id, 0) + 1
        seen[chart.id] = number
        suffixes.append(f"#{number}")
    return suffixes
