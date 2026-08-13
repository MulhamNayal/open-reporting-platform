/**
 * A small numeric expression language for measures — columns computed from other columns.
 *
 * Exists because a binding could previously only say "sum this column", which leaves every column
 * Power BI computes rather than stores unreachable: growth, conversion rates, variance against
 * target, and most of what a KPI card displays. Those are ratios, and neither the sum nor the
 * average of two ratios is the ratio of the sums, so they cannot be faked with an aggregation.
 *
 * Deliberately narrow. It covers the shapes that actually appear in the source models' DAX —
 * arithmetic over aggregated fields, and DIVIDE — and nothing else. It is not a DAX interpreter,
 * and it is not `eval`: the only things an expression can reach are the field names handed to it.
 *
 * Evaluated against an ALREADY-AGGREGATED row, which is the whole point. `[ThisYear] - [LastYear]`
 * over grouped rows is the difference of the sums; computed per source row and then summed it would
 * be the same number, but `[ThisYear] / [LastYear]` would not be, and that is the case that matters.
 */

/** Thrown for a malformed expression, so a typo surfaces as a message rather than a broken widget. */
export class MeasureSyntaxError extends Error {}

type Node =
  | { kind: "number"; value: number }
  | { kind: "field"; name: string }
  | { kind: "binary"; op: "+" | "-" | "*" | "/"; left: Node; right: Node }
  | { kind: "negate"; operand: Node }
  | { kind: "divide"; numerator: Node; denominator: Node; alternate: Node | null };

type Token =
  | { type: "number"; value: number }
  | { type: "field"; name: string }
  | { type: "name"; name: string }
  | { type: "op"; value: string };

const OPERATORS = new Set(["+", "-", "*", "/", "(", ")", ","]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (OPERATORS.has(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }

    // Bracketed field names, so a column with a space in it is still referable — the source models
    // are full of them, and DAX writes field references the same way.
    if (ch === "[") {
      const end = input.indexOf("]", i);
      if (end === -1) {
        throw new MeasureSyntaxError("Unclosed [ in expression.");
      }
      const name = input.slice(i + 1, end).trim();
      if (name === "") {
        throw new MeasureSyntaxError("Empty field reference [].");
      }
      tokens.push({ type: "field", name });
      i = end + 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      const match = /^[0-9]*\.?[0-9]+/.exec(input.slice(i));
      if (!match) {
        throw new MeasureSyntaxError(`Malformed number at position ${i}.`);
      }
      tokens.push({ type: "number", value: Number(match[0]) });
      i += match[0].length;
      continue;
    }

    // A bare word is either a function name or an unbracketed field reference; which one is decided
    // by whether a "(" follows.
    if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i))!;
      tokens.push({ type: "name", name: match[0] });
      i += match[0].length;
      continue;
    }

    throw new MeasureSyntaxError(`Unexpected character '${ch}' in expression.`);
  }

  return tokens;
}

