import { EToken, Token } from "./Tokenizer";
import { Mapping } from "./utils";

export enum ENode {
  OpPush,
  OpPushArray,
  OpPop,
  OpMath,
  OpMem,
  OpControl,
  OpJump,
  Number,
  Register,
  Name,
  DefineOffset,
  DefineName,
  DefineLocation,
  Array,
}

type NodeOf<N extends ENode, O extends object> = { eNode: N; $map: Mapping } & O;

export type NumberNode = NodeOf<ENode.Number, { value: number }>;
export type NameNode = NodeOf<ENode.Name, { value: string }>;
export type RegisterNode = NodeOf<ENode.Register, { index: number }>;
export type ArrayNode = NodeOf<ENode.Array, { values: NumberNode[] }>;

export type Nodes = {
  [ENode.Number]: NumberNode;
  [ENode.Name]: NameNode;
  [ENode.Register]: RegisterNode;
  [ENode.Array]: ArrayNode;

  [ENode.OpPush]: NodeOf<ENode.OpPush, { source: NumberNode | RegisterNode | NameNode | ArrayNode }>;
  [ENode.OpPop]: NodeOf<ENode.OpPop, { target: RegisterNode | NameNode | NumberNode }>;
  [ENode.OpMath]: NodeOf<ENode.OpMath, { op: "+" | "-" | "*" | "/" | "%" | "&" | "|" | "^" | "=" | "<" | ">" }>;
  [ENode.OpMem]: NodeOf<ENode.OpMem, { op: "R" | "W" }>;
  [ENode.OpControl]: NodeOf<ENode.OpControl, { op: "DEBUG" | "HALT" }>;
  [ENode.OpJump]: NodeOf<ENode.OpJump, { cond: "none" | "if" | "else"; addr: NameNode }>;

  [ENode.DefineOffset]: NodeOf<ENode.DefineOffset, { offset: number }>;
  [ENode.DefineName]: NodeOf<ENode.DefineName, { name: string; origin: RegisterNode }>;
  [ENode.DefineLocation]: NodeOf<ENode.DefineLocation, { name: string }>;
}

export type AnyNode = Nodes[keyof Nodes];

export type NodeRoot =
  | Nodes[ENode.OpPush]
  | Nodes[ENode.OpPop]
  | Nodes[ENode.OpMath]
  | Nodes[ENode.OpMem]
  | Nodes[ENode.OpControl]
  | Nodes[ENode.OpJump]
  | Nodes[ENode.DefineOffset]
  | Nodes[ENode.DefineName]
  | Nodes[ENode.DefineLocation];

export class Parser {
  private _at: number = 0;

  nodes: NodeRoot[] = [];

  constructor(private _tokens: Token[], private _source: string) { }

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

    const token = this._eat(EToken.Register);
    const index = Number(token.value.substring(1));

    this._endMap($map);

    return { $map, eNode: ENode.Register, index };
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

