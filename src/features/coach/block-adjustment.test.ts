import { describe, it, expect } from 'vitest';
import {
  ADJUST_TRAINING_BLOCKS_TOOL,
  ADJUST_TRAINING_BLOCKS_TOOL_NAME,
  adjustmentFromToolInput,
  buildBlockAdjustmentContext,
} from './block-adjustment';
import { renderBlockAdjustmentPrompt } from './prompts';
import { trainingBlocks } from './training-blocks';

/**
 * `training-architecture/07` — stage 2's briefing to the Coach and the shape of
 * what it hands back. Pure both ways: no clock, no db, no Anthropic client.
 */

const TODAY = '2026-09-14';
const RACE = { name: 'Ironman Copenhagen', date: '2027-08-15', distance: 'Ironman' };

const FULL = buildBlockAdjustmentContext({
  today: TODAY,
  race: RACE,
  draft: trainingBlocks(TODAY, RACE.date),
  experienceLevel: 'intermediate',
  capacity: 'Currently unable to run; swimming and cycling are unrestricted.',
  readiness: { energy: 6, body: 7, sleepQuality: 5 },
  notableSignal: 'calf tight since Tuesday',
  reflections: [
    { dateKey: '2026-09-10', sessionType: 'Endurance', body: 7, mind: 8, comment: 'felt strong' },
    { dateKey: '2026-09-12', sessionType: 'Intensity', body: 4, mind: 5, comment: null },
  ],
});

describe('renderBlockAdjustmentPrompt — the briefing carries every listed fact', () => {
  const prompt = renderBlockAdjustmentPrompt(FULL);

  it('carries the draft as dated spans, the horizon, distance and experience', () => {
    expect(prompt).toContain('Block 1 of 6');
    expect(prompt).toMatch(/2026-09-14 .* 2026-1\d-\d\d/);
    expect(prompt).toContain('47 weeks');
    expect(prompt).toContain('distance=Ironman');
    expect(prompt).toContain('Ironman Copenhagen on 2027-08-15');
    expect(prompt).toContain('Experience: intermediate');
  });

  it('carries the capacity statement, the Check-in scores and signal, and the reflections', () => {
    expect(prompt).toContain('Currently unable to run');
    expect(prompt).toContain('body=7/10 energy=6/10 sleep-quality=5/10');
    expect(prompt).toContain('calf tight since Tuesday');
    expect(prompt).toContain('Thu 10 Sept');
    expect(prompt).toContain('(7/10)');
    expect(prompt).toContain('felt strong');
  });

  it('pins race day and carries the rarity instruction on "unrealistic"', () => {
    expect(prompt).toContain('must end on race day, 2027-08-15');
    expect(prompt).toContain(
      'Saying the race is unrealistic is the heaviest sentence you can produce. Use it only when the horizon makes the distance genuinely unreachable, and expect to use it almost never.',
    );
    expect(prompt).toContain(ADJUST_TRAINING_BLOCKS_TOOL_NAME);
  });

  it('says plainly what it does not have, rather than omitting the subject', () => {
    const bare = renderBlockAdjustmentPrompt(
      buildBlockAdjustmentContext({
        today: TODAY,
        race: { ...RACE, distance: null },
        draft: trainingBlocks(TODAY, RACE.date),
        experienceLevel: undefined,
        capacity: null,
        readiness: null,
        notableSignal: null,
        reflections: [],
      }),
    );
    expect(bare).toContain('distance unknown');
    expect(bare).toContain('No Check-in this week');
    expect(bare).toContain('No Session Reflections');
    expect(bare).not.toContain('undefined');
    expect(bare).not.toContain('null');
  });

  it('renders the same string for the same context — golden', () => {
    expect(prompt).toMatchSnapshot();
  });
});

describe('buildBlockAdjustmentContext — no identifier reaches the briefing', () => {
  it('refuses a Check-in signal or a reflection comment that carries an email or phone', () => {
    const base = {
      today: TODAY,
      race: RACE,
      draft: trainingBlocks(TODAY, RACE.date),
      experienceLevel: undefined,
      capacity: null,
      readiness: null,
      reflections: [],
    };
    expect(() =>
      buildBlockAdjustmentContext({ ...base, notableSignal: 'mail me at lars@example.com' }),
    ).toThrow(/identifier/i);
    expect(() =>
      buildBlockAdjustmentContext({
        ...base,
        notableSignal: null,
        reflections: [{ dateKey: '2026-09-10', body: 5, mind: 5, comment: 'call +45 12 34 56 78' }],
      }),
    ).toThrow(/identifier/i);
  });
});

