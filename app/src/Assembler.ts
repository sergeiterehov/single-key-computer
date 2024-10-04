type Mapping = { at: number; length: number };

export const enum EToken {
  Space,
  EOF,
  NumberBin,
  NumberHex,
  NumberDec,
  Name,
  RegInt,
  KeywordPush,
  KeywordPop,
  KeywordAdd,
  KeywordMul,
  KeywordJl,
  DirectiveName,
  DirectiveHere,
}

const TokensDefinition: [EToken, string][] = [
  [EToken.Space, "\\s+|\\/\\/[^\n]*"],
  [EToken.DirectiveName, "#name"],
  [EToken.DirectiveHere, "#here"],
  [EToken.NumberBin, "0b[01]+"],
  [EToken.NumberHex, "0x[0-9a-fA-F]+"],
  [EToken.NumberDec, "[0-9]+"],
  [EToken.KeywordPush, "push"],
  [EToken.KeywordPop, "pop"],
  [EToken.KeywordAdd, "add"],
  [EToken.KeywordMul, "mul"],
  [EToken.KeywordJl, "jl"],
  [EToken.RegInt, "i(0|[1-9][0-9]*)"],
  [EToken.Name, "[a-zA-Z_]+[a-zA-Z_0-9]*"],
];

type Token = { eToken: EToken; value: string; $map: Mapping };

const Timing = {
  TokenizationLimit: 30 * 1000,
};

export class Tokenizer {
  tokens: Token[] = [];

  constructor(private _text: string) {}

  get source() {
    return this._text;
  }

  exec() {
    const startedAt = Date.now();

    this.tokens = [];

    let currentText = this._text;
    let at = 0;

    const explain = (key: string) =>
      `${key}@${at}:\n${`${this._text.substring(at, at - 30)}>--!!!-->${this._text.substring(at, at + 30)}`}`;

    while (true) {
      if (Date.now() - startedAt > Timing.TokenizationLimit) throw new Error(explain("TOO_LONG"));

      let token: Token | undefined;

      for (const [eToken, expString] of TokensDefinition) {
        const match = new RegExp(expString).exec(currentText);

        if (!match) continue;

        if (match.index !== 0) continue;

        const value = match[0];
        const length = value.length;

        token = { eToken, value, $map: { at, length } };
        currentText = currentText.substring(length);
        at += length;

        break;
      }

      if (!token) {
        if (currentText.length) throw new Error(explain("UNEXPECTED_SYMBOL"));

        token = { eToken: EToken.EOF, value: "", $map: { at, length: 0 } };
      }

      if (token.eToken !== EToken.Space) {
        this.tokens.push(token);
      }

      if (token.eToken === EToken.EOF) break;
    }

    return this;
  }
}

export enum ENode {
  OpPush,
  OpPop,
  OpOnStack,
  OpJump,
  Number,
  Register,
  Name,
  DefineName,
  DefineLocation,
}

type NodeOf<N extends ENode, O extends object> = { eNode: N; $map: Mapping } & O;

type NumberNode = NodeOf<ENode.Number, { value: number }>;
type NameNode = NodeOf<ENode.Name, { value: string }>;
type RegisterNode = NodeOf<ENode.Register, { type: "i"; index: number }>;

type OpPushNode = NodeOf<ENode.OpPush, { source: NumberNode | RegisterNode | NameNode }>;
type OpPopNode = NodeOf<ENode.OpPop, { target: RegisterNode | NameNode }>;
type OpOnStackNode = NodeOf<ENode.OpOnStack, { op: "+" | "*" }>;
type OpJumpNode = NodeOf<ENode.OpJump, { cond: "<"; offset: NameNode }>;

type DefineNameNode = NodeOf<ENode.DefineName, { name: string; origin: RegisterNode }>;
type DefineLocationNode = NodeOf<ENode.DefineLocation, { name: string }>;

type NodeRoot = DefineNameNode | DefineLocationNode | OpPushNode | OpPopNode | OpOnStackNode | OpJumpNode;

export type Node = NodeRoot | NumberNode | RegisterNode | NameNode;

export class Parser {
  private _at: number = 0;

  nodes: NodeRoot[] = [];

  constructor(private _tokens: Token[], private _source: string) {}

