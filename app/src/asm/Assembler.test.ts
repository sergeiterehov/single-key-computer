import { Assembler } from "./Assembler";
import { Parser, ENode } from "./Parser";
import { Tokenizer, EToken } from "./Tokenizer";

function parse(source: string) {
  const tokenizer = new Tokenizer(source);

  tokenizer.exec();

  const parser = new Parser(tokenizer.tokens, source);

  parser.exec();

  return parser.nodes;
}

function compile(source: string) {
  const asm = new Assembler(parse(source), source);

  asm.exec();

  return asm.bin;
}

describe("Tokenizer", () => {
  test("Empty", () => {
    const tokenizer = new Tokenizer("").exec();

    expect(tokenizer.tokens[0].eToken).toBe(EToken.EOF);
  });

  test("Unexpected", () => {
    expect(() => {
      new Tokenizer("push name (_0)").exec();
    }).toThrow(/UNEXPECTED_SYMBOL/);
  });

  test("Expected", () => {
    const tokenizer = new Tokenizer("#name #here name _1 _23 0012345 0x001AF 0b0101001").exec();

    expect(tokenizer.tokens).toHaveLength(9);
  });

  test("Skip spaces", () => {
    const tokenizer = new Tokenizer("   set name  \r\n  _0  \t  0x01  \n // this is comment \n\n 1234   ").exec();

    expect(tokenizer.tokens).toHaveLength(6);
  });

  test("Mapping", () => {
    const text = `push _1 0xFF hello_world`;
    const tokenizer = new Tokenizer(text).exec();

    expect(tokenizer.tokens.map((t) => [t.$map.at, t.$map.length])).toEqual([
      [0, 4],
      [5, 2],
      [8, 4],
      [13, 11],
      [24, 0],
    ]);
  });
});

describe("Parser", () => {
  test("Empty", () => {
    expect(parse("")).toEqual([]);
  });

  test("Root operation expected", () => {
    expect(() => parse("a b c d e")).toThrow(/OPERATION_TOKEN_EXPECTED/);
  });

  test("Simple operation with mapping", () => {
    expect(parse("add")).toEqual([{ $map: { at: 0, length: 3 }, eNode: ENode.OpMath, op: "+" }]);
  });

  test("Multiple root expression", () => {
    expect(
      parse(`
        push 100
        pop _1
      `)
    ).toHaveLength(2);
  });
});

describe("Compiler", () => {
  test("Little-Endian", () => {
    expect(compile("push 0x10203040")).toEqual(Uint8Array.from([0x03, 4, 0x40, 0x30, 0x20, 0x10]));
  });

  test("Name definition", () => {
    expect(
      compile(`
        #name t _1
        push s
        pop t
        #name s _2
      `)
    ).toEqual(Uint8Array.from([0x01, 0x02, 0x02, 0x01]));
  });

  test("Offset definition", () => {
    expect(
      compile(`
        #offset 0xab
        #here start
        jmp start
      `)
    ).toEqual(Uint8Array.from([0x20, 0xab, 0x00, 0x00, 0x00]));
  });

  test("Location definition", () => {
    expect(
      compile(`
        #here start
        jmp start
        jmp end
        #here end
      `)
    ).toEqual(Uint8Array.from([0x20, 0x00, 0x00, 0x00, 0x00, 0x20, 0x0a, 0x00, 0x00, 0x00]));
  });

  test("Map", () => {
    const source = "push _1 push 0xff";
    const asm = new Assembler(parse(source), source);

    asm.exec();

    expect([asm.map[0].offset, asm.map[0].length, asm.map[0].node.$map]).toEqual([0, 2, { at: 0, length: 7 }]);
    expect([asm.map[1].offset, asm.map[1].length, asm.map[1].node.$map]).toEqual([2, 6, { at: 8, length: 9 }]);
  });

  describe("Operations", () => {
    test("hlt", () => {
      expect(compile("hlt")).toEqual(Uint8Array.from([0x00]));
    });
    test("debug", () => {
      expect(compile("debug")).toEqual(Uint8Array.from([0xff]));
    });
    test("push [reg]", () => {
      expect(compile("push _1")).toEqual(Uint8Array.from([0x01, 0x01]));
    });
    test("push [int]", () => {
      expect(compile("push 0x112233ff")).toEqual(Uint8Array.from([0x03, 0x04, 0xff, 0x33, 0x22, 0x11]));
    });
    test("push [...[bytes]]", () => {
      expect(compile("push [1, 2, 3]")).toEqual(Uint8Array.from([0x03, 0x03, 1, 2, 3]));
    });
    test("pop [reg]", () => {
      expect(compile("pop _1")).toEqual(Uint8Array.from([0x02, 0x01]));
    });
    test("pop [size]", () => {
      expect(compile("pop 3")).toEqual(Uint8Array.from([0x04, 0x03]));
    });
    test("read", () => {
      expect(compile("read")).toEqual(Uint8Array.from([0x10]));
    });
    test("write", () => {
      expect(compile("write")).toEqual(Uint8Array.from([0x11]));
    });
    test("JMP_Address32", () => {
      expect(compile("#here loop jmp loop")).toEqual(Uint8Array.from([0x20, 0x00, 0x00, 0x00, 0x00]));
    });
    test("JIF_Address32", () => {
      expect(compile("#here loop jif loop")).toEqual(Uint8Array.from([0x21, 0x00, 0x00, 0x00, 0x00]));
    });
    test("JELSE_Address32", () => {
      expect(compile("#here loop jelse loop")).toEqual(Uint8Array.from([0x22, 0x00, 0x00, 0x00, 0x00]));
    });
    test("ADD", () => {
      expect(compile("add")).toEqual(Uint8Array.from([0x30]));
    });
    test("MUL", () => {
      expect(compile("mul")).toEqual(Uint8Array.from([0x32]));
    });
    test("SUB", () => {
      expect(compile("sub")).toEqual(Uint8Array.from([0x31]));
    });
    test("DIV", () => {
      expect(compile("div")).toEqual(Uint8Array.from([0x33]));
    });
    test("MOD", () => {
      expect(compile("mod")).toEqual(Uint8Array.from([0x34]));
    });
    test("AND", () => {
      expect(compile("and")).toEqual(Uint8Array.from([0x35]));
    });
    test("OR", () => {
      expect(compile("or")).toEqual(Uint8Array.from([0x36]));
    });
    test("NOT", () => {
      expect(compile("not")).toEqual(Uint8Array.from([0x37]));
    });
    test("EQ", () => {
      expect(compile("eq")).toEqual(Uint8Array.from([0x38]));
    });
    test("GT", () => {
      expect(compile("gt")).toEqual(Uint8Array.from([0x39]));
    });
    test("LT", () => {
      expect(compile("lt")).toEqual(Uint8Array.from([0x3a]));
    });
  });
});
