import { Parser, EToken, Tokenizer, ENode, Assembler } from "./Assembler";

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
      new Tokenizer("push name (i0)").exec();
    }).toThrow(/UNEXPECTED_SYMBOL/);
  });

  test("Expected", () => {
    const tokenizer = new Tokenizer("#name #here name i1 i23 0012345 0x001AF 0b0101001").exec();

    expect(tokenizer.tokens).toHaveLength(9);
  });

  test("Skip spaces", () => {
    const tokenizer = new Tokenizer("   set name  \r\n  i0  \t  0x01  \n // this is comment \n\n 1234   ").exec();

    expect(tokenizer.tokens).toHaveLength(6);
  });

  test("Mapping", () => {
    const text = `push i1 0xFF hello_world`;
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
    expect(() => parse("a b c d e")).toThrow(/OPERATION_EXPECTED/);
  });

  test("Simple operation with mapping", () => {
    expect(parse("add")).toEqual([{ $map: { at: 0, length: 3 }, eNode: ENode.OpOnStack, op: "+" }]);
  });

  test("Multiple root expression", () => {
    expect(
      parse(`
        push 100
        pop i1
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
        #name t i1
        push s
        pop t
        #name s i2
      `)
    ).toEqual(Uint8Array.from([0x01, 0x02, 0x02, 0x01]));
  });

  test("Location definition", () => {
    expect(
      compile(`
        #here start
        jmp start
        jmp end
        #here end
      `)
    ).toEqual(Uint8Array.from([0x20, 0x00, 0x00, 0x20, 0x03, 0x00]));
  });

  test("Map", () => {
    const source = "push i1 push 0xff";
    const asm = new Assembler(parse(source), source);

    asm.exec();

    expect([asm.map[0].offset, asm.map[0].length, asm.map[0].node.$map]).toEqual([0, 2, { at: 0, length: 7 }]);
    expect([asm.map[1].offset, asm.map[1].length, asm.map[1].node.$map]).toEqual([2, 6, { at: 8, length: 9 }]);
  });

  describe("Operations", () => {
    test("debug", () => {
      expect(compile("debug")).toEqual(Uint8Array.from([0xff]));
    });
    test("push [reg]", () => {
      expect(compile("push i1")).toEqual(Uint8Array.from([0x01, 0x01]));
    });
    test("push [int]", () => {
      expect(compile("push 0x112233ff")).toEqual(Uint8Array.from([0x03, 0x04, 0xff, 0x33, 0x22, 0x11]));
    });
    test("push [...[bytes]]", () => {
      expect(compile("push [1, 2, 3]")).toEqual(Uint8Array.from([0x03, 0x03, 1, 2, 3]));
    });
    test("pop [reg]", () => {
      expect(compile("pop i1")).toEqual(Uint8Array.from([0x02, 0x01]));
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
    test("jmp [offset]", () => {
      expect(compile("#here loop jmp loop")).toEqual(Uint8Array.from([0x20, 0x00, 0x00]));
    });
    test("jl [offset]", () => {
      expect(compile("#here loop jl loop")).toEqual(Uint8Array.from([0x21, 0x00, 0x00]));
    });
    test("add", () => {
      expect(compile("add")).toEqual(Uint8Array.from([0x30]));
    });
    test("mul", () => {
      expect(compile("mul")).toEqual(Uint8Array.from([0x31]));
    });
  });
});
