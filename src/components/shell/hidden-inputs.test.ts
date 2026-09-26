import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * showable-version/57: a focusable `sr-only` element is `position: absolute`,
 * so its containing block is the nearest *positioned* ancestor. Inside the
 * shell, that is the frame's body — outside `<main>`, the one element that
 * scrolls. Focusing it (a click on its label does) makes the browser scroll
 * the `overflow-hidden` frame instead: the header leaves the screen and the page
 * slides up under a white band until a reload. Reproduced in Chromium
 * 2026-09-26: frame `scrollTop` 1265 without a positioned wrapper, 0 with one.
 *
 * So every `<input className="sr-only">` must sit in a positioned element
 * (`relative`) inside the scroller. This walks every component, so a new
 * hidden input cannot bring it back.
 */
const ROOT = join(__dirname, '..', '..', '..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(path);
    return e.name.endsWith('.tsx') && !e.name.includes('.test.') ? [path] : [];
  });
}

function className(el: ts.JsxOpeningLikeElement): string {
  for (const attr of el.attributes.properties) {
    if (ts.isJsxAttribute(attr) && attr.name.getText() === 'className' && attr.initializer) {
      return attr.initializer.getText();
    }
  }
  return '';
}

/** Every hidden input with no positioned ancestor between it and the file's root, as `file:line`. */
function unanchoredHiddenInputs(source: string, file = 'x.tsx'): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node, anchored: boolean): void => {
    let nowAnchored = anchored;
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening) {
      const cls = className(opening);
      if (opening.tagName.getText() === 'input' && /\bsr-only\b/.test(cls) && !anchored) {
        found.push(`${file}:${sf.getLineAndCharacterOfPosition(opening.getStart()).line + 1}`);
      }
      if (/\b(relative|absolute|fixed|sticky)\b/.test(cls)) nowAnchored = true;
    }
    ts.forEachChild(node, (child) => visit(child, nowAnchored));
  };
  visit(sf, false);
  return found;
}

describe('hidden inputs stay inside the scroller (showable-version/57)', () => {
  it('finds a hidden input with no positioned ancestor, and accepts one inside a relative label', () => {
    expect(unanchoredHiddenInputs('const a = <label className="inline-flex"><input type="file" className="sr-only" /></label>;')).toEqual(['x.tsx:1']);
    expect(unanchoredHiddenInputs('const a = <label className="relative inline-flex"><input type="file" className="sr-only" /></label>;')).toEqual([]);
    expect(unanchoredHiddenInputs('const a = <label className="sr-only">Name</label>;')).toEqual([]);
  });

  it('has none anywhere in the app', () => {
    const offenders = tsxFiles(join(ROOT, 'src')).flatMap((f) =>
      unanchoredHiddenInputs(readFileSync(f, 'utf8'), relative(ROOT, f)),
    );
    expect(offenders).toEqual([]);
  });
});
