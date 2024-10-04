import vm
import asyncio
import math
import struct

video_offset = 0x10000

bus = vm.VBus()
mem = vm.VMem(32 * 1000)
video = vm.VMem((1 + 64) * 4)
bus.connect(mem, 0, mem.size - 1)
bus.connect(mem, video_offset, video_offset + video.size - 1)
proc = vm.VProc(bus)

# fmt: off
program = bytearray(
    [
        # push 0
        0x02, 0x00, 0x00, 0x00, 0x00,
        # pop i2
        0x03, 0x02,
        # push 0
        0x02, 0x00, 0x00, 0x00, 0x00,
        # pop i1
        0x03, 0x01,
        # push i2
        0x01, 0x02,
        # push 8
        0x02, 0x00, 0x00, 0x00, 0x08,
        # mul
        0x05,
        # push i1
        0x01, 0x01,
        # add
        0x04,
        # push 0x10000
        0x02, 0x00, 0x01, 0x00, 0x00,
        # add
        0x04,
        # pop i3
        0x03, 0x03,

        # push i1
        0x01, 0x01,
        # push 1
        0x02, 0x00, 0x00, 0x00, 0x01,
        # add
        0x04,
        # pop i1
        0x03, 0x01,
        # push i1
        0x01, 0x01,
        # push 8
        0x02, 0x00, 0x00, 0x00, 0x08,
        # jl for_x
        0x06, 0xff, 0xdc,

        # push i2
        0x01, 0x02,
        # push 1
        0x02, 0x00, 0x00, 0x00, 0x01,
        # add
        0x04,
        # pop i2
        0x03, 0x02,
        # push i2
        0x01, 0x02,
        # push 8
        0x02, 0x00, 0x00, 0x00, 0x08,
        # jl for_y
        0x06, 0xff, 0xc1,
    ]
)
# fmt: on

for i in range(math.ceil(len(program) / 4)):
    word = bytearray(4)
    part = program[i * 4 : i * 4 + 4]
    word[0 : len(part)] = part
    mem.write(i * 4, word)


async def monitor():
    while not proc.halt:
        proc.clk()
        print(
            "{}: IP={} SP={} CMP={} REGs={}".format(
                proc.cycles,
                proc.ip,
                proc.sp,
                1 if proc.test > 0 else -1 if proc.test < 0 else 0,
                [struct.unpack(">i", proc.reg[i * 4 : i * 4 + 4])[0] for i in range(6)],
            )
        )
        await asyncio.sleep(0.01)

    print("Halt")


async def display():
    while True:
        for y in range(8):
            for x in range(8):
                pixel_offset = (1 + y * 8 + x) * 4
                pixel = video.mem[pixel_offset : pixel_offset + 4]
                print("##" if pixel[3] else "..", end="")
            print("")

        await asyncio.sleep(0.5)


async def main():
    monitor_task = asyncio.create_task(monitor())
    display_task = asyncio.create_task(display())

    await monitor_task


asyncio.run(main())
