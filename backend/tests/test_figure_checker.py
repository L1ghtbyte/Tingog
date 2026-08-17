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


def test_claim_with_differently_named_sibling_field_passes():
    # Regression test: found live 2026-08-17 — a real claim labeled a sibling fact
    # "purok": "Purok 4" while the actual record stores it as "purok_name". The claimed
    # value was exactly right; only the model's own label for it differed from the
    # backend's internal field name. This must not be treated as a mismatch.
    tool_results = {
        "get_high_severity": [
            {"purok_id": 4, "purok_name": "Purok 4", "severity": "high", "reasons": ["no contact in over 6h"]}
        ]
    }
    llm_output = {
        "claims": [
            {
                "source_tool": "get_high_severity",
                "source_field": "[0].reasons",
                "purok": "Purok 4",
                "reasons": ["no contact in over 6h"],
            }
        ],
        "narrative": "Purok 4: no contact in over 6h.",
    }
    result = check(llm_output, tool_results)
    assert result.passed


def test_claim_with_differently_named_and_wrong_sibling_field_still_fails():
    # The leniency above must not become a loophole — a genuinely wrong sibling value,
    # under any field name, should still be caught.
    tool_results = {
        "get_high_severity": [
            {"purok_id": 4, "purok_name": "Purok 4", "severity": "high", "reasons": ["no contact in over 6h"]}
        ]
    }
    llm_output = {
        "claims": [
            {
                "source_tool": "get_high_severity",
                "source_field": "[0].reasons",
                "purok": "Purok 9",
                "reasons": ["no contact in over 6h"],
            }
        ],
        "narrative": "Purok 9: no contact in over 6h.",
    }
    result = check(llm_output, tool_results)
    assert not result.passed
    assert result.failure_reason == "claim_mismatch"


def test_narrative_number_backed_by_tool_arg_passes():
    # Regression test: found live 2026-08-17 — a real narrative said "in the last 30
    # minutes", where 30 was a query parameter the model chose for get_recent_activity,
    # not a value any tool ever returned. That's still a real, known-legitimate number,
    # not a hallucination — the checker was rejecting it because it only ever looked at
    # tool RESULTS, never tool CALL arguments.
    tool_results = {"get_recent_activity": {"total_events": 3}}
    llm_output = {
        "claims": [{"value": 3, "source_tool": "get_recent_activity", "source_field": "total_events"}],
        "narrative": "3 events in the last 30 minutes.",
    }
    result = check(llm_output, tool_results, tool_arg_numbers={30.0})
    assert result.passed


def test_narrative_number_not_backed_by_anything_still_fails():
    # The leniency above must not become a blanket pass — a number that's neither a
    # claim value nor a known tool argument should still be rejected.
    tool_results = {"get_recent_activity": {"total_events": 3}}
    llm_output = {
        "claims": [{"value": 3, "source_tool": "get_recent_activity", "source_field": "total_events"}],
        "narrative": "3 events in the last 45 minutes.",
    }
    result = check(llm_output, tool_results, tool_arg_numbers={30.0})
    assert not result.passed
    assert result.failure_reason == "unbacked_narrative_number"


def test_claim_with_paraphrased_sibling_value_passes():
    # Regression test: found live 2026-08-17 — a real claim added 'reason': 'high
    # severity' as a sibling fact where the actual record just has severity: 'high'. A
    # reasonable paraphrase, not a factual error.
    tool_results = {
        "get_high_severity": [{"purok_id": 4, "purok_name": "Purok 4", "severity": "high"}]
    }
    llm_output = {
        "claims": [
            {
                "source_tool": "get_high_severity",
                "source_field": "[0].purok_name",
                "value": "Purok 4",
                "reason": "high severity",
            }
        ],
        "narrative": "Purok 4 is high severity.",
    }
    result = check(llm_output, tool_results)
    assert result.passed


def test_claim_with_wrong_paraphrased_sibling_value_still_fails():
    # The paraphrase leniency above must not become a loophole — a genuinely wrong
    # value, even phrased as a "paraphrase", should still be caught.
    tool_results = {
        "get_high_severity": [{"purok_id": 4, "purok_name": "Purok 4", "severity": "high"}]
    }
    llm_output = {
        "claims": [
            {
                "source_tool": "get_high_severity",
                "source_field": "[0].purok_name",
                "value": "Purok 4",
                "reason": "low severity",
            }
        ],
        "narrative": "Purok 4 is low severity.",
    }
    result = check(llm_output, tool_results)
    assert not result.passed
    assert result.failure_reason == "claim_mismatch"


def test_claim_with_tool_arg_sibling_field_passes():
    # Regression test: found live 2026-08-17 — a real claim bundled the tool-call's own
    # query parameter as a sibling fact: {"value": 2, "window_minutes": 30}. 30 is never
    # part of any tool RESULT (it's an input, not returned data), so no amount of
    # searching the record would ever find it — this needs the known tool_arg_numbers.
    tool_results = {"get_recent_activity": {"by_need_type": {"TUBIG": 2}}}
    llm_output = {
        "claims": [
            {
                "source_tool": "get_recent_activity",
                "source_field": "by_need_type.TUBIG",
                "value": 2,
                "window_minutes": 30,
            }
        ],
        "narrative": "2 TUBIG reports in the last 30 minutes.",
    }
    result = check(llm_output, tool_results, tool_arg_numbers={30.0})
    assert result.passed


