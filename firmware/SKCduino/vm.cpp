#include "vm.h"

#ifdef ARDUINO
#include "esp_random.h"
#define vm_random esp_random()
#else
#define vm_random 42
#endif

#ifndef MEMSIZE
#define MEMSIZE 32000
#endif

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
  return vm_random;
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
  this->interrupted = false;
  this->interrupts = 0;
  this->debug = false;
  this->halt = false;
  
  for (int i = 0; i < PROC_REGS_NUMBER; i++) {
    this->reg[i] = 0;
  }

  this->reg[REG_IP] = 0x100;
  this->reg[REG_SP] = 0x7000;
}

void VProc::read(uint32_t addr, uint8_t size, void *to_p) {
  for (int i = 0; i < size; i++) {
    ((uint8_t*)(to_p))[i] = this->bus->read(addr + i);
  }
}

void VProc::stack_push(uint8_t size, void *from_p) {
  for (int i = 0; i < size; i++) {
    this->bus->write(this->reg[REG_SP]++, ((uint8_t*)(from_p))[i]);
  }
}

void VProc::stack_pop(uint8_t size, void *to_p) {
  for (int i = size - 1; i >= 0; i--) {
    ((uint8_t*)(to_p))[i] = this->bus->read(--this->reg[REG_SP]);
  }
}

void VProc::clk() {
  this->cycles += 1;

  uint32_t* ip = &this->reg[REG_IP];
  uint32_t* sp = &this->reg[REG_SP];
  uint32_t* ei = &this->reg[REG_EI];

  uint8_t u8a;
  uint8_t u8b;
  uint8_t u8c;
  uint32_t u32a;
  uint32_t u32b;
  uint32_t u32c;

  uint8_t* p_u32a = (uint8_t*)(&u32a);
  uint8_t* p_u32b = (uint8_t*)(&u32b);
  uint8_t* p_u32c = (uint8_t*)(&u32c);

  if (!this->interrupted) {
    uint8_t interrupts = this->interrupts;
    int int_number = 0;

    if (interrupts & 0b1 && *ei & 0b1) {
      int_number = 1;
    } else if (interrupts & 0b10 && *ei & 0b10) {
      int_number = 2;
    } else if (interrupts & 0b100 && *ei & 0b100) {
      int_number = 3;
    } else if (interrupts & 0b1000 && *ei & 0b1000) {
      int_number = 4;
    } else if (interrupts & 0b10000 && *ei & 0b10000) {
      int_number = 5;
    } else if (interrupts & 0b100000 && *ei & 0b100000) {
      int_number = 6;
    } else if (interrupts & 0b1000000 && *ei & 0b1000000) {
      int_number = 7;
    } else if (interrupts & 0b10000000 && *ei & 0b10000000) {
      int_number = 8;
    }

    if (int_number) {
      int_number -= 1;

      this->interrupts &= ~(1 << int_number);

      this->stack_push(4, ip);
      this->read(int_number * 4, 4, ip);

      this->interrupted = true;
      this->halt = false;

      return;
    }
  }

  if (this->halt) {
    return;
  }

  uint8_t op = this->bus->read(*ip);

  switch (op) {
    case OP_HLT:
      if (this->interrupted) {
        this->stack_pop(4, ip);

        this->interrupted = false;
        this->halt = false;
      } else {
        this->halt = true;

        *ip += 1;
      }
      break;
    case OP_PUSH_Reg8:
      u8a = this->bus->read(*ip + 1) & 0b11111;

      u32a = this->reg[u8a];
      this->stack_push(4, &u32a);

      *ip += 2;
      break;
    case OP_POP_Reg8:
      u8a = this->bus->read(*ip + 1) & 0b11111;

      this->stack_pop(4, &u32a);
      this->reg[u8a] = u32a;

      *ip += 2;
      break;
    case OP_PUSH_Size8_Array:
      u8a = this->bus->read(*ip + 1);

      for (int i = 0; i < u8a; i += 1) {
        u8b = this->bus->read(*ip + 2 + i);
        this->stack_push(1, &u8b);
      }

      *ip += 2 + u8a;
      break;
    case OP_POP_Size8:
      *sp -= this->bus->read(*ip + 1);

      *ip += 2;
      break;
    case OP_READ:
      this->stack_pop(1, &u8a); // size
      this->stack_pop(4, &u32a); // addr

      for (int i = 0; i < u8a; i += 1) {
        u8b = this->bus->read(u32a + i);
        this->stack_push(1, &u8b);
      }

      *ip += 1;
      break;
    case OP_WRITE:
      this->stack_pop(1, &u8a); // size
      this->stack_pop(4, &u32a); // addr

      // data
      for (int i = u8a - 1; i >= 0; i -= 1) {
        this->stack_pop(1, &u8b);
        this->bus->write(u32a + i, u8b);
      }

      *ip += 1;
      break;
    case OP_JMP_Address32:
    case OP_JIF_Address32:
    case OP_JELSE_Address32:
      this->read(*ip + 1, 4, &u32a);

      if (op == OP_JMP_Address32) {
        *ip = u32a;
      } else {
        this->stack_pop(1, &u8a);

        if (op == OP_JIF_Address32 && u8a != 0 || op == OP_JELSE_Address32 && u8a == 0) {
          *ip = u32a;
        } else {
          *ip += 5;
        }
      }

      break;
    case OP_ADD:
    case OP_SUB:
    case OP_MUL:
    case OP_DIV:
    case OP_MOD:
      this->stack_pop(4, &u32b);
      this->stack_pop(4, &u32a);

      switch (op) {
        case OP_ADD:
          u32c = (int32_t)(u32a) + (int32_t)(u32b);
          break;
        case OP_SUB:
          u32c = (int32_t)(u32a) - (int32_t)(u32b);
          break;
        case OP_MUL:
          u32c = (int32_t)(u32a) * (int32_t)(u32b);
          break;
        case OP_DIV:
          u32c = (int32_t)(u32a) / (int32_t)(u32b);
          break;
        case OP_MOD:
          u32c = (int32_t)(u32a) % (int32_t)(u32b);
          break;
      }

      this->stack_push(4, &u32c);

      *ip += 1;
      break;
    case OP_EQ:
    case OP_GT:
    case OP_LT:
      this->stack_pop(4, &u32b);
      this->stack_pop(4, &u32a);

      switch (op) {
        case OP_EQ:
          u8c = (int32_t)(u32a) == (int32_t)(u32b);
          break;
        case OP_GT:
          u8c = (int32_t)(u32a) > (int32_t)(u32b);
          break;
        case OP_LT:
          u8c = (int32_t)(u32a) < (int32_t)(u32b);
          break;
      }

      this->stack_push(1, &u8c);

      *ip += 1;
      break;
    case OP_AND:
    case OP_OR:
      this->stack_pop(1, &u8b);
      this->stack_pop(1, &u8a);

      switch (op) {
        case OP_AND:
          u8c = u8a & u8b;
          break;
        case OP_GT:
          u8c = u8a | u8b;
          break;
      }

      this->stack_push(1, &u8c);

      *ip += 1;
      break;
    case OP_NOT:
      this->stack_pop(1, &u8a);

      u8a = ~u8a;
      this->stack_push(1, &u8a);

      *ip += 1;
      break;
    case OP_DEBUG:
      this->debug = true;

      *ip += 1;
      break;
    default:
      *ip += 1;
  }
}
