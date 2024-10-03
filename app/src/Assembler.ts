type Mapping = { at: number; length: number };

export const enum EToken {
  Space,
  EOF,
  NumberBin,
  NumberHex,
  NumberDec,
  Name,
  RegInt,
  KeywordSet,
  // TODO: ADD
  // TODO: CMP
  // TODO: JL
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
  [EToken.KeywordSet, "set"],
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
  OpSet,
  ConstantNumber,
  Register,
  Name,
  DefineName,
  DefineLocation,
}

type NodeOf<N extends ENode, O extends object> = { eNode: N; $map: Mapping } & O;

type NumberNode = NodeOf<ENode.ConstantNumber, { value: number }>;
type NameNode = NodeOf<ENode.Name, { value: string }>;
type RegisterNode = NodeOf<ENode.Register, { type: "i"; index: number }>;
type OpSetNode = NodeOf<ENode.OpSet, { target: RegisterNode | NameNode; source: NumberNode | RegisterNode | NameNode }>;
type DefineNameNode = NodeOf<ENode.DefineName, { name: string; origin: RegisterNode }>;
type DefineLocationNode = NodeOf<ENode.DefineLocation, { name: string }>;

export type Node = OpSetNode | NumberNode | RegisterNode | DefineNameNode | NameNode | DefineLocationNode;

type NodeRoot = OpSetNode | DefineNameNode | DefineLocationNode;

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

    return { $map, eNode: ENode.ConstantNumber, value: Number(token.value) };
  }

  private _parseName(): NameNode {
    const $map = this._beginMap();

    const token = this._eat(EToken.Name);

    this._endMap($map);

    return { $map, eNode: ENode.Name, value: token.value };
  }

  private _parseOpSet(): OpSetNode {
    const $map = this._beginMap();

    this._eat(EToken.KeywordSet);

    let target: OpSetNode["target"];

    switch (this._getToken().eToken) {
      case EToken.RegInt:
        target = this._parseRegister();
        break;
      case EToken.Name:
        target = this._parseName();
        break;
      default:
        throw new Error(this._explain("UNEXPECTED_TARGET"));
    }

    let source: OpSetNode["source"];

    switch (this._getToken().eToken) {
      case EToken.NumberBin:
      case EToken.NumberDec:
      case EToken.NumberHex:
        source = this._parseNumber();
        break;
      case EToken.RegInt:
        source = this._parseRegister();
        break;
      case EToken.Name:
        source = this._parseName();
        break;
      default:
        throw new Error(this._explain("UNEXPECTED_SOURCE"));
    }

    this._endMap($map);

    return { $map, eNode: ENode.OpSet, target, source };
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
        case EToken.KeywordSet:
          nodes.push(this._parseOpSet());
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

const OpCodes = {
  Set_IReg_IReg: (targetIndex: number, sourceIndex: number) => [0x01, targetIndex & 0xff, sourceIndex & 0xff],
  Set_IReg_Number: (targetIndex: number, number: number) => [0x02, targetIndex & 0xff, number & 0xffffffff],
};

export class Assembler {
  bin: Uint8Array = Uint8Array.from([]);

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
    const ops: number[] = [];
    const locationsMap = new Map<string, number>();

    nodes_loop: for (const node of this._nodes) {
      switch (node.eNode) {
        default:
          throw new Error(this._explain("UNEXPECTED_OPERATION", node));

        case ENode.DefineName:
          break;

        case ENode.DefineLocation:
          locationsMap.set(node.name, ops.length);
          break;

        case ENode.OpSet:
          let target: RegisterNode | undefined;

          switch (node.target.eNode) {
            case ENode.Register:
              target = node.target;
              break;
            case ENode.Name:
              target = this._findNameDefinition(node.target.value)?.origin;
              break;
          }

          if (!target) throw new Error(this._explain("UNEXPECTED_TARGET", node));

          let source: RegisterNode | NumberNode | undefined;

          switch (node.source.eNode) {
            case ENode.ConstantNumber:
            case ENode.Register:
              source = node.source;
              break;
            case ENode.Name:
              source = this._findNameDefinition(node.source.value)?.origin;
              break;
          }

          if (!source) throw new Error(this._explain("UNEXPECTED_SOURCE", node));

          switch (source.eNode) {
            case ENode.Register:
              ops.push(...OpCodes.Set_IReg_IReg(target.index, source.index));
              break;
            case ENode.ConstantNumber:
              ops.push(...OpCodes.Set_IReg_Number(target.index, source.value));
              break;
          }
          break;
      }
    }

    this.bin = Uint8Array.from(ops);

    return this;
  }
}
