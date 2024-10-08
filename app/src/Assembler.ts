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
  KeywordJmp,
  KeywordJl,
  KeywordRead,
  KeywordWrite,
  KeywordDebug,
  KeywordHlt,
  DirectiveName,
  DirectiveHere,
  DirectiveHandle,
  Coma,
  SquareBracketOpen,
  SquareBracketClose,
}

const TokensDefinition: [EToken, RegExp][] = [
  [EToken.Space, /\s+|\/\/[^\n]*/],
  [EToken.DirectiveHandle, /#handle/],
  [EToken.DirectiveName, /#name/],
  [EToken.DirectiveHere, /#here/],
  [EToken.NumberBin, /0b[01]+/],
  [EToken.NumberHex, /0x[0-9a-fA-F]+/],
  [EToken.NumberDec, /[0-9]+/],
  [EToken.KeywordPush, /push/],
  [EToken.KeywordPop, /pop/],
  [EToken.KeywordAdd, /add/],
  [EToken.KeywordMul, /mul/],
  [EToken.KeywordJmp, /jmp/],
  [EToken.KeywordJl, /jl/],
  [EToken.KeywordRead, /read/],
  [EToken.KeywordWrite, /write/],
  [EToken.KeywordDebug, /debug/],
  [EToken.KeywordHlt, /hlt/],
  [EToken.RegInt, /i(0|[1-9][0-9]*)/],
  [EToken.Name, /[a-zA-Z_]+[a-zA-Z_0-9]*/],
  [EToken.Coma, /,/],
  [EToken.SquareBracketOpen, /\[/],
  [EToken.SquareBracketClose, /\]/],
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

      for (const [eToken, exp] of TokensDefinition) {
        const match = exp.exec(currentText);

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
  OpPushArray,
  OpPop,
  OpOnStack,
  OpJump,
  Number,
  Register,
  Name,
  DefineName,
  DefineLocation,
  DefineInterruptHandler,
  Array,
}

type NodeOf<N extends ENode, O extends object> = { eNode: N; $map: Mapping } & O;

type NumberNode = NodeOf<ENode.Number, { value: number }>;
type NameNode = NodeOf<ENode.Name, { value: string }>;
type RegisterNode = NodeOf<ENode.Register, { type: "i"; index: number }>;
type ArrayNode = NodeOf<ENode.Array, { values: NumberNode[] }>;

type OpPushNode = NodeOf<ENode.OpPush, { source: NumberNode | RegisterNode | NameNode | ArrayNode }>;
type OpPopNode = NodeOf<ENode.OpPop, { target: RegisterNode | NameNode | NumberNode }>;
type OpOnStackNode = NodeOf<ENode.OpOnStack, { op: "+" | "*" | "R" | "W" | "DEBUG" | "HALT" }>;
type OpJumpNode = NodeOf<ENode.OpJump, { cond: "*" | "<"; offset: NameNode }>;

type DefineNameNode = NodeOf<ENode.DefineName, { name: string; origin: RegisterNode }>;
type DefineLocationNode = NodeOf<ENode.DefineLocation, { name: string }>;
type DefineInterruptHandlerNode = NodeOf<ENode.DefineInterruptHandler, { index: number; offset: NameNode }>;

type NodeRoot =
  | DefineNameNode
  | DefineLocationNode
  | DefineInterruptHandlerNode
  | OpPushNode
  | OpPopNode
  | OpOnStackNode
  | OpJumpNode;

export type Node = NodeRoot | NumberNode | RegisterNode | NameNode | ArrayNode;

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

  private _parseArray(): ArrayNode {
    const $map = this._beginMap();

    this._eat(EToken.SquareBracketOpen);

    const values: NumberNode[] = [];

    do {
      values.push(this._parseNumber());

      if (this._getToken().eToken === EToken.Coma) {
        this._eat();
      }
    } while ([EToken.NumberBin, EToken.NumberDec, EToken.NumberHex, EToken.Name].includes(this._getToken().eToken));

    this._eat(EToken.SquareBracketClose);

    this._endMap($map);

    return { $map, eNode: ENode.Array, values };
  }

  private _parsePushOperation(): OpPushNode {
    const $map = this._beginMap();

    this._eat();

    const source = (() => {
      switch (this._getToken().eToken) {
        case EToken.SquareBracketOpen:
          return this._parseArray();
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
    })();

    this._endMap($map);

    return { $map, eNode: ENode.OpPush, source };
  }

  private _parsePopOperation(): OpPopNode {
    const $map = this._beginMap();

    this._eat();

    const target = (() => {
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
          throw new Error(this._explain("UNEXPECTED_TARGET"));
      }
    })();

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

    this._eat();

    const name = this._parseName();

    const origin = this._parseRegister();

    this._endMap($map);

    return { $map, eNode: ENode.DefineName, name: name.value, origin };
  }

  private _parseLocationDefinition(): DefineLocationNode {
    const $map = this._beginMap();

    this._eat();

    const name = this._parseName();

    this._endMap($map);

    return { $map, eNode: ENode.DefineLocation, name: name.value };
  }

  private _parseInterruptHandlerDefinition(): DefineInterruptHandlerNode {
    const $map = this._beginMap();

    this._eat();

    const index = this._parseNumber();
    const offset = this._parseName();

    this._endMap($map);

    return { $map, eNode: ENode.DefineInterruptHandler, index: index.value, offset };
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
        case EToken.KeywordJmp:
          nodes.push(this._parseJumpOperation("*"));
          break;
        case EToken.KeywordJl:
          nodes.push(this._parseJumpOperation("<"));
          break;
        case EToken.KeywordRead:
          nodes.push(this._parseOnStackOperation("R"));
          break;
        case EToken.KeywordWrite:
          nodes.push(this._parseOnStackOperation("W"));
          break;
        case EToken.KeywordDebug:
          nodes.push(this._parseOnStackOperation("DEBUG"));
          break;
        case EToken.KeywordHlt:
          nodes.push(this._parseOnStackOperation("HALT"));
          break;
        case EToken.DirectiveName:
          nodes.push(this._parseNameDefinition());
          break;
        case EToken.DirectiveHere:
          nodes.push(this._parseLocationDefinition());
          break;
        case EToken.DirectiveHandle:
          nodes.push(this._parseInterruptHandlerDefinition());
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

const to8 = (n: number) => [n & 0xff];
const to16 = (n: number) => [(n >> 8) & 0xff, n & 0xff].reverse();
const to32 = (n: number) => [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].reverse();

class OpCoder<P extends any[]> {
  static from<B extends (...args: any) => Array<number | number[]>>(code: number, builder: B): OpCoder<Parameters<B>>;
  static from<P extends []>(code: number): OpCoder<[]>;
  static from(code: number, builder = (..._: any[]): any[] => []) {
    return new OpCoder(code, function (this: any, ...args) {
      return builder.apply(this, args).flat();
    });
  }

  constructor(public readonly code: number, private readonly _builder: (...args: P) => number[]) {}

  build(...args: P) {
    return [this.code, ...this._builder.apply(this, args)];
  }
}

export const Ops = {
  Hlt: OpCoder.from(0x00),

  Push_IReg: OpCoder.from(0x01, (i: number) => [to8(i)]),
  Pop_IReg: OpCoder.from(0x02, (i: number) => [to8(i)]),
  Push_Size_Array: OpCoder.from(0x03, (s: number, a: number[]) => [to8(s), ...a.map(to8)]),
  Pop_Size: OpCoder.from(0x04, (s: number) => [to8(s)]),
  Read: OpCoder.from(0x10),
  Write: OpCoder.from(0x11),
  Jmp_Offset: OpCoder.from(0x20, (o: number) => [to16(o)]),
  Jl_Offset: OpCoder.from(0x21, (o: number) => [to16(o)]),
  Add: OpCoder.from(0x30),
  Mul: OpCoder.from(0x31),

  Debug: OpCoder.from(0xff),
};

export class Assembler {
  bin: Uint8Array = Uint8Array.from([]);
  map: { offset: number; length: number; node: Node }[] = [];

  enableInterrupts = true;

  constructor(private _nodes: NodeRoot[], private _source: string) {}

  private _explain(key: string, node: Node) {
    const { at, length } = node.$map;

    return `${key}@${at}:\n${`${this._source.substring(at, at - 30)}-->${this._source.substring(
      at,
      at + length
    )}<--${this._source.substring(at + length, at + length + 30)}`}`;
  }

  get source() {
    return this._source;
  }

  exec() {
    const numInterrupts = 8;

    const bin: number[] = [];
    const locationsMap = new Map<string, { location: number; offsets: { writeTo: number; relative: number }[] }>();
    const namesMap = new Map<string, DefineNameNode>();

    this.map = [];

    if (this.enableInterrupts) {
      bin.push(...new Array(numInterrupts * 2).fill(0));
    }

    const requireLocation = (name: NameNode) => {
      const location = locationsMap.get(name.value);

      if (!location) {
        throw new Error(this._explain("UNDEFINED_LOCATION", name));
      }

      return location;
    };

    const requireRegister = (node: Node) => {
      switch (node.eNode) {
        case ENode.Register:
          return node;
        case ENode.Name:
          const definition = namesMap.get(node.value);

          if (definition) {
            return definition.origin;
          }
          break;
      }

      throw new Error(this._explain("REGISTER_REQUIRED", node));
    };

    for (const node of this._nodes) {
      switch (node.eNode) {
        case ENode.DefineLocation: {
          if (locationsMap.has(node.name)) {
            throw new Error(this._explain("LOCATION_ALREADY_DEFINED", node));
          }

          locationsMap.set(node.name, { offsets: [], location: 0 });
          break;
        }

        case ENode.DefineName: {
          if (namesMap.has(node.name)) {
            throw new Error(this._explain("NAME_ALREADY_DEFINED", node));
          }

          namesMap.set(node.name, node);
          break;
        }

        default:
          break;
      }
    }

    nodes_loop: for (const node of this._nodes) {
      const map: (typeof this.map)[0] = { node, offset: bin.length, length: 0 };

      switch (node.eNode) {
        case ENode.DefineName:
          break;

        case ENode.DefineLocation: {
          const location = locationsMap.get(node.name)!;

          location.location = bin.length;
          break;
        }

        case ENode.DefineInterruptHandler: {
          if (!this.enableInterrupts) {
            throw new Error(this._explain("INTERRUPTS_DISABLED", node));
          }

          if (node.index >= numInterrupts) {
            throw new Error(this._explain("INTERRUPT_OUT_OF_RANGE", node));
          }

          const location = requireLocation(node.offset);

          location.offsets.push({ relative: 0, writeTo: node.index * 2 });
          break;
        }

        case ENode.OpPush: {
          switch (node.source.eNode) {
            default:
              bin.push(...Ops.Push_IReg.build(requireRegister(node.source).index));
              break;
            case ENode.Number:
              bin.push(...Ops.Push_Size_Array.build(4, to32(node.source.value)));
              break;
            case ENode.Array:
              bin.push(
                ...Ops.Push_Size_Array.build(
                  node.source.values.length,
                  node.source.values.map((n) => n.value)
                )
              );
              break;
          }

          break;
        }

        case ENode.OpPop: {
          switch (node.target.eNode) {
            default:
              bin.push(...Ops.Pop_IReg.build(requireRegister(node.target).index));
              break;
            case ENode.Number:
              bin.push(...Ops.Pop_Size.build(node.target.value));
              break;
          }

          break;
        }

        case ENode.OpOnStack: {
          switch (node.op) {
            case "+":
              bin.push(...Ops.Add.build());
              break;
            case "*":
              bin.push(...Ops.Mul.build());
              break;
            case "R":
              bin.push(...Ops.Read.build());
              break;
            case "W":
              bin.push(...Ops.Write.build());
              break;
            case "DEBUG":
              bin.push(...Ops.Debug.build());
              break;
            case "HALT":
              bin.push(...Ops.Hlt.build());
              break;
          }

          break;
        }

        case ENode.OpJump: {
          const location = requireLocation(node.offset);

          location.offsets.push({ relative: bin.length, writeTo: 1 });

          switch (node.cond) {
            case "*":
              bin.push(...Ops.Jmp_Offset.build(0));
              break;
            case "<":
              bin.push(...Ops.Jl_Offset.build(0));
              break;
          }

          break;
        }

        default:
          throw new Error(this._explain("UNEXPECTED_OPERATION", node));
      }

      map.length = bin.length - map.offset;
      this.map.push(map);
    }

    for (const [, location] of locationsMap.entries()) {
      for (const pointer of location.offsets) {
        const writeOffset = pointer.relative + pointer.writeTo;
        const binOffset = to16(location.location - pointer.relative);

        bin[writeOffset] = binOffset[0];
        bin[writeOffset + 1] = binOffset[1];
      }
    }

    this.bin = Uint8Array.from(bin);

    return this;
  }
}