describe('the adjust_training_blocks tool', () => {
  it('asks for a name and an end date per block, and an optional unrealistic flag with a reason', () => {
    expect(ADJUST_TRAINING_BLOCKS_TOOL.name).toBe(ADJUST_TRAINING_BLOCKS_TOOL_NAME);
    const schema = ADJUST_TRAINING_BLOCKS_TOOL.input_schema as unknown as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(schema.properties)).toEqual(['blocks', 'unrealistic']);
    expect(schema.required).toEqual(['blocks']);
  });

  it('is pinned word for word — the description is what the model reads', () => {
    // The schema and its descriptions are sent to the API as-is, so every
    // literal in it is an instruction. A changed word here is a changed
    // instruction and the diff should show it.
    expect(ADJUST_TRAINING_BLOCKS_TOOL).toMatchSnapshot();
  });
});

describe('adjustmentFromToolInput — shape only, judgement is the validator\'s', () => {
  it('reads blocks and the flag out of a well-formed reply', () => {
    expect(
      adjustmentFromToolInput({
        blocks: [
          { name: 'Build the Volume', endDate: '2027-01-10' },
          { name: 'Taper', endDate: '2027-08-15' },
        ],
        unrealistic: { reason: 'twelve weeks is not enough for a first Ironman' },
      }),
    ).toEqual({
      blocks: [
        { name: 'Build the Volume', endDate: '2027-01-10', authoredBy: 'coach_ai' },
        { name: 'Taper', endDate: '2027-08-15', authoredBy: 'coach_ai' },
      ],
      unrealistic: { reason: 'twelve weeks is not enough for a first Ironman' },
    });
  });

  it('reads no flag as null, and drops an unrealistic without a reason', () => {
    const blocks = [{ name: 'A block', endDate: '2027-08-15' }];
    expect(adjustmentFromToolInput({ blocks })?.unrealistic).toBeNull();
    expect(adjustmentFromToolInput({ blocks, unrealistic: {} })?.unrealistic).toBeNull();
    expect(adjustmentFromToolInput({ blocks, unrealistic: { reason: '  ' } })?.unrealistic).toBeNull();
  });

  it('returns null for anything that is not a list of {name, endDate}', () => {
    expect(adjustmentFromToolInput(null)).toBeNull();
    expect(adjustmentFromToolInput('blocks')).toBeNull();
    expect(adjustmentFromToolInput({})).toBeNull();
    expect(adjustmentFromToolInput({ blocks: 'two' })).toBeNull();
    expect(adjustmentFromToolInput({ blocks: [{ name: 'A' }] })).toBeNull();
    expect(adjustmentFromToolInput({ blocks: [{ name: 3, endDate: '2027-08-15' }] })).toBeNull();
    // One bad entry poisons the list, wherever it sits, and a null entry does not throw.
    expect(
      adjustmentFromToolInput({ blocks: [{ name: 'A', endDate: '2027-01-01' }, { name: 'B' }] }),
    ).toBeNull();
    expect(adjustmentFromToolInput({ blocks: [null] })).toBeNull();
    expect(adjustmentFromToolInput({ blocks: [{ name: 'A', endDate: '2027-08-15' }], unrealistic: null })).toEqual({
      blocks: [{ name: 'A', endDate: '2027-08-15', authoredBy: 'coach_ai' }],
      unrealistic: null,
    });
  });
});

describe('renderBlockAdjustmentPrompt — the lines that vary', () => {
  it('renders a Check-in without a signal as the scores alone', () => {
    const prompt = renderBlockAdjustmentPrompt({ ...FULL, notableSignal: null });
    expect(prompt).toContain("This week's Check-in: body=7/10 energy=6/10 sleep-quality=5/10\n");
    expect(prompt).not.toContain('sleep-quality=5/10 ·');
  });

  it('rounds a short block to its nearest whole week', () => {
    // 22 days to the race: two blocks of eleven days, which is two weeks, not one.
    const prompt = renderBlockAdjustmentPrompt(
      buildBlockAdjustmentContext({ ...FULL, race: { ...RACE, date: '2026-10-06' }, draft: trainingBlocks(TODAY, '2026-10-06') }),
    );
    expect(prompt).toContain('(2 weeks)');
    expect(prompt).not.toContain('(1 weeks)');
  });
});

