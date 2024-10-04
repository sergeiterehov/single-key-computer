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
  test("Name definition", () => {
    expect(
      compile(`
        #name t i1
        push s
        pop t
        #name s i2
      `)
    ).toEqual(Uint8Array.from([0x01, 0x02, 0x03, 0x01]));
  });

  test("Location definition", () => {
    expect(
      compile(`
        #here start
        jmp start
        jmp end
        #here end
      `)
    ).toEqual(Uint8Array.from([0x09, 0x00, 0x00, 0x09, 0x00, 0x03]));
  });

  describe("Operations", () => {
    test("push [reg]", () => {
      expect(compile("push i1")).toEqual(Uint8Array.from([0x01, 0x01]));
    });
    test("push [int]", () => {
      expect(compile("push 0x112233ff")).toEqual(Uint8Array.from([0x02, 0x11, 0x22, 0x33, 0xff]));
    });
    test("pop [reg]", () => {
      expect(compile("pop i1")).toEqual(Uint8Array.from([0x03, 0x01]));
    });
    test("add", () => {
      expect(compile("add")).toEqual(Uint8Array.from([0x04]));
    });
    test("mul", () => {
      expect(compile("mul")).toEqual(Uint8Array.from([0x05]));
    });
    test("read", () => {
      expect(compile("read")).toEqual(Uint8Array.from([0x07]));
    });
    test("write", () => {
      expect(compile("write")).toEqual(Uint8Array.from([0x08]));
    });
    test("jmp [offset]", () => {
      expect(compile("#here loop jmp loop")).toEqual(Uint8Array.from([0x09, 0x00, 0x00]));
    });
    test("jl [offset]", () => {
      expect(compile("#here loop jl loop")).toEqual(Uint8Array.from([0x06, 0x00, 0x00]));
    });
    test("debug", () => {
      expect(compile("debug")).toEqual(Uint8Array.from([0x0a]));
    });
  });

  test("Map", () => {
    const source = "push i1 push 0xff";
    const asm = new Assembler(parse(source), source);

    asm.exec();

    expect(asm.bin).toEqual(
      Uint8Array.from(
        [
          [0x01, 0x01],
          [0x02, 0x00, 0x00, 0x00, 0xff],
        ].flat()
      )
    );
    expect([asm.map[0].offset, asm.map[0].length, asm.map[0].node.$map]).toEqual([0, 2, { at: 0, length: 7 }]);
    expect([asm.map[1].offset, asm.map[1].length, asm.map[1].node.$map]).toEqual([2, 5, { at: 8, length: 9 }]);
  });

  test("Program", () => {
    const source = `
      #name x i1
      #name y i2
      #name pixel i3
      #name rand i4

      push 0 pop y
      #here for_y

        push 0 pop x
        #here for_x

          // Compute some math
          push y push 8 mul push x add
          push 0x10000 add
          pop pixel

        push x push 1 add pop x
        push x push 8 jl for_x

      push y push 1 add pop y
      push y push 8 jl for_y
    `;

    expect(compile(source)).toEqual(
      Uint8Array.from(
        [
          // push 0
          [0x02, 0x00, 0x00, 0x00, 0x00],
          // pop i2
          [0x03, 0x02],
          // push 0
          [0x02, 0x00, 0x00, 0x00, 0x00],
          // pop i1
          [0x03, 0x01],
          // push i2
          [0x01, 0x02],
          // push 8
          [0x02, 0x00, 0x00, 0x00, 0x08],
          // mul
          [0x05],
          // push i1
          [0x01, 0x01],
          // add
          [0x04],
          // push 0x10000
          [0x02, 0x00, 0x01, 0x00, 0x00],
          // add
          [0x04],
          // pop i3
          [0x03, 0x03],

          // push i1
          [0x01, 0x01],
          // push 1
          [0x02, 0x00, 0x00, 0x00, 0x01],
          // add
          [0x04],
          // pop i1
          [0x03, 0x01],
          // push i1
          [0x01, 0x01],
          // push 8
          [0x02, 0x00, 0x00, 0x00, 0x08],
          // jl for_x
          [0x06, 0xff, 0xdc],

          // push i2
          [0x01, 0x02],
          // push 1
          [0x02, 0x00, 0x00, 0x00, 0x01],
          // add
          [0x04],
          // pop i2
          [0x03, 0x02],
          // push i2
          [0x01, 0x02],
          // push 8
          [0x02, 0x00, 0x00, 0x00, 0x08],
          // jl for_y
          [0x06, 0xff, 0xc1],
        ].flat()
      )
    );
  });
});
