import { useEffect, useState } from "preact/hooks";
import { store } from "./store";
import { Assembler, Parser, Tokenizer } from "./Assembler";

export const App = () => {
  const [program, setProgram] = useState("hlt");
  const [out, setOut] = useState("");
  const [binOut, setBinOut] = useState<Uint8Array>();

  useEffect(() => {
    setBinOut(undefined);

    try {
      const tokenizer = new Tokenizer(program);

      tokenizer.exec();

      try {
        const parser = new Parser(tokenizer.tokens, program);

        parser.exec();

        try {
          const asm = new Assembler(parser.nodes, program);

          asm.enableInterrupts = true;
          asm.exec();

          const { bin, map } = asm;

          setBinOut(bin);

          let preview: string[] = [];

          if (asm.enableInterrupts) {
            preview.push(`// Interrupts offsets\n`);
          }

          for (let i = 0; i < bin.length; i += 1) {
            while (map[0] && map[0].offset === i) {
              const { at, length } = map.shift()!.node.$map;

              preview.push(`\n// ${i}: ${program.substring(at, at + length)}\n`);
            }

            preview.push(`0x${bin[i].toString(16)}, `);
          }

          setOut(preview.join(""));
        } catch (e) {
          setOut(String(e));
        }
      } catch (e) {
        setOut(String(e));
      }
    } catch (e) {
      setOut(String(e));
    }
  }, [program]);

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, overflow: "hidden", height: "100vh" }}>
      <h1>Single Key Computer</h1>
      <div style={{ display: "flex" }}>
        <button
          style={{ flexGrow: 1 }}
          disabled={!binOut}
          onClick={() => binOut && store.writeROM(binOut).catch(alert)}
        >
          Upload
        </button>
        <button disabled={!binOut} onClick={() => binOut && store.restartVM().catch(alert)}>
          Restart Computer
        </button>
      </div>
      <div style={{ display: "flex", flexGrow: 1, overflow: "hidden", gap: 20 }}>
        <textarea cols={80} value={program} onChange={(e) => setProgram(e.currentTarget.value)}></textarea>
        <textarea readOnly style={{ flexGrow: 1, overflowY: "auto" }} value={out}></textarea>
      </div>
    </main>
  );
};