  private _parsePushOperation(): Nodes[ENode.OpPush] {
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
        case EToken.Register:
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

  private _parsePopOperation(): Nodes[ENode.OpPop] {
    const $map = this._beginMap();

    this._eat();

    const target = (() => {
      switch (this._getToken().eToken) {
        case EToken.NumberBin:
        case EToken.NumberDec:
        case EToken.NumberHex:
          return this._parseNumber();
        case EToken.Register:
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

  private _parseMathOperation(): Nodes[ENode.OpMath] {
    const $map = this._beginMap();

    const opToken = this._eat();

    let operation: Nodes[ENode.OpMath]["op"];

    switch (opToken.eToken) {
      default:
        throw new Error(this._explain("UNEXPECTED_MATH"));
      case EToken.KeywordADD:
        operation = "+";
        break;
      case EToken.KeywordSUB:
        operation = "-";
        break;
      case EToken.KeywordMUL:
        operation = "*";
        break;
      case EToken.KeywordDIV:
        operation = "/";
        break;
      case EToken.KeywordMOD:
        operation = "%";
        break;
      case EToken.KeywordAND:
        operation = "&";
        break;
      case EToken.KeywordOR:
        operation = "|";
        break;
      case EToken.KeywordNOT:
        operation = "^";
        break;
      case EToken.KeywordEQ:
        operation = "=";
        break;
      case EToken.KeywordLT:
        operation = "<";
        break;
      case EToken.KeywordGT:
        operation = ">";
        break;
    }

    this._endMap($map);

    return { $map, eNode: ENode.OpMath, op: operation };
  }

  private _parseMemOperation(): Nodes[ENode.OpMem] {
    const $map = this._beginMap();

    const opToken = this._eat();

    let operation: Nodes[ENode.OpMem]["op"];

    switch (opToken.eToken) {
      default:
        throw new Error(this._explain("UNEXPECTED_MEM"));
      case EToken.KeywordREAD:
        operation = "R";
        break;
      case EToken.KeywordWRITE:
        operation = "W";
        break;
    }

    this._endMap($map);

    return { $map, eNode: ENode.OpMem, op: operation };
  }

  private _parseControlOperation(): Nodes[ENode.OpControl] {
    const $map = this._beginMap();

    const opToken = this._eat();

    let operation: Nodes[ENode.OpControl]["op"];

    switch (opToken.eToken) {
      default:
        throw new Error(this._explain("UNEXPECTED_CONTROL"));
      case EToken.KeywordDEBUG:
        operation = "DEBUG";
        break;
      case EToken.KeywordHLT:
        operation = "HALT";
        break;
    }

    this._endMap($map);

    return { $map, eNode: ENode.OpControl, op: operation };
  }

  private _parseJumpOperation(): Nodes[ENode.OpJump] {
    const $map = this._beginMap();

    const opToken = this._eat();

    let condition: Nodes[ENode.OpJump]["cond"];

    switch (opToken.eToken) {
      default:
        throw new Error(this._explain("UNEXPECTED_JUMP"));
      case EToken.KeywordJMP:
        condition = "none";
        break;
      case EToken.KeywordJIF:
        condition = "if";
        break;
      case EToken.KeywordJELSE:
        condition = "else";
        break;
    }

    const addr = this._parseName();

    this._endMap($map);

    return { $map, eNode: ENode.OpJump, cond: condition, addr };
  }

  private _parseOffsetDefinition(): Nodes[ENode.DefineOffset] {
    const $map = this._beginMap();

    this._eat();

    const offset = this._parseNumber();

    this._endMap($map);

    return { $map, eNode: ENode.DefineOffset, offset: offset.value };
  }

  private _parseNameDefinition(): Nodes[ENode.DefineName] {
    const $map = this._beginMap();

    this._eat();

    const name = this._parseName();

    const origin = this._parseRegister();

    this._endMap($map);

    return { $map, eNode: ENode.DefineName, name: name.value, origin };
  }

  private _parseLocationDefinition(): Nodes[ENode.DefineLocation] {
    const $map = this._beginMap();

    this._eat();

    const name = this._parseName();

    this._endMap($map);

    return { $map, eNode: ENode.DefineLocation, name: name.value };
  }

  private _parse(): NodeRoot[] {
    const nodes: NodeRoot[] = [];

    while (!this._eof) {
      const token = this._getToken();

      switch (token.eToken) {
        case EToken.KeywordPush:
          nodes.push(this._parsePushOperation());
          break;
        case EToken.KeywordPop:
          nodes.push(this._parsePopOperation());
          break;
        case EToken.KeywordADD:
        case EToken.KeywordSUB:
        case EToken.KeywordMUL:
        case EToken.KeywordDIV:
        case EToken.KeywordMOD:
        case EToken.KeywordAND:
        case EToken.KeywordOR:
        case EToken.KeywordNOT:
        case EToken.KeywordEQ:
        case EToken.KeywordLT:
        case EToken.KeywordGT:
          nodes.push(this._parseMathOperation());
          break;
        case EToken.KeywordJMP:
        case EToken.KeywordJIF:
        case EToken.KeywordJELSE:
          nodes.push(this._parseJumpOperation());
          break;
        case EToken.KeywordREAD:
        case EToken.KeywordWRITE:
          nodes.push(this._parseMemOperation());
          break;
        case EToken.KeywordDEBUG:
        case EToken.KeywordHLT:
          nodes.push(this._parseControlOperation());
          break;
        case EToken.DirectiveOffset:
          nodes.push(this._parseOffsetDefinition());
          break;
        case EToken.DirectiveName:
          nodes.push(this._parseNameDefinition());
          break;
        case EToken.DirectiveHere:
          nodes.push(this._parseLocationDefinition());
          break;
        default:
          throw new Error(this._explain("OPERATION_TOKEN_EXPECTED"));
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
