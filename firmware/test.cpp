#include <iostream>
#include "SKCduino/vm.h"
#include "SKCduino/vm.cpp"

VBus bus;
VProc proc;
VNoise noise;
VMem mem;

uint8_t rom[] = {
// 0x100: #offset 0x100

// 0x100: push 0x51000
0x3, 0x4, 0x0, 0x10, 0x5, 0x0, 
// 0x106: push [3]
0x3, 0x1, 0x3, 
// 0x109: read
0x10, 
// 0x10a: debug
0xff, 
// 0x10b: push 0x50000
0x3, 0x4, 0x0, 0x0, 0x5, 0x0, 
// 0x111: push [3]
0x3, 0x1, 0x3, 
// 0x114: write
0x11, 
// 0x115: debug
0xff, 
// 0x116: hlt
0x0, 
};

class Video : public VBusDevice {
public:
    uint8_t read(uint32_t address) {
        return 0;
    }

    void write(uint32_t address, uint8_t data) {
        std::cout << "VIDEO:" << address << " = " << int(data) << "\n";
    }
};

Video video;

int main() {
    bus.connect(0, MEMSIZE, &mem);
    bus.connect(0x50000, 0x50fff, &video);
    bus.connect(0x51000, 0x51fff, &noise);
    proc.bus = &bus;

    proc.reset();

    for (int i = 0; i < sizeof(rom); i++) {
        bus.write(i + 0x100, rom[i]);
    }

    for (int i =0; i< 1000; i++) {
        proc.clk();

        if (proc.debug) {
            proc.debug = false;

            std::cout << "CYCLES=" << proc.cycles;
            if (proc.interrupted) {
                std::cout << " [INT]";
            }
            std::cout << " IP=" << proc.reg[REG_IP] << " REGs=[";
            for (int i = 0; i < 6; i += 1) {
                std::cout << proc.reg[i] << ", ";
            }
            std::cout << "...] SP=" << proc.reg[REG_SP] << "\n";
        }

        if (proc.halt) {
            break;
        }
    }

    return 0;
}
