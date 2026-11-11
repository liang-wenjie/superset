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
"""Tests for passing already-resolved query contexts into the workbook builder.

The builder's own behavior (sheet naming, skipped charts, filter application) is
covered through the Celery task in
``tests/unit_tests/tasks/test_export_dashboard_excel.py``.
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from typing import Any
from unittest import mock

import pytest

from superset.dashboards.excel_export import email
from superset.dashboards.excel_export.workbook import build_workbook
from superset.utils import json

MODULE = "superset.dashboards.excel_export.workbook"


def _chart(chart_id: int, name: str) -> mock.MagicMock:
    chart = mock.MagicMock()
    chart.id = chart_id
    chart.slice_name = name
    chart.viz_type = "table"
    chart.query_context = json.dumps({"queries": [{"row_limit": 100}]})
    return chart


@pytest.fixture
def mocks() -> Iterator[dict[str, Any]]:
    """Patch the builder's collaborators; keep the real xlsx writer."""
    with mock.patch.multiple(
        MODULE,
        get_chart_instances=mock.DEFAULT,
        get_dashboard_filter_context=mock.DEFAULT,
        ChartDataQueryContextSchema=mock.DEFAULT,
        ChartDataCommand=mock.DEFAULT,
        resolve_query_context=mock.DEFAULT,
    ) as patched:
        patched["get_dashboard_filter_context"].return_value.extra_form_data = {}
        patched["ChartDataCommand"].return_value.run.return_value = {
            "queries": [{"colnames": ["a"], "data": [{"a": 1}]}]
        }
        yield patched


@pytest.fixture
def workbook_path() -> Iterator[str]:
    file_descriptor, path = tempfile.mkstemp(suffix=".xlsx")
    os.close(file_descriptor)
    yield path
    if os.path.exists(path):
        os.remove(path)


def _build(path: str, **kwargs: Any) -> Any:
    dashboard = mock.MagicMock()
    dashboard.id = 1
    return build_workbook(
        path, dashboard, {}, "job-1", "data", mock.MagicMock(), **kwargs
    )


def test_provided_query_context_is_used_without_resolving_again(
    mocks: dict[str, Any], workbook_path: str
) -> None:
    """Use the context measured by the row budget."""
    chart = _chart(10, "First")
    mocks["get_chart_instances"].return_value = [(chart, None)]
    provided = {"queries": [{"row_limit": 7, "metrics": ["count"]}]}

    _build(workbook_path, query_contexts={10: provided})

    mocks["resolve_query_context"].assert_not_called()
    loaded = mocks["ChartDataQueryContextSchema"].return_value.load.call_args.args[0]
    assert loaded["queries"] == provided["queries"]


def test_a_chart_resolved_to_none_is_skipped_without_resolving_again(
    mocks: dict[str, Any], workbook_path: str
) -> None:
    """``None`` marks a chart already resolved as unexportable."""
    chart = _chart(20, "Skipped")
    mocks["get_chart_instances"].return_value = [(chart, None)]

    errored = _build(workbook_path, query_contexts={20: None})

    mocks["resolve_query_context"].assert_not_called()
    mocks["ChartDataCommand"].return_value.run.assert_not_called()
    assert [label for labels in errored.values() for label in labels] == [
        "20 - Skipped"
    ]


def test_skipped_charts_are_listed_by_reason_without_running(
    mocks: dict[str, Any], workbook_path: str
) -> None:
    """A chart the plan left out is reported under its reason and never queried, even
    though its context resolves; the other chart still exports."""
    exported = _chart(10, "Sales")
    pivot = _chart(20, "Pivot")
    mocks["get_chart_instances"].return_value = [
        (exported, None),
        (pivot, None),
    ]

    errored = _build(
        workbook_path,
        query_contexts={10: {"queries": [{"row_limit": 5}]}},
        skipped_charts={20: email.ERROR_UNBOUNDED},
    )

    assert errored == {email.ERROR_UNBOUNDED: ["20 - Pivot"]}
    mocks["resolve_query_context"].assert_not_called()
    mocks["ChartDataCommand"].return_value.run.assert_called_once()