/** Recursive descent: term (+|-) term, factor (*|/) factor, then primaries. */
class Parser {
  private position = 0;
  // Declared and assigned rather than a constructor parameter property: erasableSyntaxOnly is on,
  // and a parameter property emits real code rather than erasing to nothing.
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Node {
    const node = this.expression();
    if (this.position < this.tokens.length) {
      throw new MeasureSyntaxError("Unexpected trailing input in expression.");
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private eatOperator(...values: string[]): string | null {
    const token = this.peek();
    if (token && token.type === "op" && values.includes(token.value)) {
      this.position++;
      return token.value;
    }
    return null;
  }

  private expect(value: string): void {
    if (!this.eatOperator(value)) {
      throw new MeasureSyntaxError(`Expected '${value}' in expression.`);
    }
  }

  private expression(): Node {
    let left = this.factor();
    let op = this.eatOperator("+", "-");
    while (op) {
      left = { kind: "binary", op: op as "+" | "-", left, right: this.factor() };
      op = this.eatOperator("+", "-");
    }
    return left;
  }

  private factor(): Node {
    let left = this.unary();
    let op = this.eatOperator("*", "/");
    while (op) {
      left = { kind: "binary", op: op as "*" | "/", left, right: this.unary() };
      op = this.eatOperator("*", "/");
    }
    return left;
  }

  private unary(): Node {
    if (this.eatOperator("-")) {
      return { kind: "negate", operand: this.unary() };
    }
    return this.primary();
  }

  private primary(): Node {
    const token = this.peek();
    if (!token) {
      throw new MeasureSyntaxError("Unexpected end of expression.");
    }

    if (token.type === "number") {
      this.position++;
      return { kind: "number", value: token.value };
    }

    if (token.type === "field") {
      this.position++;
      return { kind: "field", name: token.name };
    }

    if (token.type === "name") {
      this.position++;
      // DIVIDE(numerator, denominator [, alternate]) — the only function, and the reason the
      // language exists: `/` on a zero denominator has to produce a blank, not Infinity.
      if (token.name.toUpperCase() === "DIVIDE") {
        this.expect("(");
        const numerator = this.expression();
        this.expect(",");
        const denominator = this.expression();
        const alternate = this.eatOperator(",") ? this.expression() : null;
        this.expect(")");
        return { kind: "divide", numerator, denominator, alternate };
      }
      if (this.peek()?.type === "op" && (this.peek() as { value: string }).value === "(") {
        throw new MeasureSyntaxError(`Unknown function '${token.name}'. Only DIVIDE is supported.`);
      }
      return { kind: "field", name: token.name };
    }

    if (token.type === "op" && token.value === "(") {
      this.position++;
      const inner = this.expression();
      this.expect(")");
      return inner;
    }

    throw new MeasureSyntaxError("Unexpected token in expression.");
  }
}

function collectFields(node: Node, into: Set<string>): void {
  switch (node.kind) {
    case "field":
      into.add(node.name);
      break;
    case "binary":
      collectFields(node.left, into);
      collectFields(node.right, into);
      break;
    case "negate":
      collectFields(node.operand, into);
      break;
    case "divide":
      collectFields(node.numerator, into);
      collectFields(node.denominator, into);
      if (node.alternate) {
        collectFields(node.alternate, into);
      }
      break;
  }
}

/** A missing or non-numeric operand makes the whole result blank rather than guessing a zero. */
function evaluateNode(node: Node, lookup: (field: string) => unknown): number | null {
  switch (node.kind) {
    case "number":
      return node.value;

    case "field": {
      const raw = lookup(node.name);
      if (raw === null || raw === undefined || raw === "") {
        return null;
      }
      const value = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(value) ? value : null;
    }

    case "negate": {
      const operand = evaluateNode(node.operand, lookup);
      return operand === null ? null : -operand;
    }

    case "binary": {
      const left = evaluateNode(node.left, lookup);
      const right = evaluateNode(node.right, lookup);
      if (left === null || right === null) {
        return null;
      }
      switch (node.op) {
        case "+": return left + right;
        case "-": return left - right;
        case "*": return left * right;
        // Bare `/` by zero is blank too. Infinity in a report is worse than an empty cell, and DAX
        // behaves the same way -- DIVIDE exists to supply an alternate, not to make it safe.
        case "/": return right === 0 ? null : left / right;
      }
      break;
    }

    case "divide": {
      const numerator = evaluateNode(node.numerator, lookup);
      const denominator = evaluateNode(node.denominator, lookup);
      if (denominator === null || denominator === 0 || numerator === null) {
        return node.alternate ? evaluateNode(node.alternate, lookup) : null;
      }
      return numerator / denominator;
    }
  }
  return null;
}

export interface CompiledMeasure {
  /** Every field the expression reads, so a binding can be validated before it renders. */
  fields: string[];
  evaluate(lookup: (field: string) => unknown): number | null;
}

/**
 * Compiled once per render rather than per row — parsing a string for each of a few thousand rows
 * is the kind of thing that makes a table feel slow for no reason.
 *
 * Throws MeasureSyntaxError for a malformed expression.
 */
export function compileMeasure(expression: string): CompiledMeasure {
  if (expression.trim() === "") {
    throw new MeasureSyntaxError("Expression is empty.");
  }

  const node = new Parser(tokenize(expression)).parse();
  const fields = new Set<string>();
  collectFields(node, fields);

  return {
    fields: [...fields],
    evaluate: (lookup) => evaluateNode(node, lookup),
  };
}
