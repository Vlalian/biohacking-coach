import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfirmDelete } from './confirm-delete';

/**
 * `showable-version/28e`, ruling 4: a record goes for good only after a
 * confirm tap. The first tap asks; only the second deletes. The drawer holds
 * which record is being asked about — this renders either step.
 */
const render = (confirming: boolean, action: 'remove' | 'delete' = 'remove') =>
  renderToStaticMarkup(
    <ConfirmDelete
      action={action}
      label="removeFromHistory"
      confirmLabel="confirmRemove"
      confirming={confirming}
      disabled={false}
      onAsk={() => {}}
      onConfirm={() => {}}
    />,
  );

describe('ConfirmDelete', () => {
  it('first offers the action, and no confirm', () => {
    const html = render(false);
    expect(html).toMatch(/data-action="remove"[^>]*>removeFromHistory</);
    expect(html).not.toContain('confirm-remove');
  });

  it('then offers the confirm, which is the only thing that deletes', () => {
    const html = render(true);
    expect(html).toMatch(/data-action="confirm-remove"[^>]*>confirmRemove</);
    expect(html).not.toContain('data-action="remove"');
  });

  it('names the confirm after the action it confirms', () => {
    expect(render(true, 'delete')).toContain('data-action="confirm-delete"');
  });
});
