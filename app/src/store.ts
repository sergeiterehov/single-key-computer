import { useLayoutEffect, useState } from "preact/hooks";

class Observable {
  private _subscribers: Array<() => void> = [];

  protected _emit() {
    for (const s of this._subscribers) s();
  }

  subscribe(cb: () => void) {
    this._subscribers.push(cb);

    return () => {
      this._subscribers.splice(this._subscribers.indexOf(cb), 1);
    };
  }
}

class Store extends Observable {
  private _noise: number = -1;

  constructor() {
    super();

    this._emit();

    this._pingLoop();
  }

  private async _pingLoop() {
    try {
      const [byte] = await this.readBus(0x51000, 1);

      if (byte === undefined) return;

      this._noise = byte;
      this._emit();
    } finally {
      setTimeout(() => this._pingLoop(), 5000);
    }
  }

  get noise() {
    return this._noise;
  }

  async resetProc() {
    const res = await fetch("/proc/reset", { method: "POST" });
    const data = new Uint8Array(await res.arrayBuffer());

    return data;
  }

  async readBus(addr: number, size: number) {
    const res = await fetch("/bus/read", {
      method: "POST",
      body: new Uint8Array([addr & 0xff, (addr >> 8) & 0xff, (addr >> 16) & 0xff, size]),
    });
    const data = new Uint8Array(await res.arrayBuffer());

    return data;
  }

  async writeBus(addr: number, bin: Uint8Array) {
    const res = await fetch("/bus/write", {
      method: "POST",
      body: new Uint8Array([addr & 0xff, (addr >> 8) & 0xff, (addr >> 16) & 0xff, ...bin]),
    });
    const data = new Uint8Array(await res.arrayBuffer());

    return data;
  }

  async deleteROM() {
    const res = await fetch("/rom/delete", { method: "POST" });
    const data = new Uint8Array(await res.arrayBuffer());

    return data;
  }

  async writeROM(bin: Uint8Array) {
    const res = await fetch("/rom/write", { method: "POST", body: bin });
    const data = new Uint8Array(await res.arrayBuffer());

    return data;
  }

  async writeIndexHTML(file: string) {
    const res = await fetch("/", { method: "POST", body: file });
    const data = new Uint8Array(await res.arrayBuffer());

    return data;
  }
}

export const store = new Store();

(window as any).__store = store;

export function useStore<T>(getter: (store: Store) => T) {
  const [value, setValue] = useState(getter(store));

  useLayoutEffect(() => store.subscribe(() => setValue(getter(store))), []);

  return value;
}