def test_a_chart_missing_from_the_map_is_resolved_by_the_builder(
    mocks: dict[str, Any], workbook_path: str
) -> None:
    """Resolve charts missing from a partial context map."""
    chart = _chart(30, "Unmapped")
    mocks["get_chart_instances"].return_value = [(chart, None)]
    mocks["resolve_query_context"].return_value = {"queries": [{"row_limit": 5}]}

    _build(workbook_path, query_contexts={})

    mocks["resolve_query_context"].assert_called_once_with(chart)


def _run_build(
    path: str,
    chart: Any,
    instances: list[tuple[Any, str | None]],
) -> tuple[Any, dict[str, Any]]:
    """Run ``build_workbook`` with collaborators patched; return writer + mocks."""
    with mock.patch.multiple(
        MODULE,
        get_chart_instances=mock.DEFAULT,
        get_dashboard_filter_context=mock.DEFAULT,
        ChartDataQueryContextSchema=mock.DEFAULT,
        ChartDataCommand=mock.DEFAULT,
        resolve_query_context=mock.DEFAULT,
        StreamingXlsxWriter=mock.DEFAULT,
    ) as patched:
        patched["get_chart_instances"].return_value = instances
        patched["get_dashboard_filter_context"].return_value.extra_form_data = {}
        patched["ChartDataCommand"].return_value.run.return_value = {
            "queries": [{"colnames": ["a"], "data": [{"a": 1}]}]
        }
        writer = patched["StreamingXlsxWriter"].return_value
        writer.sheet_count = len(instances)
        build_workbook(
            path,
            mock.MagicMock(),
            {},
            "job-1",
            "data",
            mock.MagicMock(),
            query_contexts={chart.id: {"queries": [{"row_limit": 5}]}},
        )
    return writer, patched


def test_duplicate_holders_export_one_sheet_each_with_own_filters(
    workbook_path: str,
) -> None:
    """Three holders of one slice produce three sheets and three filter contexts."""
    chart = _chart(10, "Sales")
    writer, patched = _run_build(
        workbook_path,
        chart,
        [(chart, "CHART-a"), (chart, "CHART-b"), (chart, "CHART-c")],
    )

    names = [call.args[0] for call in writer.add_sheet.call_args_list]
    assert names == ["10 - Sales #1", "10 - Sales #2", "10 - Sales #3"]
    patched["resolve_query_context"].assert_not_called()
    ctx_calls = patched["get_dashboard_filter_context"].call_args_list
    assert [call.kwargs["instance_id"] for call in ctx_calls] == [
        "CHART-a",
        "CHART-b",
        "CHART-c",
    ]


def test_single_holder_keeps_legacy_sheet_name(workbook_path: str) -> None:
    """A single holder exports one sheet with the exact legacy name."""
    chart = _chart(10, "Sales")
    writer, patched = _run_build(workbook_path, chart, [(chart, None)])

    names = [call.args[0] for call in writer.add_sheet.call_args_list]
    assert names == ["10 - Sales"]
    assert (
        patched["get_dashboard_filter_context"].call_args.kwargs["instance_id"] is None
    )


def test_long_duplicate_names_keep_instance_marker_within_limit(
    workbook_path: str,
) -> None:
    """The #N marker survives the 31-character Excel sheet-name cap."""
    chart = _chart(10, "A" * 40)
    writer, _ = _run_build(
        workbook_path, chart, [(chart, "CHART-a"), (chart, "CHART-b")]
    )

    names = [call.args[0] for call in writer.add_sheet.call_args_list]
    assert all(len(name) <= 31 for name in names)
    assert names[0].endswith(" #1")
    assert names[1].endswith(" #2")
    assert names[0] != names[1]
