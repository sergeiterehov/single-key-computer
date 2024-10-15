import { Mapping } from "./utils";

export const enum EToken {
  Space,
  EOF,
  NumberBin,
  NumberHex,
  NumberDec,
  Name,
  Register,
  KeywordPush,
  KeywordPop,
  KeywordADD,
  KeywordMUL,
  KeywordSUB,
  KeywordDIV,
  KeywordMOD,
  KeywordAND,
  KeywordOR,
  KeywordNOT,
  KeywordEQ,
  KeywordGT,
  KeywordLT,
  KeywordJMP,
  KeywordJIF,
  KeywordJELSE,
  KeywordREAD,
  KeywordWRITE,
  KeywordDEBUG,
  KeywordHLT,
  KeywordENABLE,
  KeywordDISABLE,
  DirectiveOffset,
  DirectiveName,
  DirectiveHere,
  Coma,
  SquareBracketOpen,
  SquareBracketClose,
}

const TokensDefinition: [EToken, RegExp][] = [
  [EToken.Space, /\s+|\/\/[^\n]*/],
  [EToken.DirectiveOffset, /#offset/],
  [EToken.DirectiveName, /#name/],
  [EToken.DirectiveHere, /#here/],
  [EToken.NumberBin, /0b[01]+/],
  [EToken.NumberHex, /0x[0-9a-fA-F]+/],
  [EToken.NumberDec, /[0-9]+/],
  [EToken.KeywordPush, /push/],
  [EToken.KeywordPop, /pop/],
  [EToken.KeywordADD, /add/],
  [EToken.KeywordMUL, /mul/],
  [EToken.KeywordSUB, /sub/],
  [EToken.KeywordDIV, /div/],
  [EToken.KeywordMOD, /mod/],
  [EToken.KeywordAND, /and/],
  [EToken.KeywordOR, /or/],
  [EToken.KeywordNOT, /not/],
  [EToken.KeywordEQ, /eq/],
  [EToken.KeywordGT, /gt/],
  [EToken.KeywordLT, /lt/],
  [EToken.KeywordJMP, /jmp/],
  [EToken.KeywordJIF, /jif/],
  [EToken.KeywordJELSE, /jelse/],
  [EToken.KeywordREAD, /read/],
  [EToken.KeywordWRITE, /write/],
  [EToken.KeywordDEBUG, /debug/],
  [EToken.KeywordHLT, /hlt/],
  [EToken.KeywordENABLE, /enable/],
  [EToken.KeywordDISABLE, /disable/],
  [EToken.Register, /_(0|[1-9][0-9]*)/],
  [EToken.Name, /[a-zA-Z_]+[a-zA-Z_0-9]*/],
  [EToken.Coma, /,/],
  [EToken.SquareBracketOpen, /\[/],
  [EToken.SquareBracketClose, /\]/],
];

export type Token = { eToken: EToken; value: string; $map: Mapping };

const Timing = {
  TokenizationLimit: 30 * 1000,
};

export class Tokenizer {
  tokens: Token[] = [];

  constructor(private _text: string) { }

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
