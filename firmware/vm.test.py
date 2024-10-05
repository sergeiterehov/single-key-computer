import vm
import asyncio
import math
import struct
from test_program import program

video_offset = 0x10000
noise_offset = 0x50000

bus = vm.VBus()
mem = vm.VMem(32 * 1000)
video = vm.VMem((1 + 64) * 4)
noise = vm.VNoise()
bus.connect(mem, 0, mem.size - 1)
bus.connect(video, video_offset, video_offset + video.size - 1)
bus.connect(noise, noise_offset, noise_offset + 3)
proc = vm.VProc(bus)

for i in range(math.ceil(len(program) / 4)):
    word = bytearray(4)
    part = program[i * 4 : i * 4 + 4]
    word[0 : len(part)] = part
    mem.write(i * 4, word)


async def monitor():
    while not proc.halt:
        proc.clk()

        if proc.debug:
            proc.debug = False

            print(
                "{}: IP={} SP={} REGs={} STK={}".format(
                    proc.cycles,
                    proc.ip,
                    proc.sp,
                    [
                        struct.unpack("i", proc.reg[i * 4 : i * 4 + 4])[0]
                        for i in range(6)
                    ],
                    [
                        struct.unpack("i", proc.stack[i : i + 4])[0]
                        for i in range(proc.sp - 4, -1, -4)
                    ],
                )
            )

        await asyncio.sleep(0.001)

    print("Halt")


async def display():
    while True:
        for y in range(8):
            for x in range(8):
                pixel_offset = (1 + y * 8 + x) * 4
                pixel = video.mem[pixel_offset : pixel_offset + 4]
                print("##" if pixel[0] else "..", end="")
            print("")

        await asyncio.sleep(0.5)


async def main():
    monitor_task = asyncio.create_task(monitor())
    display_task = asyncio.create_task(display())

    await monitor_task
    await asyncio.sleep(0.5)


asyncio.run(main())
