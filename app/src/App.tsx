import { useStore } from "./store";

export const App = () => {
  const connected = useStore((s) => s.connected);
  const grid = useStore((s) => s.grid);

  return (
    <main>
      <h1>Single Key Computer</h1>
      <div>{connected ? "Connected!" : "Connecting..."}</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {grid.map((r, ri) => (
          <div key={ri} style={{ display: "flex", flexDirection: "row" }}>
            {r.map((c, ci) => (
              <div key={ci} style={{ width: 32, height: 32, backgroundColor: c ? "white" : "black" }} />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
};
