#include <Arduino.h>
#include <Adafruit_NeoPixel.h>

#include "vm.h"

#define PIN_LED 16
#define NUMPIXELS 64

Adafruit_NeoPixel neo(NUMPIXELS, PIN_LED, NEO_GRB + NEO_KHZ800);

struct Pixel24 {
  uint8_t b;
  uint8_t g;
  uint8_t r;
};

struct VideoMeta {
  uint8_t mode;
  uint8_t brightness;
  uint8_t b;
  uint8_t g;
  uint8_t r;
};

class Video : public VBusDevice {
private:
  uint8_t* _mem;
  struct VideoMeta* _p_meta;
  int _memsize;

  unsigned long _await;

public:
  Video() {
    this->_memsize = NUMPIXELS * sizeof(Pixel24) + sizeof(VideoMeta);
    this->_mem = (uint8_t*)calloc(this->_memsize, 1);
    this->_p_meta = (struct VideoMeta*)(this->_mem + NUMPIXELS * sizeof(Pixel24));

    this->_await = 0;
  }

  void begin() {
    neo.begin();
    neo.clear();
    neo.show();
  }

  void loop() {
    unsigned long now = millis();

    if (now < this->_await) return;

    this->_await = now + 40;

    struct Pixel24* pixels = (struct Pixel24*)(this->_mem);

    for (int i = 0; i < NUMPIXELS; i += 1) {
      neo.setPixelColor(i, neo.Color(pixels[i].r, pixels[i].g, pixels[i].b));
      // rgbLedWrite(PIN_LED, pixels[i].r, pixels[i].g, pixels[i].b);
    }

    neo.show();
  }

  uint8_t read(uint32_t addr) {
    if (addr >= this->_memsize) return 0;

    return this->_mem[addr];
  }

  void write(uint32_t addr, uint8_t data) {
    if (addr >= this->_memsize) return;

    this->_mem[addr] = data;
  }
};
