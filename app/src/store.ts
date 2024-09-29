import * as hooks from "preact/hooks";
import { LEDs, SKCProtocol } from "./SKCProtocol";
import { lifeContext } from "./Life";

class Store {
  private _subscribers: Array<() => void> = [];

  private _connected = false;
  private _grid: number[][] = [];

  private _emit() {
    for (const s of this._subscribers) s();
  }

  private async _connectionLoop() {
    while (true) {
      await new Promise<void>((resolve) => {
        const ws = new WebSocket("/ws");

        ws.onerror = () => {
          resolve();
        };

        ws.onopen = () => {
          ws.onclose = () => {
            skc.destroy();

            lifeContext.onDraw = () => null;

            this._connected = false;
            this._emit();

            resolve();
          };

          this._connected = true;
          this._emit();

          const skc = new SKCProtocol(ws);

          skc.onButtonChange = (presses) => {
            if (!presses) return;

            lifeContext.randomize();
          };

          lifeContext.onDraw = (grid) => {
            const videoBuffer = new Array<number>(LEDs);
            const resolution = Math.sqrt(LEDs);

            for (let row = 0; row < resolution; row++) {
              for (let col = 0; col < resolution; col++) {
                const cell = grid[row][col];

                videoBuffer[row * resolution + col] = cell ? 32 : 0;
              }
            }

            skc.writeGrayscaleDisplay(videoBuffer);

            this._grid = [...grid];
            this._emit();
          };
        };
      });

      await new Promise<void>((resolve) => setTimeout(resolve, 5000));
    }
  }

  constructor() {
    this._connectionLoop();
  }

  get connected() {
    return this._connected;
  }

  get grid() {
    return this._grid;
  }

  subscribe(cb: () => void) {
    this._subscribers.push(cb);

    return () => {
      this._subscribers.splice(this._subscribers.indexOf(cb), 1);
    };
  }
}

export const store = new Store();

export function useStore<T>(getter: (store: Store) => T) {
  const [value, setValue] = hooks.useState(getter(store));

  hooks.useLayoutEffect(() => store.subscribe(() => setValue(getter(store))), []);

  return value;
}
