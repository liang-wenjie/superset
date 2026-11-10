# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
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
"""Column-values cache keys must combine chart filters and impersonation.

Chart inline filters narrow the distinct values by the chart's own WHERE
filters, while an embedded or per-user connection makes the caller's identity
part of the result. Both belong in the same key: otherwise a viewer could be
handed values computed for a different identity or a different selection.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

from superset.connectors.sqla.models import SqlaTable
from superset.datasource.api import get_cached_column_values


def _datasource() -> MagicMock:
    datasource = MagicMock(spec=SqlaTable)
    datasource.uid = "1__table"
    datasource.cache_timeout = 300
    datasource.database = MagicMock()
    datasource.get_rendered_rls_cache_key.return_value = ""
    datasource.get_inner_rls_cache_key.return_value = ""
    datasource.values_for_column.return_value = ["x"]
    return datasource


def _fetch(datasource: MagicMock, chart_filters: dict[str, Any]) -> None:
    get_cached_column_values(
        datasource,
        column_name="col2",
        limit=10000,
        denormalize_column=False,
        chart_filters=chart_filters,
    )


def test_chart_filters_and_impersonation_share_one_cache_key() -> None:
    datasource = _datasource()
    chart_filters = {
        "adhoc_filters": [
            {
                "clause": "WHERE",
                "expressionType": "SIMPLE",
                "subject": "col1",
                "operator": "==",
                "comparator": 1,
            }
        ],
        "filters": [],
    }
    other_filters = {
        "adhoc_filters": [{**chart_filters["adhoc_filters"][0], "comparator": 2}],
        "filters": [],
    }

    with (
        patch("superset.datasource.api.app") as app_mock,
        patch("superset.datasource.api.security_manager") as security_mock,
        patch("superset.datasource.api.cache_manager") as cache_mock,
        patch(
            "superset.datasource.api.add_impersonation_cache_key_if_needed"
        ) as impersonation_mock,
    ):
        app_mock.config = {
            "CACHE_DEFAULT_TIMEOUT": 300,
            "FILTER_VALUES_CACHE_WARN_THRESHOLD": 100_000,
        }
        # ``patch`` preserves the coroutine signature of the real method, but
        # the cache key needs a plain synchronous RLS value.
        security_mock.get_rls_cache_key = MagicMock(return_value=[])
        cache_mock.data_cache.get.return_value = None
        impersonation_mock.side_effect = lambda _database, material: material.update(
            impersonation="user_a"
        )

        _fetch(datasource, chart_filters)
        _fetch(datasource, chart_filters)
        _fetch(datasource, other_filters)

        keys = [call.args[0] for call in cache_mock.data_cache.set.call_args_list]
        assert len(keys) == 3
        # Identical filters and identity reuse one entry; a different filter
        # selection must not reuse it.
        assert keys[0] == keys[1]
        assert keys[2] != keys[0]
        # Both sides of the merge contribute: upstream identity and the
        # chart's own filters (which also reach the distinct query).
        assert impersonation_mock.call_count == 3
        assert (
            datasource.values_for_column.call_args.kwargs["adhoc_filters"]
            == (other_filters["adhoc_filters"])
        )