def test_claim_with_wrong_number_disguised_as_tool_arg_still_fails():
    # The leniency above must not become "any number passes" — a genuinely wrong
    # sibling number that ISN'T a known tool argument should still be rejected.
    tool_results = {"get_recent_activity": {"by_need_type": {"TUBIG": 2}}}
    llm_output = {
        "claims": [
            {
                "source_tool": "get_recent_activity",
                "source_field": "by_need_type.TUBIG",
                "value": 2,
                "window_minutes": 999,
            }
        ],
        "narrative": "2 TUBIG reports in the last 999 minutes.",
    }
    result = check(llm_output, tool_results, tool_arg_numbers={30.0})
    assert not result.passed
    assert result.failure_reason == "claim_mismatch"


def test_out_of_range_bracket_index_resolves_by_purok_id_on_a_plain_list():
    # Regression test: found live 2026-08-17 — get_high_severity returns a plain
    # positionally-indexed list (unlike get_purok's dict-keyed-by-purok_id shape), but a
    # real model claim wrote source_field="[4].severity" meaning "the item for purok 4"
    # (get_purok's own convention), not "position 4" — out of range on a 1-item list.
    # The claim's actual VALUE was exactly right; only the indexing convention was
    # borrowed from a different tool's shape.
    tool_results = {
        "get_high_severity": [{"purok_id": 4, "purok_name": "Purok 4", "severity": "high"}]
    }
    llm_output = {
        "claims": [{"source_tool": "get_high_severity", "source_field": "[4].severity", "value": "high", "purok_id": 4}],
        "narrative": "Purok 4 is high severity.",
    }
    result = check(llm_output, tool_results)
    assert result.passed


def test_out_of_range_bracket_index_with_no_matching_purok_id_still_fails():
    # The leniency above must not become "any out-of-range index passes" — no item in
    # the list actually has purok_id == 4, so this stays a real rejection.
    tool_results = {
        "get_high_severity": [{"purok_id": 9, "purok_name": "Purok 9", "severity": "high"}]
    }
    llm_output = {
        "claims": [{"source_tool": "get_high_severity", "source_field": "[4].severity", "value": "high"}],
        "narrative": "Purok 4 is high severity.",
    }
    result = check(llm_output, tool_results)
    assert not result.passed
    assert result.failure_reason == "claim_mismatch"


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


def test_claim_rounding_a_precise_float_to_a_whole_number_passes():
    # Regression test: found live 2026-08-17 — a claim wrote "hours": 14 for a real
    # value of 14.1, a reasonable plain-language rounding when citing a precise figure
    # in prose, not a fabrication.
    tool_results = {"get_unaccounted_puroks": [{"purok_name": "Purok 4", "hours_since_contact": 14.1}]}
    llm_output = {
        "claims": [
            {"source_tool": "get_unaccounted_puroks", "source_field": "[0].purok_name", "purok": "Purok 4", "hours": 14}
        ],
        "narrative": "Purok 4 has had no contact in over 14 hours.",
    }
    result = check(llm_output, tool_results)
    assert result.passed


def test_claim_with_wrong_whole_number_does_not_coincidentally_round_match():
    # The leniency above must not become a loophole — a genuinely wrong whole number
    # that doesn't round-match the real float is still rejected.
    tool_results = {"get_unaccounted_puroks": [{"purok_name": "Purok 4", "hours_since_contact": 14.1}]}
    llm_output = {
        "claims": [
            {"source_tool": "get_unaccounted_puroks", "source_field": "[0].purok_name", "purok": "Purok 4", "hours": 99}
        ],
        "narrative": "Purok 4 has had no contact in over 99 hours.",
    }
    result = check(llm_output, tool_results)
    assert not result.passed
    assert result.failure_reason == "claim_mismatch"


def test_assessment_referencing_only_already_verified_numbers_passes():
    # The "assessment" field (config.ENABLE_ASSESSMENT_LAYER) is genuine interpretation
    # built ONLY from already-verified claims/narrative — it's allowed to restate a
    # number that's already backed, just not introduce a new one.
    tool_results = {"get_unaccounted_puroks": [{"purok_name": "Purok 4", "hours_since_contact": 14.0}]}
    llm_output = {
        "claims": [
            {"source_tool": "get_unaccounted_puroks", "source_field": "[0].purok_name", "purok_name": "Purok 4", "hours_since_contact": 14.0}
        ],
        "narrative": "Purok 4 has had no contact in over 14.0 hours.",
        "assessment": "A silence of 14.0 hours this long is worth a direct check-in, not just a routine follow-up.",
    }
    result = check(llm_output, tool_results)
    assert result.passed


