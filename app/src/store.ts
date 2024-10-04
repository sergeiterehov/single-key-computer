import * as hooks from "preact/hooks";
import { SKCProtocol } from "./SKCProtocol";

class Store {
  private _subscribers: Array<() => void> = [];

  private _connected = false;

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

            this._connected = false;
            this._emit();

            resolve();
          };

          this._connected = true;
          this._emit();

          const skc = new SKCProtocol(ws);

          // TODO: program
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
