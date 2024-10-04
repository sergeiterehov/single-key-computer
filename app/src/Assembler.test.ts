import { Parser, EToken, Tokenizer, ENode, Node, Assembler } from "./Assembler";
import { omitFp } from "./utils";

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

function clearMapDeep(nodes: Node[]) {
  const stack: object[] = [...nodes];

  let pointer: object;

  while ((pointer = stack.pop()!)) {
    delete (pointer as any).$map;

    for (const value of Object.values(pointer)) {
      if (typeof value === "object" && !Array.isArray(value)) {
        stack.push(value);
      }
    }
  }

  return nodes;
}

describe("Tokenizer", () => {
  test("Empty", () => {
    const tokenizer = new Tokenizer("").exec();

    expect(tokenizer.tokens[0].eToken).toBe(EToken.EOF);
  });

  test("Unexpected", () => {
    expect(() => {
      new Tokenizer("set name (i0)").exec();
    }).toThrow(/UNEXPECTED_SYMBOL/);
  });

  test("Skip spaces", () => {
    const tokenizer = new Tokenizer("   set name  \r\n  i0  \t  0x01  \n // this is comment \n\n 1234   ").exec();

    expect(tokenizer.tokens).toHaveLength(6);
  });

  test("Some operation", () => {
    const text = `set i1 0xFF`;
    const tokenizer = new Tokenizer(text).exec();

    expect(tokenizer.tokens.map(omitFp("$map"))).toEqual([
      { eToken: EToken.KeywordSet, value: "set" },
      { eToken: EToken.RegInt, value: "i1" },
      { eToken: EToken.NumberHex, value: "0xFF" },
      { eToken: EToken.EOF, value: "" },
    ] as typeof tokenizer.tokens);
  });

  test("Mapping", () => {
    const text = `set i1 0xFF hello_world`;
    const tokenizer = new Tokenizer(text).exec();

    expect(tokenizer.tokens).toEqual([
      { eToken: EToken.KeywordSet, value: "set", $map: { at: 0, length: 3 } },
      { eToken: EToken.RegInt, value: "i1", $map: { at: 4, length: 2 } },
      { eToken: EToken.NumberHex, value: "0xFF", $map: { at: 7, length: 4 } },
      { eToken: EToken.Name, value: "hello_world", $map: { at: 12, length: 11 } },
      { eToken: EToken.EOF, value: "", $map: { at: 23, length: 0 } },
    ] as typeof tokenizer.tokens);
  });
});

describe("Parser", () => {
  test("Empty", () => {
    expect(parse("")).toEqual([]);
  });

  test("Root operation expected", () => {
    expect(() => parse("a b c d e")).toThrow(/OPERATION_EXPECTED/);
  });

  test("Simple operation", () => {
    expect(parse("set i0 0xFF")).toEqual([
      {
        $map: {
          at: 0,
          length: 11,
        },
        eNode: ENode.OpSet,
        source: {
          $map: {
            at: 7,
            length: 4,
          },
          eNode: ENode.ConstantNumber,
          value: 0xff,
        },
        target: {
          $map: {
            at: 4,
            length: 2,
          },
          eNode: ENode.Register,
          index: 0,
          type: "i",
        },
      },
    ]);
  });

  test("Multiple expression", () => {
    expect(
      parse(`
        set i0 100
        set i1 i0
      `)
    ).toHaveLength(2);
  });

  describe("Operations", () => {
    test("set [reg] [number]", () => {
      expect(clearMapDeep(parse("set i0 0x123ABC"))).toEqual([
        {
          eNode: 0,
          target: { eNode: ENode.Register, index: 0, type: "i" },
          source: { eNode: ENode.ConstantNumber, value: 0x123abc },
        },
      ]);
    });

    test("set [reg] [reg]", () => {
      expect(clearMapDeep(parse("set i1 i2"))).toEqual([
        {
          eNode: 0,
          target: { eNode: ENode.Register, index: 1, type: "i" },
          source: { eNode: ENode.Register, index: 2, type: "i" },
        },
      ]);
    });
  });
});

describe("Compiler", () => {
  test("Name definition", () => {
    expect(
      compile(`
        #name t i1
        #name s i2
        set t s
      `)
    ).toEqual(Uint8Array.from([0x01, 0x01, 0x02]));
  });

  describe("Operations", () => {
    test("set [reg] [reg]", () => {
      expect(compile("set i1 i2")).toEqual(Uint8Array.from([0x01, 0x01, 0x02]));
    });
    test("set [reg] [number]", () => {
      expect(compile("set i1 0xAB")).toEqual(Uint8Array.from([0x02, 0x01, 0xab]));
    });

    test("add [reg] [reg]", () => {
      expect(compile("add i1 i2")).toEqual(Uint8Array.from([0x03, 0x01, 0x02]));
    });
    test("add [reg] [number]", () => {
      expect(compile("add i1 0xAB")).toEqual(Uint8Array.from([0x04, 0x01, 0xab]));
    });

    test("cmp [reg] [reg]", () => {
      expect(compile("cmp i1 i2")).toEqual(Uint8Array.from([0x05, 0x01, 0x02]));
    });
    test("cmp [reg] [number]", () => {
      expect(compile("cmp i1 0xAB")).toEqual(Uint8Array.from([0x6, 0x01, 0xab]));
    });

    test("jl label", () => {
      expect(compile("#here label jl label")).toEqual(Uint8Array.from([0x07, 0x00]));
    });
  });

  test("File 1", () => {
    const source = `
      #name x i1
      #name y i2

      set y 0
      #here for_y

        set x 0
        #here for_x

          // COMMENT

        add x 1
        cmp x 8
        jl for_x

      add y 1
      cmp y 8
      jl for_y
    `;

    expect(compile(source)).toEqual(
      Uint8Array.from([
        // set y 0
        0x02, 0x02, 0x00,
        // set x 0
        0x02, 0x01, 0x00,
        // add x 1
        0x04, 0x01, 0x01,
        // cmp x 8
        0x06, 0x01, 0x08,
        // jl for_x
        0x07, 0x06,
        // add y 1
        0x04, 0x02, 0x01,
        // cmp y 8
        0x06, 0x02, 0x08,
        // jl for_y
        0x07, 0x11,
      ])
    );
  });
});
