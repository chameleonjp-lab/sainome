import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  PLAYER_NAME_FORBIDDEN_RANGES,
  PLAYER_NAME_JOIN_CONTROL_RANGES,
  PLAYER_NAME_JOINING_LEFT_OR_DUAL_RANGES,
  PLAYER_NAME_JOINING_RIGHT_OR_DUAL_RANGES,
  PLAYER_NAME_JOINING_TRANSPARENT_RANGES,
  PLAYER_NAME_LETTER_RANGES,
  PLAYER_NAME_MARK_RANGES,
  PLAYER_NAME_NONSPACING_MARK_RANGES,
  PLAYER_NAME_NONZERO_CCC_MARK_RANGES,
  PLAYER_NAME_RGI_EMOJI_VS_SEQUENCES,
  PLAYER_NAME_RGI_EMOJI_ZWJ_SEQUENCES,
  PLAYER_NAME_SCRIPT_RANGES,
  PLAYER_NAME_SPACE_RANGES,
  PLAYER_NAME_VARIATION_SELECTOR_RANGES,
  PLAYER_NAME_VIRAMA_RANGES,
  PLAYER_NAME_VOWEL_DEPENDENT_RANGES
} from '../js/player-name-unicode-15-1.js';

const migration = await readFile(new URL(
  '../supabase/migrations/20260811090000_sainome_unicode_name_contract.sql',
  import.meta.url
), 'utf8');

function sectionBetween(startMarker, endMarker) {
  const start = migration.indexOf(startMarker);
  const end = migration.indexOf(endMarker, start);
  assert.notEqual(start, -1, startMarker);
  assert.notEqual(end, -1, endMarker);
  return migration.slice(start, end);
}

function countMatches(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

test('DB移行のUnicode範囲と列挙数がブラウザ固定データと一致する', () => {
  const expectedRanges = {
    forbidden: PLAYER_NAME_FORBIDDEN_RANGES,
    space: PLAYER_NAME_SPACE_RANGES,
    variation_selector: PLAYER_NAME_VARIATION_SELECTOR_RANGES,
    join_control: PLAYER_NAME_JOIN_CONTROL_RANGES,
    mark: PLAYER_NAME_MARK_RANGES,
    letter: PLAYER_NAME_LETTER_RANGES,
    nonspacing_mark: PLAYER_NAME_NONSPACING_MARK_RANGES,
    nonzero_ccc_mark: PLAYER_NAME_NONZERO_CCC_MARK_RANGES,
    virama: PLAYER_NAME_VIRAMA_RANGES,
    vowel_dependent: PLAYER_NAME_VOWEL_DEPENDENT_RANGES,
    joining_left_or_dual: PLAYER_NAME_JOINING_LEFT_OR_DUAL_RANGES,
    joining_right_or_dual: PLAYER_NAME_JOINING_RIGHT_OR_DUAL_RANGES,
    joining_transparent: PLAYER_NAME_JOINING_TRANSPARENT_RANGES
  };

  assert.match(migration, /Unicode 15\.1\.0; contract player-name-v1/);
  const rangeSection = sectionBetween(
    'insert into private.sainome_v2_unicode_ranges',
    'insert into private.sainome_v2_unicode_scripts'
  );
  for (const [kind, ranges] of Object.entries(expectedRanges)) {
    assert.equal(
      countMatches(
        rangeSection,
        new RegExp("\\('" + kind + "', \\d+, \\d+\\)", 'g')
      ),
      ranges.length,
      kind
    );
  }

  const scriptSection = sectionBetween(
    'insert into private.sainome_v2_unicode_scripts',
    'on conflict (range_start, range_end, script_id) do nothing;'
  );
  assert.equal(
    countMatches(scriptSection, /^  \(\d+, \d+, \d+\),?$/gm),
    PLAYER_NAME_SCRIPT_RANGES.length
  );

  const variationSection = sectionBetween(
    "insert into private.sainome_v2_unicode_sequences (sequence_kind, sequence_codepoints) values\n  ('emoji_vs'",
    'on conflict (sequence_kind, sequence_codepoints) do nothing;'
  );
  assert.equal(
    countMatches(variationSection, /^  \('emoji_vs', array\[/gm),
    PLAYER_NAME_RGI_EMOJI_VS_SEQUENCES.length
  );

  const zwjStart = migration.indexOf(
    "insert into private.sainome_v2_unicode_sequences (sequence_kind, sequence_codepoints) values\n  ('emoji_zwj'"
  );
  const zwjEnd = migration.indexOf(
    'on conflict (sequence_kind, sequence_codepoints) do nothing;',
    zwjStart
  );
  assert.notEqual(zwjStart, -1);
  assert.notEqual(zwjEnd, -1);
  assert.equal(
    countMatches(
      migration.slice(zwjStart, zwjEnd),
      /^  \('emoji_zwj', array\[/gm
    ),
    PLAYER_NAME_RGI_EMOJI_ZWJ_SEQUENCES.length
  );
});

test('DB検査はデータ表を直接公開せず、固定検索先で全関数を動かす', () => {
  assert.match(
    migration,
    /alter table private\.sainome_v2_unicode_ranges enable row level security/
  );
  assert.match(
    migration,
    /revoke all on table[\s\S]*?private\.sainome_v2_unicode_sequences[\s\S]*?from public, anon, authenticated, service_role/
  );
  assert.equal(
    (migration.match(/set search_path = ''/g) ?? []).length >= 12,
    true
  );
  assert.match(
    migration,
    /private\.sainome_v2_codepoint_in_range\(\s*'forbidden',\s*v_codepoint\s*\)/
  );
  assert.match(
    migration,
    /private\.sainome_v2_has_registered_sequence\([\s\S]*?'emoji_zwj'/
  );
  assert.match(
    migration,
    /private\.sainome_v2_has_valid_mark_contexts\(\s*p_name\s*\)/
  );
});