def test_assessment_with_no_numbers_at_all_passes():
    # Pure interpretive language with no numbers in it at all is always fine — the check
    # only ever looks at numbers, never tries to validate prose/opinion content.
    tool_results = {"get_unaccounted_puroks": [{"purok_name": "Purok 4", "hours_since_contact": 14.0}]}
    llm_output = {
        "claims": [
            {"source_tool": "get_unaccounted_puroks", "source_field": "[0].purok_name", "purok_name": "Purok 4", "hours_since_contact": 14.0}
        ],
        "narrative": "Purok 4 has had no contact in over 14.0 hours.",
        "assessment": "This kind of prolonged silence is worth prioritizing for a direct check-in.",
    }
    result = check(llm_output, tool_results)
    assert result.passed


def test_assessment_introducing_a_new_unbacked_number_fails():
    # The leniency above must not become a loophole for a genuinely new, uncited fact —
    # a number that never appeared in any claim or the narrative is a real hallucination,
    # even if it's phrased as "interpretation" rather than a direct claim.
    tool_results = {"get_unaccounted_puroks": [{"purok_name": "Purok 4", "hours_since_contact": 14.0}]}
    llm_output = {
        "claims": [
            {"source_tool": "get_unaccounted_puroks", "source_field": "[0].purok_name", "purok_name": "Purok 4", "hours_since_contact": 14.0}
        ],
        "narrative": "Purok 4 has had no contact in over 14.0 hours.",
        "assessment": "This is the 3rd time this month Purok 4 has gone silent, which is concerning.",
    }
    result = check(llm_output, tool_results)
    assert not result.passed
    assert result.failure_reason == "unbacked_assessment_number"


def test_claim_citing_a_dict_key_as_a_true_sibling_fact_passes():
    # Regression test: found live 2026-08-17 — a real claim cited
    # source_field="by_need_type.TUBIG" (a scalar count) and bundled a true sibling
    # fact, need_type="TUBIG" — restating the very dict key that selected the value.
    # The sibling-fallback check only searched the parent record's VALUES, and "TUBIG"
    # is a KEY there, not a value, so this fully correct claim was rejected every time.
    tool_results = {"get_recent_activity": {"by_need_type": {"TUBIG": 3, "PAGKAON": 1}}}
    llm_output = {
        "claims": [
            {"source_tool": "get_recent_activity", "source_field": "by_need_type.TUBIG", "need_type": "TUBIG", "count": 3}
        ],
        "narrative": "3 TUBIG reports came in.",
    }
    result = check(llm_output, tool_results)
    assert result.passed


def test_claim_citing_wrong_need_type_for_the_key_it_actually_resolved_still_fails():
    # The leniency above must not become a loophole — a claim mislabeling WHICH key it
    # resolved (right count, wrong need_type) is a real factual error, still caught
    # because the sibling check is tied to the exact key this claim's own source_field
    # resolved, not to any key present anywhere in the parent dict.
    tool_results = {"get_recent_activity": {"by_need_type": {"TUBIG": 3, "PAGKAON": 3}}}
    llm_output = {
        "claims": [
            {"source_tool": "get_recent_activity", "source_field": "by_need_type.TUBIG", "need_type": "PAGKAON", "count": 3}
        ],
        "narrative": "3 PAGKAON reports came in.",
    }
    result = check(llm_output, tool_results)
    assert not result.passed
    assert result.failure_reason == "claim_mismatch"


def test_narrative_rounding_a_precise_float_to_a_whole_number_passes():
    # Regression test: found live 2026-08-17 — a narrative said "silent for 14 hours"
    # for a claimed, cited value of 14.1. The rounding tolerance already applied to
    # structured claim fields didn't cover this separate raw-narrative-number check.
    tool_results = {"get_unaccounted_puroks": [{"purok_name": "Purok 4", "hours_since_contact": 14.1}]}
    llm_output = {
        "claims": [
            {"source_tool": "get_unaccounted_puroks", "source_field": "[0].hours_since_contact", "value": 14.1, "purok": "Purok 4"}
        ],
        "narrative": "Purok 4 has been silent for 14 hours.",
    }
    result = check(llm_output, tool_results)
    assert result.passed


def test_narrative_with_wrong_whole_number_does_not_coincidentally_round_match():
    # The leniency above must not become "any number passes" — a genuinely wrong whole
    # number that doesn't round-match any claimed figure is still rejected.
    tool_results = {"get_unaccounted_puroks": [{"purok_name": "Purok 4", "hours_since_contact": 14.1}]}
    llm_output = {
        "claims": [
            {"source_tool": "get_unaccounted_puroks", "source_field": "[0].hours_since_contact", "value": 14.1, "purok": "Purok 4"}
        ],
        "narrative": "Purok 4 has been silent for 99 hours.",
    }
    result = check(llm_output, tool_results)
    assert not result.passed
    assert result.failure_reason == "unbacked_narrative_number"
