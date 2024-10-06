#include <WiFi.h>

#include "vm.h"
#include "rom.h"
#include "video.h"

const char* ssid = "SingleKeyComputer";
const char* password = "SuperHardPassword123";

// Set web server port number to 80
WiFiServer server(80);

VMem mem;
VNoise noise;
Video video;
VBus bus;
VProc proc;

void setup() {
  // Init components
  Serial.begin(115200);

  sleep(1);  // TODO: remove

  Serial.println("Single Key Computer!");

  // AP
  Serial.print("Creating AP...");
  WiFi.softAP(ssid, password);
  Serial.print("[OK] IP=");
  IPAddress IP = WiFi.softAPIP();
  Serial.println(IP);

  // Server
  Serial.print("Starting server...");
  server.begin();
  Serial.println("[OK] port=80");

  // Video
  Serial.print("Starting video...");
  video.begin();
  Serial.println("[OK]");

  // Building computer
  Serial.print("Building virtual computer...");
  bus.connect(0x00000, 0x07CFF, &mem);
  bus.connect(0x50000, 0x50fff, &video);
  bus.connect(0x51000, 0x51fff, &noise);
  proc.bus = &bus;
  Serial.println("[OK] video@0x50000, noise@0x51000");

  // Loading program
  Serial.print("Loading program...");
  for (int i = 0; i < sizeof(rom); i += 1) {
    mem.write(i, rom[i]);
  }
  Serial.print("[OK] size=0x");
  Serial.println(sizeof(rom), HEX);

  Serial.println("Initialized!");
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
    Serial.print("...] STACK=[");
    for (int i = 0; i < proc.sp && i < 8; i += 1) {
      Serial.print(proc.stack[i], HEX);
      Serial.print(", ");
    }
    Serial.println("...]");
  }

  video.loop();

  // delay(200);
}