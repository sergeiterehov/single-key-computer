#include <Arduino.h>
#include "esp_random.h"

#include "vm.h"

VMem::VMem() {
  this->_mem = (uint8_t*)malloc(32000);
}

uint32_t VMem::read(uint32_t addr) {
  return *(uint32_t*)(this->_mem + addr);
}

void VMem::write(uint32_t addr, uint32_t data) {
  *(uint32_t*)(this->_mem + addr) = data;
}

uint32_t VNoise::read(uint32_t addr) {
  return esp_random() >> (addr * 8);
}

void VNoise::write(uint32_t addr, uint32_t data) {}

void VBus::connect(uint32_t addr_from, uint32_t addr_to, VBusDevice* p_device) {
  VBusSlave* p_slave = new VBusSlave();

  p_slave->addr_from = addr_from;
  p_slave->addr_to = addr_to;
  p_slave->p_device = p_device;

  this->slaves[this->_connected] = p_slave;
  this->_connected += 1;
}

uint32_t VBus::read(uint32_t addr) {
  for (int i = 0; i < this->_connected; i += 1) {
    VBusSlave* p_slave = this->slaves[i];

    if (p_slave->addr_from <= addr && addr <= p_slave->addr_to) {
      return p_slave->p_device->read(addr - p_slave->addr_from);
    }
  }

  return 0;
}

void VBus::write(uint32_t addr, uint32_t data) {
  for (int i = 0; i < this->_connected; i += 1) {
    VBusSlave* p_slave = this->slaves[i];

    if (p_slave->addr_from <= addr && addr <= p_slave->addr_to) {
      return p_slave->p_device->write(addr - p_slave->addr_from, data);
    }
  }
}

void VProc::clk() {
  this->cycles += 1;

  uint32_t buf = this->bus->read(this->ip);
  uint8_t* buf_bytes = (uint8_t*)(&buf);

  uint8_t op = buf_bytes[0];

  uint8_t arg_reg;
  uint32_t arg_u32;
  int16_t arg_i16;

  int32_t u32a;
  int32_t u32b;

  switch (op) {
    case 0x00:
      // Hlt
      this->halt = true;

      this->ip += 1;
      break;
    case 0x01:
      // Push_IReg
      arg_reg = buf_bytes[1] & 0b11111;

      *(uint32_t*)(this->stack + this->sp) = this->reg[arg_reg];
      this->sp += 4;

      this->ip += 2;
      break;
    case 0x02:
      // Push_Int
      *(uint32_t*)(this->stack + this->sp) = this->bus->read(this->ip + 1);
      this->sp += 4;

      this->ip += 5;
      break;
    case 0x03:
      // Pop_IReg
      arg_reg = buf_bytes[1] & 0b11111;

      this->sp -= 4;
      this->reg[arg_reg] = *(uint32_t*)(this->stack + this->sp);

      this->ip += 2;
      break;
    case 0x04:
      // Add
      this->sp -= 4;
      u32b = *(uint32_t*)(this->stack + this->sp);
      this->sp -= 4;
      u32a = *(uint32_t*)(this->stack + this->sp);

      *(uint32_t*)(this->stack + this->sp) = u32a + u32b;
      this->sp += 4;

      this->ip += 1;
      break;
    case 0x05:
      // Mul
      this->sp -= 4;
      u32b = *(uint32_t*)(this->stack + this->sp);
      this->sp -= 4;
      u32a = *(uint32_t*)(this->stack + this->sp);

      *(uint32_t*)(this->stack + this->sp) = u32a * u32b;
      this->sp += 4;

      this->ip += 1;
      break;
    case 0x06:
      // Jl_Offset
      this->sp -= 4;
      u32b = *(uint32_t*)(this->stack + this->sp);
      this->sp -= 4;
      u32a = *(uint32_t*)(this->stack + this->sp);

      if (u32a < u32b) {
        this->ip += *(int16_t*)(buf_bytes + 1);
      } else {
        this->ip += 3;
      }
      break;
    case 0x07:
      // Read
      this->sp -= 4;
      u32a = *(uint32_t*)(this->stack + this->sp);  // addr

      *(uint32_t*)(this->stack + this->sp) = this->bus->read(u32a);
      this->sp += 4;

      this->ip += 1;
      break;
    case 0x08:
      // Write
      this->sp -= 4;
      u32a = *(uint32_t*)(this->stack + this->sp);  // addr

      this->sp -= 4;
      u32b = *(uint32_t*)(this->stack + this->sp);  // data

      this->bus->write(u32a, u32b);

      this->ip += 1;
      break;
    case 0x09:
      // Jmp_Offset
      this->ip += *(int16_t*)(buf_bytes + 1);
      break;
    case 0x0A:
      // Debug
      this->debug = true;

      this->ip += 1;
      break;
    default:
      this->ip += 1;
  }
}
