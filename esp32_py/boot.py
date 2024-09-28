try:
    import usocket as socket
except:
    import socket

import network

import esp

esp.osdebug(None)

import gc

gc.collect()

import machine
import neopixel

import uasyncio as asyncio
import usocket as socket

import uhashlib
import ubinascii

pin_led = machine.Pin(16)
btn = machine.Pin(39, machine.Pin.IN, machine.Pin.PULL_UP)
src_btn = machine.Pin(37, machine.Pin.IN, machine.Pin.PULL_DOWN)

num_leds = 64

np = neopixel.NeoPixel(pin_led, num_leds)

np.write()

ssid = "SingleKeyComputer"
password = "SuperHardPassword123"

ap = network.WLAN(network.AP_IF)
ap.active(True)
ap.config(essid=ssid, password=password, authmode=network.AUTH_WPA_WPA2_PSK)


async def await_ap():
    while ap.active() == False:
        for i in range(num_leds):
            np[i - 1] = (0, 0, 0)

            np[i] = (32, 32, 32)
            np.write()

            await asyncio.sleep(0.1)


asyncio.run(await_ap())

print("Connection successful")
print(ap.ifconfig())


async def subscribe_ping(writer):
    while True:
        await writer.awrite(b"\x82\x06^PING$")
        await asyncio.sleep(10)


async def subscribe_button(writer):
    btn_state = 1
    prev_btn_state = btn_state

    while True:
        btn_state = btn.value()

        if btn_state != prev_btn_state:
            prev_btn_state = btn_state
            await writer.awrite(b"\x82\x02b1" if btn_state == 1 else b"\x82\x02b0")

        await asyncio.sleep(0.01)


ws_magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


async def websocket_handler(reader, writer):
    print("New client connected")

    subscriptions = []

    while True:
        try:
            head = await reader.readline()
            if not head:
                print("Client disconnected")
                break

            print("HEAD:", head)

            headers = {}

            while True:
                header = await reader.readline()

                if not header or header == b"\r\n":
                    break

                key, value = header.decode()[:-2].split(": ")

                if not key in headers:
                    headers[key] = []

                headers[key].append(value)

            print(headers)

            if head.startswith(b"GET /ws "):
                # Handshake: "f5iN+gp/nlMa6saS2nKaKQ==" -> "34/j6I2+TlTA65iZZJBJl/oRO+I="
                accept_key = ubinascii.b2a_base64(
                    uhashlib.sha1(headers["Sec-WebSocket-Key"][0] + ws_magic).digest(),
                    newline=False,
                )

                writer.write("HTTP/1.1 101 Switching Protocols\r\n")
                writer.write("Upgrade: websocket\r\n")
                writer.write("Connection: Upgrade\r\n")
                writer.write("Sec-WebSocket-Accept: {}\r\n".format(accept_key.decode()))
                writer.write("\r\n")
                await writer.drain()

                print("WS Connected!")

                subscriptions.append(asyncio.create_task(subscribe_button(writer)))
                subscriptions.append(asyncio.create_task(subscribe_ping(writer)))

                while True:
                    header = await reader.read(2)
                    assert header, "Break connection"
                    FIN = bool(header[0] & 0x80)  # bit 0
                    assert FIN == 1, "We only support unfragmented messages"
                    opcode = header[0] & 0xF  # bits 4-7
                    assert opcode == 1 or opcode == 2, "We only support data messages"
                    masked = bool(header[1] & 0x80)  # bit 8
                    assert masked, "The client must mask all frames"
                    payload_size = header[1] & 0x7F  # bits 9-15
                    assert payload_size <= 125, "We only support small messages"
                    masking_key = await reader.read(4)
                    payload = bytearray(await reader.read(payload_size))
                    for i in range(payload_size):
                        payload[i] = payload[i] ^ masking_key[i % 4]

                    print("Msg:", len(payload))

                    if payload.startswith(b"B"):
                        for i in range(num_leds / 8):
                            b = payload[1 + i]
                            for k in range(8):
                                c = (b >> k) & 0b1
                                np[i * 8 + k] = (c, c, c)

                        np.write()
                    elif payload.startswith(b"M"):
                        for i in range(num_leds):
                            c = payload[1 + i]
                            np[i] = (c, c, c)

                        np.write()
                    elif payload.startswith(b"C"):
                        for i in range(num_leds):
                            c = payload[1 + i]
                            np[i] = (
                                c & 0b10000100,
                                (c & 0b01010010) << 1,
                                c & (0b00101001) << 2,
                            )

                        np.write()
                    elif payload.startswith(b"T"):
                        for i in range(num_leds):
                            r = payload[1 + i * 3 + 0]
                            g = payload[1 + i * 3 + 1]
                            b = payload[1 + i * 3 + 2]
                            np[i] = (r, g, b)

                        np.write()

                break

            if head.startswith(b"GET / "):
                with open("index.html", "r") as file:
                    content = file.read()
                    await writer.awrite(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n"
                    )
                    await writer.awrite(content)
                    break

            await writer.awrite("HTTP/1.1 404 NotFound\r\n\r\nNot Found!")
            break
        except Exception as e:
            print("Error:", e)
            await writer.awrite("HTTP/1.1 500 InternalError\r\n\r\nUnknown Error")
            break

    for subscription in subscriptions:
        subscription.cancel()

    await writer.aclose()


async def websocket_server():
    addr = socket.getaddrinfo("0.0.0.0", 80)[0][-1]
    server = await asyncio.start_server(websocket_handler, addr[0], addr[1])
    print("WebSocket server is running on port 80")

    while True:
        await asyncio.sleep(3600)


async def main():
    server_task = asyncio.create_task(websocket_server())

    await server_task


asyncio.run(main())