  private _explain(key: string) {
    const token = this._getToken();

    if (!token) return key;

    const { at, length } = token.$map;

    return `${key}@${at}:\n${`${this._source.substring(at, at - 30)}-->${this._source.substring(
      at,
      at + length
    )}<--${this._source.substring(at + length, at + length + 30)}`}`;
  }

  private _beginMap(): Mapping {
    return { at: this._getToken().$map.at, length: 0 };
  }
  private _endMap(map: Mapping) {
    const prevToken = this._tokens[this._at - 1];

    map.length = prevToken.$map.at - map.at + prevToken.$map.length;

    return map;
  }

  private _eat(...eTokens: EToken[]) {
    if (eTokens.length && !eTokens.includes(this._getToken().eToken)) {
      throw new Error(this._explain("UNEXPECTED_TOKEN"));
    }

    return this._tokens[this._at++];
  }

  private _getToken(): Token {
    return this._tokens[this._at];
  }

  private get _eof() {
    return this._getToken().eToken === EToken.EOF;
  }

  private _parseRegister(): RegisterNode {
    const $map = this._beginMap();

    const token = this._eat(EToken.RegInt);
    const type = token.value.substring(0, 1);
    const index = Number(token.value.substring(1));

    if (type !== "i") throw new Error(this._explain(`UNSUPPORTED_REG_TYPE`));

    this._endMap($map);

    return { $map, eNode: ENode.Register, type, index };
  }

  private _parseNumber(): NumberNode {
    const $map = this._beginMap();

    const token = this._eat(EToken.NumberBin, EToken.NumberDec, EToken.NumberHex);

    this._endMap($map);

    return { $map, eNode: ENode.Number, value: Number(token.value) };
  }

  private _parseName(): NameNode {
    const $map = this._beginMap();

    const token = this._eat(EToken.Name);

    this._endMap($map);

    return { $map, eNode: ENode.Name, value: token.value };
  }

  private _parseSource() {
    switch (this._getToken().eToken) {
      case EToken.NumberBin:
      case EToken.NumberDec:
      case EToken.NumberHex:
        return this._parseNumber();
      case EToken.RegInt:
        return this._parseRegister();
      case EToken.Name:
        return this._parseName();
      default:
        throw new Error(this._explain("UNEXPECTED_SOURCE"));
    }
  }

  private _parseTarget() {
    switch (this._getToken().eToken) {
      case EToken.RegInt:
        return this._parseRegister();
      case EToken.Name:
        return this._parseName();
      default:
        throw new Error(this._explain("UNEXPECTED_TARGET"));
    }
  }

  private _parsePushOperation(): OpPushNode {
    const $map = this._beginMap();

    this._eat();

    const source = this._parseSource();

    this._endMap($map);

    return { $map, eNode: ENode.OpPush, source };
  }

  private _parsePopOperation(): OpPopNode {
    const $map = this._beginMap();

    this._eat();

    const target = this._parseTarget();

    this._endMap($map);

    return { $map, eNode: ENode.OpPop, target };
  }

  private _parseOnStackOperation(operation: OpOnStackNode["op"]): OpOnStackNode {
    const $map = this._beginMap();

    this._eat();

    this._endMap($map);

    return { $map, eNode: ENode.OpOnStack, op: operation };
  }

  private _parseJumpOperation(condition: OpJumpNode["cond"]): OpJumpNode {
    const $map = this._beginMap();

    this._eat();

    const offset = this._parseName();

    this._endMap($map);

    return { $map, eNode: ENode.OpJump, cond: condition, offset };
  }

  private _parseNameDefinition(): DefineNameNode {
    const $map = this._beginMap();

    this._eat(EToken.DirectiveName);

    const name = this._parseName();

    const origin = this._parseRegister();

    this._endMap($map);

    return { $map, eNode: ENode.DefineName, name: name.value, origin };
  }

  private _parseLocationDefinition(): DefineLocationNode {
    const $map = this._beginMap();

    this._eat(EToken.DirectiveHere);

    const name = this._parseName();

    this._endMap($map);

    return { $map, eNode: ENode.DefineLocation, name: name.value };
  }

