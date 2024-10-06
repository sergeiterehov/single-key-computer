#ifndef VM_H
#define VM_H

#include <Arduino.h>

class VBusDevice {
public:
  virtual uint8_t read(uint32_t addr) = 0;
  virtual void write(uint32_t addr, uint8_t data) = 0;
};

class VMem : public VBusDevice {
private:
  uint8_t* _mem;

public:
  VMem();

  uint8_t read(uint32_t addr);
  void write(uint32_t addr, uint8_t data);
};

class VNoise : public VBusDevice {
public:
  uint8_t read(uint32_t addr);
  void write(uint32_t addr, uint8_t data);
};

class VBusSlave {
public:
  uint32_t addr_from;
  uint32_t addr_to;

  VBusDevice* p_device;
};

class VBus : public VBusDevice {
private:
  int _connected;

public:
  VBusSlave* slaves[16];

  void connect(uint32_t addr_from, uint32_t addr_to, VBusDevice* p_device);

  uint8_t read(uint32_t addr);
  void write(uint32_t addr, uint8_t data);
};

class VProc {
public:
  VBus* bus;

  uint32_t cycles;
  bool halt;
  bool debug;

  bool int0;

  uint32_t ip;
  uint32_t sp;

  uint8_t stack[256 * sizeof(int)];
  uint32_t reg[32];

  void reset();

  void clk();
};

#endif