#pragma once

#ifdef ARDUINO
#include <Arduino.h>
#else
#include <iostream>
#endif

#define PROC_REGS_NUMBER 32
#define BUS_CAPACITY 16

#define REG_IP 31
#define REG_SP 30
#define REG_EI 29

#define OP_HLT 0x00
#define OP_PUSH_Reg8 0x01
#define OP_POP_Reg8 0x02
#define OP_PUSH_Size8_Array 0x03
#define OP_POP_Size8 0x04
#define OP_READ 0x10
#define OP_WRITE 0x11
#define OP_JMP_Address32 0x20
#define OP_JIF_Address32 0x21
#define OP_JELSE_Address32 0x22
#define OP_ADD 0x30
#define OP_SUB 0x31
#define OP_MUL 0x32
#define OP_DIV 0x33
#define OP_MOD 0x34
#define OP_AND 0x35
#define OP_OR 0x36
#define OP_NOT 0x37
#define OP_EQ 0x38
#define OP_GT 0x39
#define OP_LT 0x3a
#define OP_DISABLE_Index8 0xf0
#define OP_ENABLE_Index8 0xf1
#define OP_DEBUG 0xff

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
  VBusSlave* slaves[BUS_CAPACITY];

  void connect(uint32_t addr_from, uint32_t addr_to, VBusDevice* p_device);

  uint8_t read(uint32_t addr);
  void write(uint32_t addr, uint8_t data);
};

class VProc {
private:
  void read(uint32_t addr, uint8_t size, void *to_p);

  void stack_push(uint8_t size, void *from_p);
  void stack_pop(uint8_t size, void *to_p);

public:
  VBus* bus;

  uint32_t cycles;

  bool halt;
  bool interrupted;
  bool debug;

  uint8_t interrupts;

  uint32_t reg[PROC_REGS_NUMBER];

  void reset();

  void clk();
};
