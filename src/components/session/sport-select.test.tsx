import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SportSelect } from './sport-select';

/** `showable-version/52` — the picker every session form shares. */
const render = (props: { value?: string; className?: string } = {}) =>
  renderToStaticMarkup(
    <SportSelect
      value={props.value ?? ''}
      onChange={() => {}}
      noneLabel="No sport"
      sportName={(s) => `name:${s}`}
      className={props.className}
    />,
  );

describe('SportSelect', () => {
  it('lists the none option first, then the seven sports in order, each under its own name', () => {
    const options = [...render().matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]]);
    expect(options).toEqual([
      ['', 'No sport'],
      ['swim', 'name:swim'],
      ['bike', 'name:bike'],
      ['run', 'name:run'],
      ['brick', 'name:brick'],
      ['strength', 'name:strength'],
      ['mobility', 'name:mobility'],
      ['misc', 'name:misc'],
    ]);
  });

  it('selects the value it is given, and only that', () => {
    const html = render({ value: 'brick' });
    expect(html.match(/<option[^>]*selected[^>]*>/g)).toHaveLength(1);
    expect(html).toMatch(/<option(?=[^>]*\bselected)[^>]*value="brick"/);
  });

  it('capitalises the names, and adds a class it is given without a stray space', () => {
    expect(render().match(/<select[^>]*class="([^"]*)"/)?.[1]).toBe('capitalize');
    expect(render({ className: 'w-full h-11' }).match(/<select[^>]*class="([^"]*)"/)?.[1]).toBe('capitalize w-full h-11');
  });
});
