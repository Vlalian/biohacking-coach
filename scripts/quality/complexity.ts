import ts from 'typescript';

/**
 * Cyclomatic complexity per function, read off the TypeScript AST.
 *
 * Pure: text in, numbers out, no filesystem. Uses the compiler the repo
 * already depends on rather than adding a parser — `tsc` is a devDependency
 * and its AST is the same one the typechecker sees.
 *
 * Complexity is one plus the number of decisions. A decision is anywhere
 * control could go two ways: `if`, loops, each `case`, a ternary, `&&`, `||`,
 * `??`, `catch`, and an optional call or access. `else` is not a decision —
 * it is the other side of one already counted — and neither is `default`,
 * which is what happens when every case above said no.
 *
 * A nested function is scored **separately** and never charged to its parent.
 * Otherwise a function whose only sin is holding a callback reads as complex,
 * and hoisting the callback out would "fix" a score without changing anything
 * a reader cares about.
 */

export type FunctionComplexity = {
  /** The declared name, or a positional label where there is none. */
  name: string;
  file: string;
  startLine: number;
  endLine: number;
  complexity: number;
};

type FunctionNode =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration
  | ts.ConstructorDeclaration;

/** Every node kind that has its own body, and so its own score. */
const FUNCTION_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.Constructor,
]);

function isFunctionNode(node: ts.Node): node is FunctionNode {
  return FUNCTION_KINDS.has(node.kind);
}

/**
 * Kinds that cost exactly one decision, as a lookup rather than a chain of
 * type guards — each guard is itself a branch, so writing this as `a || b ||
 * …` made the function that counts complexity one of the most complex in the
 * repo. `default:` is absent deliberately: it is what happens when every
 * `case` above said no, not a decision of its own. So is `else`.
 */
const DECISION_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.CaseClause,
]);

/** Binary operators that branch. */
const DECISION_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

/** Node kinds that carry an optional `?.`, which branches on nullish. */
const OPTIONAL_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.PropertyAccessExpression,
  ts.SyntaxKind.ElementAccessExpression,
  ts.SyntaxKind.CallExpression,
]);

/** One decision each; everything not listed is free. */
function decisionsAt(node: ts.Node): number {
  if (DECISION_KINDS.has(node.kind)) return 1;

  if (ts.isBinaryExpression(node)) {
    return DECISION_OPERATORS.has(node.operatorToken.kind) ? 1 : 0;
  }

  // `a?.b` and `a?.()` each branch on nullish, exactly like a ternary would.
  // Stryker disable next-line ConditionalExpression — equivalent: no other node kind carries a questionDotToken, so removing this guard reaches the same `undefined` and returns the same 0
  if (OPTIONAL_KINDS.has(node.kind)) {
    const optional = node as ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.CallExpression;
    return optional.questionDotToken === undefined ? 0 : 1;
  }

  return 0;
}

/** A readable label for a function that has no name of its own. */
function nameOf(node: FunctionNode, source: ts.SourceFile): string {
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (node.name) return node.name.getText(source);

  // `const f = () => …` and `{ f: () => … }` name the function through their
  // parent, which is how a reader refers to it.
  const parent = node.parent;
  if (parent && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent))) {
    return parent.name.getText(source);
  }

  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `(anonymous):${line + 1}`;
}

/**
 * Every function in `source`, with its complexity and line range.
 *
 * The range is what lets coverage be attributed back to a function without
 * matching on names, which v8-to-istanbul conversion does not preserve
 * reliably.
 */
export function measureComplexity(file: string, source: string): FunctionComplexity[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: FunctionComplexity[] = [];

  function visitFunction(fn: FunctionNode) {
    let complexity = 1;

    // Walk this function's own body only: descending into a nested function
    // would charge its decisions here as well as to itself.
    function walk(node: ts.Node) {
      if (node !== fn && isFunctionNode(node)) {
        visitFunction(node);
        return;
      }
      complexity += decisionsAt(node);
      ts.forEachChild(node, walk);
    }
    walk(fn);

    found.push({
      name: nameOf(fn, tree),
      file,
      startLine: tree.getLineAndCharacterOfPosition(fn.getStart(tree)).line + 1,
      endLine: tree.getLineAndCharacterOfPosition(fn.getEnd()).line + 1,
      complexity,
    });
  }

  function visitTop(node: ts.Node) {
    if (isFunctionNode(node)) {
      visitFunction(node);
      return;
    }
    ts.forEachChild(node, visitTop);
  }
  ts.forEachChild(tree, visitTop);

  return found.sort((a, b) => a.startLine - b.startLine);
}
