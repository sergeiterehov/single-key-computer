import { NodeRoot, AnyNode, Nodes, ENode, NameNode } from "./Parser";

const to8 = (n: number) => [n & 0xff];
const to32 = (n: number) => [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].reverse();

class OpCoder<P extends any[]> {
  static from<B extends (...args: any) => Array<number | number[]>>(code: number, builder: B): OpCoder<Parameters<B>>;
  static from<P extends []>(code: number): OpCoder<[]>;
  static from(code: number, builder = (..._: any[]): any[] => []) {
    return new OpCoder(code, function (this: any, ...args) {
      return builder.apply(this, args).flat();
    });
  }

  constructor(public readonly code: number, private readonly _builder: (...args: P) => number[]) { }

  build(...args: P) {
    return [this.code, ...this._builder.apply(this, args)];
  }
}

export const Ops = {
  HLT: OpCoder.from(0x00),

  Push_IReg: OpCoder.from(0x01, (i: number) => [to8(i)]),
  Pop_IReg: OpCoder.from(0x02, (i: number) => [to8(i)]),
  Push_Size_Array: OpCoder.from(0x03, (s: number, a: number[]) => [to8(s), ...a.map(to8)]),
  Pop_Size: OpCoder.from(0x04, (s: number) => [to8(s)]),

  READ: OpCoder.from(0x10),
  WRITE: OpCoder.from(0x11),

  JMP_Address32: OpCoder.from(0x20, (a: number) => [to32(a)]),
  JIF_Address32: OpCoder.from(0x21, (a: number) => [to32(a)]),
  JELSE_Address32: OpCoder.from(0x22, (a: number) => [to32(a)]),

  ADD: OpCoder.from(0x30),
  SUB: OpCoder.from(0x31),
  MUL: OpCoder.from(0x32),
  DIV: OpCoder.from(0x33),
  MOD: OpCoder.from(0x34),
  AND: OpCoder.from(0x35),
  OR: OpCoder.from(0x36),
  NOT: OpCoder.from(0x37),
  EQ: OpCoder.from(0x38),
  GT: OpCoder.from(0x39),
  LT: OpCoder.from(0x3a),

  DISABLE_Index8: OpCoder.from(0xf0, (i: number) => [to8(i)]),
  ENABLE_Index8: OpCoder.from(0xf1, (i: number) => [to8(i)]),

  DEBUG: OpCoder.from(0xff),
};

export class Assembler {
  bin: Uint8Array = Uint8Array.from([]);
  map: { offset: number; length: number; node: AnyNode }[] = [];

  offset = 0;
  numInterrupts = 8;

  constructor(private _nodes: NodeRoot[], private _source: string) { }

  private _explain(key: string, node: AnyNode) {
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
    const bin: number[] = [];
    const locationsMap = new Map<string, { address: number; writeTo: number[] }>();
    const namesMap = new Map<string, Nodes[ENode.DefineName]>();

    this.map = [];

    const requireLocation = (name: NameNode) => {
      const location = locationsMap.get(name.value);

      if (!location) {
        throw new Error(this._explain("UNDEFINED_LOCATION", name));
      }

      return location;
    };

    const requireRegister = (node: AnyNode) => {
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

    let offsetDefined = false;

    for (const node of this._nodes) {
      switch (node.eNode) {
        case ENode.DefineOffset: {
          if (offsetDefined) {
            throw new Error(this._explain("OFFSET_ALREADY_DEFINED", node));
          }

          this.offset = node.offset;

          offsetDefined = true;
          break;
        }

        case ENode.DefineLocation: {
          if (locationsMap.has(node.name)) {
            throw new Error(this._explain("LOCATION_ALREADY_DEFINED", node));
          }

          locationsMap.set(node.name, { writeTo: [], address: 0 });
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
        case ENode.DefineOffset:
        case ENode.DefineName:
          break;

        case ENode.DefineLocation: {
          const location = locationsMap.get(node.name)!;

          location.address = bin.length;
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

        case ENode.OpMath: {
          switch (node.op) {
            case "+":
              bin.push(...Ops.ADD.build());
              break;
            case "*":
              bin.push(...Ops.MUL.build());
              break;
            case "-":
              bin.push(...Ops.SUB.build());
              break;
            case "/":
              bin.push(...Ops.DIV.build());
              break;
            case "%":
              bin.push(...Ops.MOD.build());
              break;
            case "&":
              bin.push(...Ops.AND.build());
              break;
            case "|":
              bin.push(...Ops.OR.build());
              break;
            case "^":
              bin.push(...Ops.NOT.build());
              break;
            case "=":
              bin.push(...Ops.EQ.build());
              break;
            case "<":
              bin.push(...Ops.LT.build());
              break;
            case ">":
              bin.push(...Ops.GT.build());
              break;
          }

          break;
        }

        case ENode.OpMem: {
          switch (node.op) {
            case "R":
              bin.push(...Ops.READ.build());
              break;
            case "W":
              bin.push(...Ops.WRITE.build());
              break;
          }

          break;
        }

        case ENode.OpControl: {
          switch (node.op) {
            case "DEBUG":
              bin.push(...Ops.DEBUG.build());
              break;
            case "HALT":
              bin.push(...Ops.HLT.build());
              break;
          }

          break;
        }

        case ENode.OpJump: {
          const location = requireLocation(node.addr);

          location.writeTo.push(bin.length + 1);

          switch (node.cond) {
            case "none":
              bin.push(...Ops.JMP_Address32.build(0));
              break;
            case "if":
              bin.push(...Ops.JIF_Address32.build(0));
              break;
            case "else":
              bin.push(...Ops.JELSE_Address32.build(0));
              break;
          }

          break;
        }

        case ENode.OpInterruptControl: {
          if (node.enabled) {
            bin.push(...Ops.ENABLE_Index8.build(node.index));
          } else {
            bin.push(...Ops.DISABLE_Index8.build(node.index));
          }

          break;
        }

        default:
          throw new Error(this._explain("UNEXPECTED_ROOT_OPERATION", node));
      }

      map.length = bin.length - map.offset;
      this.map.push(map);
    }

    for (const [, location] of locationsMap.entries()) {
      const addr32 = to32(location.address + this.offset);

      for (const writeTo of location.writeTo) {
        bin[writeTo] = addr32[0];
        bin[writeTo + 1] = addr32[1];
        bin[writeTo + 2] = addr32[2];
        bin[writeTo + 3] = addr32[3];
      }
    }

    this.bin = Uint8Array.from(bin);

    return this;
  }
}
