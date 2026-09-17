import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './empty-state';
import { ErrorFallback } from './error-fallback';
import { Thinking } from './thinking';

/**
 * The behaviour half of the composite primitives (frontend-quality/02): what
 * each one renders and when. Appearance is the `*.visual.tsx` beside each.
 */
describe('EmptyState', () => {
  it('renders the title and body, and no action slot when none is given', () => {
    const html = renderToStaticMarkup(
      <EmptyState title="No sessions yet" body="The Coach drafts your first week on Monday." />,
    );
    expect(html).toContain('No sessions yet');
    expect(html).toContain('The Coach drafts your first week on Monday.');
    expect(html).not.toContain('data-slot="empty-state-action"');
    expect(html).not.toContain('data-slot="empty-state-icon"');
  });

  it('renders the action and the icon only when given', () => {
    const html = renderToStaticMarkup(
      <EmptyState
        title="No athletes"
        body="Invite one."
        icon={<svg data-testid="icon" />}
        action={<button>Invite</button>}
      />,
    );
    expect(html).toContain('data-slot="empty-state-action"');
    expect(html).toContain('<button>Invite</button>');
    expect(html).toContain('data-slot="empty-state-icon"');
    expect(html).toContain('data-testid="icon"');
  });

  it('is announced as status, not as an alert', () => {
    const html = renderToStaticMarkup(<EmptyState title="Empty" body="Nothing." />);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
  });
});

describe('ErrorFallback', () => {
  const props = {
    title: 'Something went wrong',
    body: 'The page could not load. Your data is safe.',
    retryLabel: 'Try again',
  };

  it('renders the title, body and retry label as an alert', () => {
    const html = renderToStaticMarkup(<ErrorFallback {...props} reset={() => undefined} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain(props.title);
    expect(html).toContain(props.body);
    expect(html).toContain('>Try again</button>');
  });

  it('wires reset to the retry button, and nothing else', () => {
    const reset = vi.fn();
    const element = <ErrorFallback {...props} reset={reset} />;
    // Server markup cannot click; assert the prop reaches the one button.
    const button = findButton(element);
    expect(button.props.onClick).toBe(reset);
    expect(reset).not.toHaveBeenCalled();
    button.props.onClick();
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('Thinking', () => {
  it('renders the label and three dots, politely live', () => {
    const html = renderToStaticMarkup(<Thinking label="Coach is thinking" />);
    expect(html).toContain('Coach is thinking');
    expect(html.match(/data-slot="thinking-dot"/g)).toHaveLength(3);
    expect(html).toContain('aria-live="polite"');
  });

  it('defaults to the signal tone and takes muted', () => {
    expect(renderToStaticMarkup(<Thinking label="x" />)).toContain('border-signal/40');
    expect(renderToStaticMarkup(<Thinking label="x" tone="muted" />)).toContain(
      'border-muted-foreground/40',
    );
  });
});

/**
 * Walks the element tree ErrorFallback returns and finds its Button.
 *
 * Coupled to the render tree on purpose: Vitest runs in `environment: 'node'`
 * here, so there is no DOM to click. If a DOM test environment is ever
 * adopted, replace this with a render-and-click through the public surface.
 */
function findButton(element: React.ReactElement): React.ReactElement<{ onClick: () => void }> {
  const rendered = (element.type as (p: unknown) => React.ReactElement)(element.props);
  const children = collectChildren(rendered);
  const button = children.find(
    (c) => typeof c.type === 'function' && (c.type as { name: string }).name === 'Button',
  );
  if (!button) throw new Error('ErrorFallback rendered no Button');
  return button as React.ReactElement<{ onClick: () => void }>;
}

function collectChildren(node: React.ReactNode, out: React.ReactElement[] = []): React.ReactElement[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectChildren(n, out));
    return out;
  }
  const el = node as React.ReactElement<{ children?: React.ReactNode }>;
  out.push(el);
  collectChildren(el.props?.children, out);
  return out;
}
