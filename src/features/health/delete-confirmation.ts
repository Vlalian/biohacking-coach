/** Where a delete is being confirmed in the Health Drawer: an open record, or one in History (28e). */
export type ConfirmationSection = 'open' | 'history';

/**
 * The key the drawer holds while a delete waits on its confirm tap. The
 * section is part of it: a record closed while its confirm was armed moves
 * to History under the same id, and without the section that History row
 * would arrive already confirmed (CodeRabbit, PR #111).
 */
export function confirmationKey(section: ConfirmationSection, id: string): string {
  return `${section}:${id}`;
}
