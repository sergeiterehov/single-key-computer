#include <Arduino.h>

#include "vm.h"

class Keyboard : public VBusDevice {
private:
  int _prev;
public:
  int state;

  void begin() {
    pinMode(PIN_ZERO_BTN, INPUT_PULLDOWN);
    pinMode(PIN_BTN, INPUT_PULLUP);

    this->update();
    this->_prev = this->state;
  }

  bool update() {
    this->state = !digitalRead(PIN_BTN);

    bool changed = this->_prev != this->state;

    this->_prev = this->state;

    return changed;
  }

  uint8_t read(uint32_t addr) {
    return this->state;
  }

  void write(uint32_t addr, uint8_t data) {}
};