  private _parse(): NodeRoot[] {
    const nodes: NodeRoot[] = [];

    while (!this._eof) {
      switch (this._getToken().eToken) {
        case EToken.KeywordPush:
          nodes.push(this._parsePushOperation());
          break;
        case EToken.KeywordPop:
          nodes.push(this._parsePopOperation());
          break;
        case EToken.KeywordAdd:
          nodes.push(this._parseOnStackOperation("+"));
          break;
        case EToken.KeywordMul:
          nodes.push(this._parseOnStackOperation("*"));
          break;
        case EToken.KeywordJl:
          nodes.push(this._parseJumpOperation("<"));
          break;
        case EToken.DirectiveName:
          nodes.push(this._parseNameDefinition());
          break;
        case EToken.DirectiveHere:
          nodes.push(this._parseLocationDefinition());
          break;
        default:
          throw new Error(this._explain("OPERATION_EXPECTED"));
      }
    }

    return nodes;
  }

  get source() {
    return this._source;
  }

  exec() {
    this._at = 0;
    this.nodes = this._parse();

    return this;
  }
}

const packInt8 = (n: number) => [n & 0xff];
const packInt16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const packInt32 = (n: number) => [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

const OpCodes = {
  Hlt: () => [0x00].flat(),

  Push_IReg: (i: number) => [0x01, packInt8(i)].flat(),
  Push_Int: (v: number) => [0x02, packInt32(v)].flat(),
  Pop_IReg: (i: number) => [0x03, packInt8(i)].flat(),
  Add: () => [0x04].flat(),
  Mul: () => [0x05].flat(),
  Jl_Offset: (o: number) => [0x06, packInt16(o)].flat(),
};

export class Assembler {
  bin: Uint8Array = Uint8Array.from([]);
  map: { offset: number; length: number; node: Node }[] = [];

  constructor(private _nodes: NodeRoot[], private _source: string) {}

  private _explain(key: string, node: Node) {
    const { at, length } = node.$map;

    return `${key}@${at}:\n${`${this._source.substring(at, at - 30)}-->${this._source.substring(
      at,
      at + length
    )}<--${this._source.substring(at + length, at + length + 30)}`}`;
  }

  private _findNameDefinition(name: string): DefineNameNode | undefined {
    for (const n of this._nodes) {
      if (n.eNode === ENode.DefineName && n.name === name) {
        return n;
      }
    }
  }

  get source() {
    return this._source;
  }

  exec() {
    const bin: number[] = [];
    const locationsMap = new Map<string, number>();

    this.map = [];

    const processParticipant = (node: Node) => {
      switch (node.eNode) {
        case ENode.Number:
        case ENode.Register:
          return node;
        case ENode.Name:
          const definition = this._findNameDefinition(node.value);

          if (definition) return definition.origin;
          break;
      }

      throw new Error(this._explain("UNEXPECTED_PARTICIPANT", node));
    };

    nodes_loop: for (const node of this._nodes) {
      const map: (typeof this.map)[0] = { node, offset: bin.length, length: 0 };

      switch (node.eNode) {
        case ENode.DefineName:
          break;

        case ENode.DefineLocation:
          locationsMap.set(node.name, bin.length);
          break;

        case ENode.OpPush:
          const source = processParticipant(node.source);

          switch (source.eNode) {
            case ENode.Register:
              bin.push(...OpCodes.Push_IReg(source.index));
              break;
            case ENode.Number:
              bin.push(...OpCodes.Push_Int(source.value));
              break;
          }

          break;

        case ENode.OpPop:
          const target = processParticipant(node.target);

          if (target.eNode === ENode.Number) {
            throw new Error(this._explain("UNEXPECTED_TARGET", node));
          }

          bin.push(...OpCodes.Pop_IReg(target.index));
          break;

        case ENode.OpOnStack:
          switch (node.op) {
            case "+":
              bin.push(...OpCodes.Add());
              break;
            case "*":
              bin.push(...OpCodes.Mul());
              break;
          }

          break;

        case ENode.OpJump:
          const location = locationsMap.get(node.offset.value);

          if (location === undefined) throw new Error(this._explain("UNDEFINED_LOCATION", node.offset));

          const offset = location - bin.length;

          switch (node.cond) {
            case "<":
              bin.push(...OpCodes.Jl_Offset(offset));
              break;
          }

          break;

        default:
          throw new Error(this._explain("UNEXPECTED_OPERATION", node));
      }

      map.length = bin.length - map.offset;
      this.map.push(map);
    }

    this.bin = Uint8Array.from(bin);

    return this;
  }
}
