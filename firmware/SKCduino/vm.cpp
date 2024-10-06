#include <Arduino.h>
#include "esp_random.h"

#include "vm.h"

#define MEMSIZE 32000

VMem::VMem() {
  this->_mem = (uint8_t*)malloc(MEMSIZE);
}

uint8_t VMem::read(uint32_t addr) {
  if (addr >= MEMSIZE) return 0;

  return this->_mem[addr];
}

void VMem::write(uint32_t addr, uint8_t data) {
  if (addr >= MEMSIZE) return;

  this->_mem[addr] = data;
}

uint8_t VNoise::read(uint32_t addr) {
  return esp_random();
}

void VNoise::write(uint32_t addr, uint8_t data) {}

void VBus::connect(uint32_t addr_from, uint32_t addr_to, VBusDevice* p_device) {
  VBusSlave* p_slave = new VBusSlave();

  p_slave->addr_from = addr_from;
  p_slave->addr_to = addr_to;
  p_slave->p_device = p_device;

  this->slaves[this->_connected] = p_slave;
  this->_connected += 1;
}

uint8_t VBus::read(uint32_t addr) {
  for (int i = 0; i < this->_connected; i += 1) {
    VBusSlave* p_slave = this->slaves[i];

    if (p_slave->addr_from <= addr && addr <= p_slave->addr_to) {
      return p_slave->p_device->read(addr - p_slave->addr_from);
    }
  }

  return 0;
}

void VBus::write(uint32_t addr, uint8_t data) {
  for (int i = 0; i < this->_connected; i += 1) {
    VBusSlave* p_slave = this->slaves[i];

    if (p_slave->addr_from <= addr && addr <= p_slave->addr_to) {
      return p_slave->p_device->write(addr - p_slave->addr_from, data);
    }
  }
}

void VProc::reset() {
  this->cycles = 0;
  this->int0 = false;
  this->ip = 0x10;
  this->sp = 0;
  this->debug = false;
  this->halt = false;
}

void VProc::clk() {
  this->cycles += 1;

  uint8_t u8;
  uint16_t u16;
  uint32_t u32a;
  uint32_t u32b;

  uint8_t* p_u16 = (uint8_t*)(&u16);
  uint8_t* p_u32a = (uint8_t*)(&u32a);
  uint8_t* p_u32b = (uint8_t*)(&u32b);

  if (this->halt) {
    if (this->int0) {
      this->sp -= 4;
      this->ip = *(uint32_t*)(this->stack + this->sp);
    } else {
      return;
    }
  }

  if (this->int0) {
    *(uint32_t*)(this->stack + this->sp) = this->ip;
    this->sp += 4;

    p_u16[0] = this->bus->read(0x00);
    p_u16[1] = this->bus->read(0x01);

    this->ip = u16;

    this->int0 = false;
    return;
  }

  uint8_t op = this->bus->read(this->ip);

  switch (op) {
    case 0x00:
      // Hlt
      this->halt = true;

      this->ip += 1;
      break;
    case 0x01:
      // Push_IReg
      u8 = this->bus->read(this->ip + 1) & 0b11111;

      *(uint32_t*)(this->stack + this->sp) = this->reg[u8];
      this->sp += 4;

      this->ip += 2;
      break;
    case 0x02:
      // Pop_IReg
      u8 = this->bus->read(this->ip + 1) & 0b11111;

      this->sp -= 4;
      this->reg[u8] = *(uint32_t*)(this->stack + this->sp);

      this->ip += 2;
      break;
    case 0x03:
      // Push_Size_Array
      u8 = this->bus->read(this->ip + 1);

      for (int i = 0; i < u8; i += 1) {
        this->stack[this->sp + i] = this->bus->read(this->ip + 2 + i);
      }
      this->sp += u8;

      this->ip += 2 + u8;
      break;
    case 0x04:
      // Pop_Size
      this->sp -= this->bus->read(this->ip + 1);

      this->ip += 2;
      break;
    case 0x10:
      // Read
      this->sp -= 1;
      u8 = *(uint32_t*)(this->stack + this->sp);  // size

      this->sp -= 4;
      u32a = *(uint32_t*)(this->stack + this->sp);  // addr

      for (int i = 0; i < u8; i += 1) {
        this->stack[this->sp] = this->bus->read(u32a + i);
        this->sp += 1;
      }

      this->ip += 1;
      break;
    case 0x11:
      // Write
      this->sp -= 1;
      u8 = *(uint32_t*)(this->stack + this->sp);  // size

      this->sp -= 4;
      u32a = *(uint32_t*)(this->stack + this->sp);  // addr

      // data
      for (int i = 0; i < u8; i += 1) {
        this->sp -= 1;
        this->bus->write(u32a + i, this->stack[this->sp]);
      }

      this->ip += 1;
      break;
    case 0x20:
      // Jmp_Offset
      p_u16[0] = this->bus->read(this->ip + 1);
      p_u16[1] = this->bus->read(this->ip + 2);

      this->ip += (int16_t)(u16);
      break;
    case 0x21:
      // Jl_Offset
      p_u16[0] = this->bus->read(this->ip + 1);
      p_u16[1] = this->bus->read(this->ip + 2);

      this->sp -= 4;
      u32b = *(uint32_t*)(this->stack + this->sp);
      this->sp -= 4;
      u32a = *(uint32_t*)(this->stack + this->sp);

      if ((int32_t)(u32a) < (int32_t)(u32b)) {
        this->ip += (int16_t)(u16);
      } else {
        this->ip += 3;
      }
      break;
    case 0x30:
      // Add
      this->sp -= 4;
      u32b = *(uint32_t*)(this->stack + this->sp);
      this->sp -= 4;
      u32a = *(uint32_t*)(this->stack + this->sp);

      *(uint32_t*)(this->stack + this->sp) = (int32_t)(u32a) + (int32_t)(u32b);
      this->sp += 4;

      this->ip += 1;
      break;
    case 0x31:
      // Mul
      this->sp -= 4;
      u32b = *(uint32_t*)(this->stack + this->sp);
      this->sp -= 4;
      u32a = *(uint32_t*)(this->stack + this->sp);

      *(uint32_t*)(this->stack + this->sp) = (int32_t)(u32a) * (int32_t)(u32b);
      this->sp += 4;

      this->ip += 1;
      break;
    case 0xFF:
      // Debug
      this->debug = true;

      this->ip += 1;
      break;
    default:
      this->ip += 1;
  }
}
