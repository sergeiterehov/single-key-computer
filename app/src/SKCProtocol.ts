export const LEDs = 64;

export class SKCProtocol {
  public onButtonChange?: (pressed: boolean) => void;
  public onPing?: () => void;

  constructor(private _ws: WebSocket) {
    this._ws.addEventListener("message", this._handleMessage);
  }

  private _handleMessage = async (e: MessageEvent<Blob>) => {
    const buffer = await e.data.arrayBuffer();
    const data = new Uint8Array(buffer);

    switch (data[0]) {
      case "b".charCodeAt(0):
        this.onButtonChange?.(!data[1]);
        break;
      case "^".charCodeAt(0):
        this.onPing?.();
        break;
      default:
        // Unknown event
        break;
    }
  };

  destroy() {
    this._ws.removeEventListener("message", this._handleMessage);
  }

  /**
   * @param pixels bit[]
   */
  writeBinaryDisplay(pixels: number[]) {
    const bytes: number[] = new Array(Math.ceil(LEDs / 8)).fill(0);

    for (let i = 0; i < LEDs; i += 1) {
      bytes[(i / 8) >>> 0] |= pixels[i] ? 1 : 0;
    }

    bytes.unshift("B".charCodeAt(0));

    this._ws.send(Uint8Array.from(bytes));
  }

  /**
   * @param pixels brightness[]
   */
  writeGrayscaleDisplay(pixels: number[]) {
    const bytes: number[] = new Array(LEDs).fill(0);

    for (let i = 0; i < LEDs; i += 1) {
      bytes[i] = Math.max(0, Math.min(255, Number(pixels[i]) || 0));
    }

    bytes.unshift("M".charCodeAt(0));

    this._ws.send(Uint8Array.from(bytes));
  }

  /**
   * @param pixels [R, G, B][]
   */
  writeColor256Display(pixels: number[][]) {
    const bytes: number[] = new Array(LEDs).fill(0);

    for (let i = 0; i < LEDs; i += 1) {
      const r = Math.max(0, Math.min(255, Number(pixels[i][0]) || 0));
      const g = Math.max(0, Math.min(255, Number(pixels[i][1]) || 0));
      const b = Math.max(0, Math.min(255, Number(pixels[i][2]) || 0));

      // 0bRGBGBRGB
      bytes[i] = (r & 0b10000100) | ((g >> 1) & 0b01010010) | ((b >> 2) & 0b00101001);
    }

    bytes.unshift("C".charCodeAt(0));

    this._ws.send(Uint8Array.from(bytes));
  }

  /**
   * @param pixels [R, G, B][]
   */
  writeTrueColorDisplay(pixels: number[][]) {
    const bytes: number[] = new Array(LEDs * 3).fill(0);

    for (let i = 0; i < LEDs; i += 1) {
      const r = Math.max(0, Math.min(255, Number(pixels[i][0]) || 0));
      const g = Math.max(0, Math.min(255, Number(pixels[i][1]) || 0));
      const b = Math.max(0, Math.min(255, Number(pixels[i][2]) || 0));

      bytes[i * 3] = r;
      bytes[i * 3 + 1] = g;
      bytes[i * 3 + 2] = b;
    }

    bytes.unshift("T".charCodeAt(0));

    this._ws.send(Uint8Array.from(bytes));
  }

  eraseRAM() {
    this._ws.send(Uint8Array.from(["u".charCodeAt(0)]));
  }

  /**
   * @param chunk byte[]
   */
  appendRAM(chunk: number[]) {
    const bytes: number[] = [];

    for (const byte of chunk) {
      bytes.push(byte);
    }

    bytes.unshift("U".charCodeAt(0));

    this._ws.send(Uint8Array.from(bytes));
  }
}
