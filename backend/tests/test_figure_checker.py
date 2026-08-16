from app.agent.figure_checker import check


def test_matching_claim_passes():
    tool_results = {"get_recent_activity": {"total_events": 18}}
    llm_output = {
        "claims": [{"value": 18, "source_tool": "get_recent_activity", "source_field": "total_events"}],
        "narrative": "18 new events since the last check.",
    }
    result = check(llm_output, tool_results)
    assert result.passed


def test_mismatched_claim_fails():
    tool_results = {"get_recent_activity": {"total_events": 18}}
    llm_output = {
        "claims": [{"value": 20, "source_tool": "get_recent_activity", "source_field": "total_events"}],
        "narrative": "20 new events since the last check.",
    }
    result = check(llm_output, tool_results)
    assert not result.passed
    assert result.failure_reason == "claim_mismatch"
    assert result.actual_value == 18


def test_unbacked_narrative_number_fails():
    tool_results = {"get_recent_activity": {"total_events": 18}}
    llm_output = {
        "claims": [{"value": 18, "source_tool": "get_recent_activity", "source_field": "total_events"}],
        "narrative": "18 new events, and 42 puroks were affected.",
    }
    result = check(llm_output, tool_results)
    assert not result.passed
    assert result.failure_reason == "unbacked_narrative_number"


def test_list_index_path_resolves_correctly():
    tool_results = {"get_unaccounted_puroks": [{"purok_id": 9, "hours_since_contact": 9.2}]}
    llm_output = {
        "claims": [
            {"purok_id": 9, "hours_since_contact": 9.2, "source_tool": "get_unaccounted_puroks", "source_field": "[0]"}
        ],
        "narrative": "Purok 9 has had no contact in over 9.2 hours.",
    }
    result = check(llm_output, tool_results)
    assert result.passed


def test_singleton_list_omitted_index_resolves():
    # Regression test: found live 2026-08-15 — models consistently write
    # source_field="silence_score" instead of "[0].silence_score" for a single-element
    # list. Substantively correct claim, shouldn't be punished for a plausible
    # formatting choice.
    tool_results = {"get_unaccounted_puroks": [{"purok_id": 5, "silence_score": 100}]}
    llm_output = {
        "claims": [{"value": 100, "source_tool": "get_unaccounted_puroks", "source_field": "silence_score"}],
        "narrative": "The silence score is 100.",
    }
    result = check(llm_output, tool_results)
    assert result.passed


def test_bracket_syntax_resolves_dict_key():
    # Regression test: found live 2026-08-15 — a model wrote source_field="[5].status"
    # meaning the dict key "5" (get_purok is keyed by purok_id as a string, not a list),
    # not a list index. Reasonable convention (many path languages use obj[key] for
    # both lists and dicts).
    tool_results = {"get_purok": {"5": {"status": "unknown"}}}
    llm_output = {
        "claims": [{"value": "unknown", "source_tool": "get_purok", "source_field": "[5].status"}],
        "narrative": "Status is unknown.",
    }
    result = check(llm_output, tool_results)
    assert result.passed


def test_claim_citing_whole_list_containing_true_value_passes():
    # Regression test: found live 2026-08-15 — a claim cited source_field="reasons"
    # (a purok's full 3-item reasons list) meaning one specific true string within it,
    # not the whole list. Being imprecise about which index isn't the same as being
    # wrong about the fact.
    tool_results = {"get_high_severity": [{"reasons": ["no contact in over 6h", "last press was a held TABANG"]}]}
    llm_output = {
        "claims": [
            {"value": "last press was a held TABANG", "source_tool": "get_high_severity", "source_field": "reasons"}
        ],
        "narrative": "Last press was a held TABANG.",
    }
    result = check(llm_output, tool_results)
    assert result.passed


def test_claim_citing_list_with_absent_value_still_fails():
    # The leniency above must not become a loophole for a genuinely fabricated value.
    tool_results = {"get_high_severity": [{"reasons": ["no contact in over 6h"]}]}
    llm_output = {
        "claims": [{"value": "held TABANG detected", "source_tool": "get_high_severity", "source_field": "reasons"}],
        "narrative": "Held TABANG detected.",
    }
    result = check(llm_output, tool_results)
    assert not result.passed


def test_multi_item_list_still_requires_explicit_index():
    # The singleton leniency above must not extend to lists with real ambiguity.
    tool_results = {"get_high_severity": [{"purok_id": 5, "severity": "high"}, {"purok_id": 6, "severity": "low"}]}
    llm_output = {
        "claims": [{"value": "high", "source_tool": "get_high_severity", "source_field": "severity"}],
        "narrative": "Severity is high.",
    }
    result = check(llm_output, tool_results)
    assert not result.passed


def test_claim_with_true_sibling_field_passes():
    # Regression test: found live 2026-08-15 — a real model claim cited source_field
    # for ONE field ("[0].purok_name") but bundled another true fact from the same
    # record ("hours_since_contact") into the same claim object. Both facts are
    # correct; the claim should pass by checking the enclosing record, not be
    # rejected just because source_field only names one of the two fields.
    tool_results = {"get_unaccounted_puroks": [{"purok_name": "Purok 4", "hours_since_contact": 14.0}]}
    llm_output = {
        "claims": [
            {
                "source_tool": "get_unaccounted_puroks",
                "source_field": "[0].purok_name",
                "purok_name": "Purok 4",
                "hours_since_contact": 14.0,
            }
        ],
        "narrative": "Purok 4 has had no contact in over 14.0 hours.",
    }
    result = check(llm_output, tool_results)
    assert result.passed


def test_claim_with_false_sibling_field_still_fails():
    # The fallback above must not become a loophole — a genuinely wrong sibling field
    # should still be caught.
    tool_results = {"get_unaccounted_puroks": [{"purok_name": "Purok 4", "hours_since_contact": 14.0}]}
    llm_output = {
        "claims": [
            {
                "source_tool": "get_unaccounted_puroks",
                "source_field": "[0].purok_name",
                "purok_name": "Purok 4",
                "hours_since_contact": 99.0,
            }
        ],
        "narrative": "Purok 4 has had no contact in over 99.0 hours.",
    }
    result = check(llm_output, tool_results)
    assert not result.passed
    assert result.failure_reason == "claim_mismatch"
