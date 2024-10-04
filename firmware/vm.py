import random

try:
    import ustruct as struct
except:
    import struct


def _decode_offset(offset):
    return struct.unpack(">h", offset)[0]


def _decode_int(bytes):
    return struct.unpack(">i", bytes)[0]


def _encode_int(int):
    return struct.pack(">i", int)


class VBus:
    def __init__(self):
        self.devices = []

    def connect(self, device, addr_from, addr_to):
        self.devices.append((addr_from, addr_to, device))

    def write(self, addr, data: bytearray):
        for item in self.devices:
            addr_from, addr_to, device = item

            if addr_from <= addr and addr <= addr_to:
                device.write(addr - addr_from, data)
                return

    def read(self, addr) -> bytearray:
        for item in self.devices:
            addr_from, addr_to, device = item

            if addr_from <= addr and addr <= addr_to:
                return device.read(addr - addr_from)

        return b"\x00\x00\x00\x00"


class VMem:
    def __init__(self, size):
        self.size = size
        self.mem = bytearray(size + 3)

    def write(self, addr, data):
        self.mem[addr : addr + 4] = data

    def read(self, addr):
        return self.mem[addr : addr + 4]


class VNoise:
    def __init__(self):
        pass

    def write(self, addr, data):
        pass

    def read(self, addr):
        rnd = random.getrandbits(32)
        return bytearray(
            [rnd & 0xFF, (rnd >> 8) & 0xFF, (rnd >> 16) & 0xFF, (rnd >> 24) & 0xFF]
        )


class VProc:
    def __init__(self, bus: VBus):
        self.bus = bus

        self.cycles = 0

        self.halt = False
        self.ip = 0
        self.sp = 0
        self.test = 0

        self.stack = bytearray(256 * 4)
        self.reg = bytearray(4 * 32)

    def reset(self):
        self.cycles = 0
        self.halt = False
        self.ip = 0
        self.sp = 0
        self.test = 0

        for i in range(len(self.reg)):
            self.reg[i] = 0

        for i in range(len(self.stack)):
            self.stack[i] = 0

    def clk(self):
        self.cycles += 1

        buf = self.bus.read(self.ip)

        op = buf[0]

        if op == 0x00:
            """Hlt"""
            self.ip += 1

            self.halt = True
        elif op == 0x01:
            """Push_IReg"""
            reg_offset = (buf[1] & 0b11111) * 4

            self.stack[self.sp : self.sp + 4] = self.reg[reg_offset : reg_offset + 4]
            self.sp += 4

            self.ip += 2
        elif op == 0x02:
            """Push_Int"""
            int = self.bus.read(self.ip + 1)

            self.stack[self.sp : self.sp + 4] = int
            self.sp += 4

            self.ip += 5
        elif op == 0x03:
            """Pop_IReg"""
            reg_offset = (buf[1] & 0b11111) * 4

            self.sp -= 4
            self.reg[reg_offset : reg_offset + 4] = self.stack[self.sp : self.sp + 4]

            self.ip += 2
        elif op == 0x04:
            """Add"""
            self.sp -= 4
            b = self.stack[self.sp : self.sp + 4]
            self.sp -= 4
            a = self.stack[self.sp : self.sp + 4]

            self.stack[self.sp : self.sp + 4] = _encode_int(
                _decode_int(a) + _decode_int(b)
            )
            self.sp += 4

            self.ip += 1
        elif op == 0x05:
            """Mul"""
            self.sp -= 4
            b = self.stack[self.sp : self.sp + 4]
            self.sp -= 4
            a = self.stack[self.sp : self.sp + 4]

            self.stack[self.sp : self.sp + 4] = _encode_int(
                _decode_int(a) * _decode_int(b)
            )
            self.sp += 4

            self.ip += 1
        elif op == 0x06:
            """Jl_Offset"""
            self.sp -= 4
            b = self.stack[self.sp : self.sp + 4]
            self.sp -= 4
            a = self.stack[self.sp : self.sp + 4]

            offset = buf[1:3]

            if _decode_int(a) < _decode_int(b):
                self.ip += _decode_offset(offset)
            else:
                self.ip += 3
        elif op == 0x07:
            """Read"""
            self.sp -= 4
            addr = self.stack[self.sp : self.sp + 4]

            self.stack[self.sp : self.sp + 4] = self.bus.read(_decode_int(addr))
            self.sp += 4

            self.ip += 1
        elif op == 0x08:
            """Write"""
            self.sp -= 4
            addr = self.stack[self.sp : self.sp + 4]
            self.sp -= 4
            data = self.stack[self.sp : self.sp + 4]

            self.bus.write(_decode_int(addr), data)

            self.ip += 1
        else:
            self.ip += 1
