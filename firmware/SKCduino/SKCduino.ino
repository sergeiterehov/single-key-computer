#define PIN_ZERO_BTN 37
#define PIN_BTN 39
#define PIN_LED 16
#define NUMPIXELS 64

#include <WiFi.h>

#include <FS.h>
#include <LittleFS.h>

#include "vm.h"
#include "video.h"
#include "keyboard.h"

const char* ssid = "SingleKeyComputer";
const char* password = "SuperHardPassword123";

WiFiServer server(80);

VMem mem;
VNoise noise;
Video video;
Keyboard keyboard;
VBus bus;
VProc proc;

void setup() {
  // Init components
  Serial.begin(115200);
  Serial.println("Single Key Computer!");

  // Keyboard
  Serial.print("Keyboard...");
  keyboard.begin();
  Serial.println(keyboard.state ? "[PRESSED]" : "[OK]");

  if (keyboard.state) {
    sleep(1);
  }

  // FS
  Serial.print("Mounting FS...");
  if (!LittleFS.begin(true)) {
    Serial.println("[FAIL]");
  } else {
    Serial.println("[OK]");
  }

  if (keyboard.state) {
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
  }

  // Video
  Serial.print("Starting video...");
  video.begin();
  Serial.println("[OK]");

  // Building computer
  Serial.print("Building virtual computer...");
  bus.connect(0x00000, 0x07CFF, &mem);
  bus.connect(0x50000, 0x50fff, &video);
  bus.connect(0x51000, 0x51fff, &noise);
  bus.connect(0x52000, 0x52fff, &keyboard);
  proc.bus = &bus;
  Serial.println("[OK] video@0x50000, noise@0x51000, keyboad@0x52000");

  // Loading program
  load_rom();

  // Reset proc
  proc.reset();

  Serial.println("Initialized!");
}

void loop() {
  server_loop();
  emulator_loop();
}

void vm_restart() {
  proc.reset();
  video.reset(true);
  load_rom();
}

bool load_rom() {
  Serial.print("Loading ROM program...");

  File file = LittleFS.open("/rom");

  if (!file) {
    Serial.println("[FAIL] not opened");
    return false;
  }

  for (int i = 0; file.available(); i += 1) {
    mem.write(i, file.read());
  }

  Serial.print("[OK] size=0x");
  Serial.println(file.size(), HEX);

  file.close();

  return true;
}

void emulator_loop() {
  bool btn_trans = keyboard.update();

  if (btn_trans) {
    proc.interrupts |= 1 << 0;
  }

  proc.clk();

  if (proc.debug) {
    proc.debug = false;

    Serial.print("CYCLES=");
    Serial.print(proc.cycles);
    if (proc.interrupted) {
      Serial.print(" [INT]");
    }
    Serial.print(" IP=");
    Serial.print(proc.reg[REG_IP], HEX);
    Serial.print(" REGs=[");
    for (int i = 0; i < 6; i += 1) {
      Serial.print(proc.reg[i], HEX);
      Serial.print(", ");
    }
    Serial.print("...]");
    Serial.print(" SP=");
    Serial.print(proc.reg[REG_SP], HEX);
    Serial.println();
  }

  video.loop();

  // delay(200);
}

void server_loop() {
  static uint8_t buf[512];

  WiFiClient client = server.available();

  if (!client) {
    return;
  }

  String header;
  String currentLine;

  Serial.println("New Client.");

  while (client.connected()) {
    if (!client.available()) {
      continue;
    }

    char c = client.read();

    Serial.write(c);
    header += c;

    if (c == '\r') continue;

    if (c == '\n') {
      if (currentLine.length() > 0) {
        currentLine = "";
        continue;
      }

      break;
    }

    currentLine += c;
  }

  // turns the GPIOs on and off
  if (header.indexOf("POST /vm/restart ") == 0) {
    Serial.println("Proc reset");

    vm_restart();

    client.println("HTTP/1.1 200 OK");
    client.println("Content-type: binary/octet-stream");
    client.println("Connection: close");
    client.println();
  } else if (header.indexOf("POST /proc/reset ") == 0) {
    Serial.println("Proc reset");

    proc.reset();

    client.println("HTTP/1.1 200 OK");
    client.println("Content-type: binary/octet-stream");
    client.println("Connection: close");
    client.println();
  } else if (header.indexOf("POST /bus/write ") == 0) {
    Serial.println("Bus write");

    uint32_t addr = client.read();
    addr += client.read() << 8;
    addr += client.read() << 16;

    for (int i = 0; client.available(); i += 1) {
      uint8_t b = client.read();

      bus.write(addr + i, b);
    }

    client.println("HTTP/1.1 200 OK");
    client.println("Content-type: text/html");
    client.println("Connection: close");
    client.println();
  } else if (header.indexOf("POST /bus/read ") == 0) {
    Serial.println("Bus read");

    uint32_t addr = client.read();
    addr += client.read() << 8;
    addr += client.read() << 16;

    uint8_t size = client.read();

    client.println("HTTP/1.1 200 OK");
    client.println("Content-type: binary/octet-stream");
    client.println("Connection: close");
    client.println();

    for (int i = 0; i < size; i += 1) {
      client.write(bus.read(addr + i));
    }
  } else if (header.indexOf("POST /rom/load ") == 0) {
    Serial.println("ROM load");

    load_rom();

    client.println("HTTP/1.1 200 OK");
    client.println("Content-type: text/html");
    client.println("Connection: close");
    client.println();
  } else if (header.indexOf("POST /rom/delete ") == 0) {
    Serial.println("ROM delete");

    LittleFS.remove("/rom");

    client.println("HTTP/1.1 200 OK");
    client.println("Content-type: text/html");
    client.println("Connection: close");
    client.println();
  } else if (header.indexOf("POST /rom/write ") == 0) {
    Serial.println("ROM write");

    File file = LittleFS.open("/rom", FILE_WRITE);

    while (client.available()) {
      file.write(buf, client.read(buf, 512));
    }

    file.close();

    client.println("HTTP/1.1 200 OK");
    client.println("Content-type: text/html");
    client.println("Connection: close");
    client.println();
  } else if (header.indexOf("POST /index.html ") == 0) {
    Serial.println("Write index.html");

    File file = LittleFS.open("/index.html", FILE_WRITE);

    while (client.available()) {
      file.write(buf, client.read(buf, 512));
    }

    file.close();

    client.println("HTTP/1.1 200 OK");
    client.println("Content-type: text/html");
    client.println("Connection: close");
    client.println();
  } else {
    Serial.println("Some HTTP Request");

    File file = LittleFS.open("/index.html");

    if (file) {
      Serial.println("Using index.html from FS");

      while (file.available()) {
        client.write(buf, file.read(buf, 512));
      }

      file.close();
    } else {
      client.println("HTTP/1.1 200 OK");
      client.println("Content-type: text/html");
      client.println("Connection: close");
      client.println();
      client.println("<!DOCTYPE html><html>");
      client.println("<head><link rel=\"icon\" href=\"data:,\">");
      client.println("<body><h1>Single Key Computer</h1>use POST method to save custom page</body></html>");
      client.println();
    }
  }

  // Clear
  header = "";
  currentLine = "";
  client.stop();
  Serial.println("Client disconnected.");
}