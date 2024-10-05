#include "vm.h"
#include "rom.h"
#include "video.h"

VMem mem;
VNoise noize;
Video video;
VBus bus;
VProc proc;

uint32_t pack_int(uint8_t b1, uint8_t b2, uint8_t b3, uint8_t b4) {
  return b4 << 24 | b3 << 16 | b2 << 8 | b1;
}

void setup() {
  Serial.begin(115200);
  video.begin();

  sleep(1);  // TODO: remove

  bus.connect(0x00000, 0x07CFF, &mem);
  bus.connect(0x10000, 0x1ffff, &video);
  bus.connect(0x50000, 0x50003, &noize);
  proc.bus = &bus;

  for (int i = 0; i < sizeof(rom); i += 4) {
    mem.write(i, pack_int(rom[i], rom[i + 1], rom[i + 2], rom[i + 3]));
  }
}

void loop() {
  if (!proc.halt) {
    proc.clk();
  }

  if (proc.debug) {
    proc.debug = false;

    Serial.print("CYCLES=");
    Serial.print(proc.cycles);
    Serial.print(" IP=");
    Serial.print(proc.ip);
    Serial.print(" SP=");
    Serial.print(proc.sp);
    Serial.print(" REGs=[");
    for (int i = 0; i < 6; i += 1) {
      Serial.print(proc.reg[i], HEX);
      Serial.print(", ");
    }
    Serial.print("] STACK=[");
    for (int i = 0; i < 8; i += 1) {
      Serial.print(proc.stack[i], HEX);
      Serial.print(", ");
    }
    Serial.println("]");
  }

  // sleep(1);
}