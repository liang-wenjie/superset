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
"""Tests for resolving dashboard chart holders (instances) for Excel exports."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

from superset.dashboards.excel_export.instances import (
    get_chart_instances,
    instance_sheet_suffixes,
)
from superset.utils import json


def _chart_node(node_id: str, chart_id: int) -> dict[str, Any]:
    return {"id": node_id, "type": "CHART", "meta": {"chartId": chart_id}}


def _grid_with_rows(*rows: tuple[str, int]) -> dict[str, Any]:
    """A ROOT -> GRID layout with one chart row per holder, in order."""
    position: dict[str, Any] = {
        "ROOT_ID": {"type": "ROOT", "children": ["GRID_ID"]},
        "GRID_ID": {
            "type": "GRID",
            "children": [f"ROW-{i}" for i in range(len(rows))],
        },
    }
    for index, (node_id, chart_id) in enumerate(rows):
        position[f"ROW-{index}"] = {
            "type": "ROW",
            "children": [node_id],
        }
        position[node_id] = _chart_node(node_id, chart_id)
    return position


def _dashboard(
    position: dict[str, Any], chart_ids: list[int], *, raw_json: bool = False
) -> MagicMock:
    """Build a dashboard double; ``raw_json`` mimics the ORM text column."""
    dashboard = MagicMock()
    dashboard.slices = [MagicMock(id=cid) for cid in chart_ids]
    if raw_json:
        # ``position`` is not a dict, so the resolver falls back to parsing the
        # raw ``position_json`` string, as it does for a real ORM Dashboard.
        dashboard.position = None
        dashboard.position_json = json.dumps(position)
    else:
        dashboard.position = position
    return dashboard


def _slice_ids(instances: list[tuple[Any, str | None]]) -> list[int]:
    return [slc.id for slc, _ in instances]


def _instance_ids(instances: list[tuple[Any, str | None]]) -> list[str | None]:
    return [instance_id for _, instance_id in instances]


def test_single_holder_has_one_instance_with_none_id() -> None:
    """No duplicate holder -> one copy, and ``instance_id`` is ``None``.

    This is the compatibility guarantee: old dashboards must keep identical
    sheet names, cache keys and screenshot digests.
    """
    position = _grid_with_rows(("CHART-a", 5))
    dashboard = _dashboard(position, [5])

    instances = get_chart_instances(dashboard)

    assert _slice_ids(instances) == [5]
    assert _instance_ids(instances) == [None]
    assert instance_sheet_suffixes(instances) == [None]


def test_three_holders_of_one_chart_produce_three_instances() -> None:
    """The same slice in three holders -> three copies, each with its node id."""
    position = _grid_with_rows(("CHART-a", 5), ("CHART-b", 5), ("CHART-c", 5))
    dashboard = _dashboard(position, [5])

    instances = get_chart_instances(dashboard)

    assert _slice_ids(instances) == [5, 5, 5]
    assert _instance_ids(instances) == ["CHART-a", "CHART-b", "CHART-c"]
    assert instance_sheet_suffixes(instances) == ["#1", "#2", "#3"]


def test_only_duplicated_holders_get_suffixes() -> None:
    """A chart with one holder keeps ``None`` even when others are duplicated."""
    position = _grid_with_rows(("CHART-a", 5), ("CHART-b", 5), ("CHART-c", 6))
    dashboard = _dashboard(position, [5, 6])

    instances = get_chart_instances(dashboard)

    assert _slice_ids(instances) == [5, 5, 6]
    assert _instance_ids(instances) == ["CHART-a", "CHART-b", None]
    assert instance_sheet_suffixes(instances) == ["#1", "#2", None]


def test_non_dict_values_and_malformed_meta_do_not_crash() -> None:
    """Version strings, missing meta, non-dict meta and bad chartIds are ignored."""
    position: dict[str, Any] = {
        "ROOT_ID": {
            "type": "ROOT",
            "children": ["ROW-1", "DASHBOARD_VERSION_KEY"],
        },
        "DASHBOARD_VERSION_KEY": "v2",  # non-dict layout value
        "ROW-1": {
            "type": "ROW",
            "children": [
                "CHART-a",
                "NO_META",
                "BAD_META",
                "BAD_CHART_ID",
                "NULL_META",
            ],
        },
        "CHART-a": _chart_node("CHART-a", 5),
        "NO_META": {"id": "NO_META", "type": "CHART"},
        "BAD_META": {"id": "BAD_META", "type": "CHART", "meta": "nope"},
        "BAD_CHART_ID": {
            "id": "BAD_CHART_ID",
            "type": "CHART",
            "meta": {"chartId": "5"},
        },
        "NULL_META": {"id": "NULL_META", "type": "CHART", "meta": None},
    }
    dashboard = _dashboard(position, [5])

    instances = get_chart_instances(dashboard)

    assert _slice_ids(instances) == [5]
    assert _instance_ids(instances) == [None]


def test_holder_not_matching_a_slice_is_skipped() -> None:
    """A stale CHART node whose chartId is not on the dashboard is dropped."""
    position = _grid_with_rows(("CHART-a", 5), ("CHART-gone", 999))
    dashboard = _dashboard(position, [5])

    instances = get_chart_instances(dashboard)

    assert _slice_ids(instances) == [5]
    assert _instance_ids(instances) == [None]


def test_orphed_slices_are_appended_by_id() -> None:
    """Slices absent from the layout are still exported, ordered by id."""
    position = _grid_with_rows(("CHART-a", 5))
    dashboard = _dashboard(position, [5, 9, 3])

    instances = get_chart_instances(dashboard)

    assert _slice_ids(instances) == [5, 3, 9]
    assert _instance_ids(instances) == [None, None, None]


def test_empty_position_returns_all_slices_sorted() -> None:
    """No ROOT_ID: every slice becomes an orphan, sorted by id."""
    dashboard = _dashboard({}, [3, 1, 2])

    instances = get_chart_instances(dashboard)

    assert _slice_ids(instances) == [1, 2, 3]
    assert _instance_ids(instances) == [None, None, None]


def test_raw_position_json_string_is_parsed() -> None:
    """The ORM shape (text column) resolves the same instances as a dict."""
    position = _grid_with_rows(("CHART-a", 5), ("CHART-b", 5), ("CHART-c", 5))
    dashboard = _dashboard(position, [5], raw_json=True)

    instances = get_chart_instances(dashboard)

    assert _slice_ids(instances) == [5, 5, 5]
    assert _instance_ids(instances) == ["CHART-a", "CHART-b", "CHART-c"]


def test_unparseable_position_json_is_tolerated() -> None:
    """Malformed JSON falls back to orphan-only ordering instead of raising."""
    dashboard = MagicMock()
    dashboard.position = None
    dashboard.position_json = "{not json"
    dashboard.slices = [MagicMock(id=2), MagicMock(id=1)]

    instances = get_chart_instances(dashboard)

    assert _slice_ids(instances) == [1, 2]
    assert _instance_ids(instances) == [None, None]
