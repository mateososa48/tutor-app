type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "^" }
  | { type: "leftParen" }
  | { type: "rightParen" }
  | { type: "comma" };

type Evaluator = (x: number) => number;

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  cos: Math.cos,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log,
  sin: Math.sin,
  sqrt: Math.sqrt,
  tan: Math.tan,
};

export function createMathEvaluator(expression: string): Evaluator | null {
  const tokens = tokenize(expression);
  if (!tokens) return null;

  const parser = new Parser(tokens);
  const evaluator = parser.parseExpression();
  if (!evaluator || !parser.isDone()) return null;

  return (x: number) => {
    const value = evaluator(x);
    if (!Number.isFinite(value)) return NaN;
    return value;
  };
}

export function isValidMathExpression(expression: string): boolean {
  return createMathEvaluator(expression) !== null;
}

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  const source = input.replaceAll("π", "pi");

  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const start = i;
      i++;
      while (i < source.length && /[0-9.eE+-]/.test(source[i])) {
        const prev = source[i - 1];
        const curr = source[i];
        if ((curr === "+" || curr === "-") && prev !== "e" && prev !== "E") break;
        i++;
      }
      const raw = source.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) return null;
      tokens.push({ type: "number", value });
      continue;
    }

    if (/[a-zA-Z_]/.test(char)) {
      const start = i;
      i++;
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) i++;
      tokens.push({ type: "identifier", value: source.slice(start, i).toLowerCase() });
      continue;
    }

    if (char === "(") tokens.push({ type: "leftParen" });
    else if (char === ")") tokens.push({ type: "rightParen" });
    else if (char === ",") tokens.push({ type: "comma" });
    else if (char === "+" || char === "-" || char === "*" || char === "/" || char === "^") {
      tokens.push({ type: "operator", value: char });
    } else {
      return null;
    }
    i++;
  }

  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  isDone(): boolean {
    return this.index === this.tokens.length;
  }

  parseExpression(): Evaluator | null {
    return this.parseAddSub();
  }

  private parseAddSub(): Evaluator | null {
    let left = this.parseMulDiv();
    if (!left) return null;

    while (this.matchOperator("+") || this.matchOperator("-")) {
      const operator = (this.previous() as { type: "operator"; value: string }).value;
      const right = this.parseMulDiv();
      if (!right) return null;
      const prevLeft: Evaluator = left;
      const nextRight: Evaluator = right;
      left = operator === "+"
        ? (x: number) => prevLeft(x) + nextRight(x)
        : (x: number) => prevLeft(x) - nextRight(x);
    }

    return left;
  }

  private parseMulDiv(): Evaluator | null {
    let left = this.parsePower();
    if (!left) return null;

    while (this.matchOperator("*") || this.matchOperator("/")) {
      const operator = (this.previous() as { type: "operator"; value: string }).value;
      const right = this.parsePower();
      if (!right) return null;
      const prevLeft: Evaluator = left;
      const nextRight: Evaluator = right;
      left = operator === "*"
        ? (x: number) => prevLeft(x) * nextRight(x)
        : (x: number) => prevLeft(x) / nextRight(x);
    }

    return left;
  }

  private parsePower(): Evaluator | null {
    const left = this.parseUnary();
    if (!left) return null;
    if (!this.matchOperator("^")) return left;

    const right = this.parsePower();
    if (!right) return null;
    return (x) => Math.pow(left(x), right(x));
  }

  private parseUnary(): Evaluator | null {
    if (this.matchOperator("+")) return this.parseUnary();
    if (this.matchOperator("-")) {
      const value = this.parseUnary();
      if (!value) return null;
      return (x) => -value(x);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Evaluator | null {
    const token = this.advance();
    if (!token) return null;

    if (token.type === "number") return () => token.value;

    if (token.type === "identifier") {
      if (token.value === "x") return (x) => x;
      if (token.value === "pi") return () => Math.PI;
      if (token.value === "e") return () => Math.E;

      if (!this.match("leftParen")) return null;
      const firstArg = this.parseExpression();
      if (!firstArg) return null;
      const args: Evaluator[] = [firstArg];

      while (this.match("comma")) {
        const nextArg = this.parseExpression();
        if (!nextArg) return null;
        args.push(nextArg);
      }

      if (!this.match("rightParen")) return null;
      const fn = FUNCTIONS[token.value];
      if (!fn) return null;
      if (args.length !== 1) return null;
      return (x) => fn(...args.map((arg) => arg(x)));
    }

    if (token.type === "leftParen") {
      const value = this.parseExpression();
      if (!value || !this.match("rightParen")) return null;
      return value;
    }

    return null;
  }

  private match(type: Token["type"]): boolean {
    if (this.peek()?.type !== type) return false;
    this.index++;
    return true;
  }

  private matchOperator(value: Extract<Token, { type: "operator" }>["value"]): boolean {
    const token = this.peek();
    if (token?.type !== "operator" || token.value !== value) return false;
    this.index++;
    return true;
  }

  private advance(): Token | undefined {
    return this.tokens[this.index++];
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private previous(): Token | undefined {
    return this.tokens[this.index - 1];
  }
}
