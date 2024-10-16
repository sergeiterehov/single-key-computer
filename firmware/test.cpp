#include <iostream>
#include "SKCduino/vm.h"
#include "SKCduino/vm.cpp"

VBus bus;
VProc proc;
VMem mem;

int main() {
    bus.connect(0, MEMSIZE, &mem);
    proc.bus = &bus;

    proc.reset();

    mem.write(0x100, 0xff);

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

    return 0;
}
