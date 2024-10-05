#include <Arduino.h>
#include <Adafruit_NeoPixel.h>

#include "vm.h"

#define PIN_LED 16
#define NUMPIXELS 64

Adafruit_NeoPixel neo(NUMPIXELS, PIN_LED, NEO_GRB + NEO_KHZ800);

struct Pixel {
  uint8_t b;
  uint8_t g;
  uint8_t r;
  uint8_t a;
};

class Video : public VBusDevice {
private:
  uint8_t* _mem;

  Adafruit_NeoPixel* _neo;

  void show() {
    struct Pixel* pixels = (struct Pixel*)(_mem + sizeof(uint32_t));

    for (int i = 0; i < NUMPIXELS; i += 1) {
      neo.setPixelColor(i, neo.Color(pixels[i].r, pixels[i].g, pixels[i].b));
    }

    neo.show();
  }
public:
  Video() {
    this->_mem = (uint8_t*)calloc((1 + NUMPIXELS), sizeof(uint32_t));
  }

  void begin() {
    neo.begin();
    neo.clear();
    neo.show();
  }

  uint32_t read(uint32_t addr) {
    return *(uint32_t*)(this->_mem + addr);
  }

  void write(uint32_t addr, uint32_t data) {
    *(uint32_t*)(this->_mem + addr) = data;
    this->show();
  }
};
