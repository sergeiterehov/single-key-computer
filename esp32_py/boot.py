print("Starting Single Key Computer...")

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

print("Init pins")

pin_led = machine.Pin(16)
btn = machine.Pin(39, machine.Pin.IN, machine.Pin.PULL_UP)
src_btn = machine.Pin(37, machine.Pin.IN, machine.Pin.PULL_DOWN)

print("Init display")

num_leds = 64
np = neopixel.NeoPixel(pin_led, num_leds)

print("Init WiFi")

ssid = "SingleKeyComputer"
password = "SuperHardPassword123"

ap = network.WLAN(network.AP_IF)
ap.active(True)
ap.config(essid=ssid, password=password, authmode=network.AUTH_WPA_WPA2_PSK)

while ap.active() == False:
    pass

print("WiFI: {}, Password: {}".format(ssid, password))
print("AP ifconfig:", ap.ifconfig())


async def anim_display_power_on():
    for i in range(32):
        k = i / 31
        np[3 * 8 + 2] = (int(4 * k), int(1 * k), 0)
        np[3 * 8 + 3] = (int(32 * k), 0, 0)
        np[3 * 8 + 4] = (0, int(64 * k), 0)
        np[3 * 8 + 5] = (0, 0, int(32 * k))
        np[3 * 8 + 6] = (int(2 * k), 0, int(4 * k))
        np.write()
        await asyncio.sleep(0.02)


async def subscribe_ping(writer):
    while True:
        await ws_send(writer, b"^PING$")
        await asyncio.sleep(10)


async def subscribe_button(writer):
    btn_state = 1
    prev_btn_state = btn_state

    while True:
        btn_state = btn.value()

        if btn_state != prev_btn_state:
            prev_btn_state = btn_state
            await ws_send(writer, b"b1" if btn_state == 1 else b"b0")

        await asyncio.sleep(0.01)


async def ws_handshake(writer, headers):
    # Handshake: "f5iN+gp/nlMa6saS2nKaKQ==" -> "34/j6I2+TlTA65iZZJBJl/oRO+I="
    ws_magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
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


async def ws_send(writer, payload):
    length = len(payload)
    assert length <= 125, "Short payload expected"

    writer.write(bytes((0b10000010, length)))
    writer.write(payload)

    await writer.drain()


async def ws_begin_protocol(reader, writer, on_message):
    while True:
        header = await reader.read(2)
        assert header, "Break connection"
        FIN = bool(header[0] & 0x80)  # bit 0
        assert FIN == 1, "FIN flag expected"
        opcode = header[0] & 0xF  # bits 4-7
        assert opcode == 1 or opcode == 2, "Raw or text data expected"
        masked = bool(header[1] & 0x80)  # bit 8
        assert masked, "Mask flag expected"
        payload_size = header[1] & 0x7F  # bits 9-15
        assert payload_size <= 125, "Short payload expected"
        masking_key = await reader.read(4)
        payload = bytearray(await reader.read(payload_size))
        for i in range(payload_size):
            payload[i] = payload[i] ^ masking_key[i % 4]

        await on_message(writer, payload)


async def read_headers(reader):
    headers = {}

    while True:
        header = await reader.readline()
        assert header, "EOF"

        if header == b"\r\n":
            break

        key, value = header.decode()[:-2].split(": ")

        if not key in headers:
            headers[key] = []

        headers[key].append(value)

    return headers


async def handle_ws_message(writer, payload):
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
            np[i] = (c & 0b10000100, (c & 0b01010010) << 1, c & (0b00101001) << 2)

        np.write()
    elif payload.startswith(b"T"):
        for i in range(num_leds):
            r = payload[1 + i * 3 + 0]
            g = payload[1 + i * 3 + 1]
            b = payload[1 + i * 3 + 2]
            np[i] = (r, g, b)

        np.write()


async def handle_get_ws(reader, writer, headers):
    await ws_handshake(writer, headers)
    print("WS Connected!")

    for i in range(num_leds):
        np[i] = (0, 0, 0)
    np.write()

    subscriptions = []

    try:
        subscriptions.append(asyncio.create_task(subscribe_button(writer)))
        subscriptions.append(asyncio.create_task(subscribe_ping(writer)))

        await ws_begin_protocol(reader, writer, handle_ws_message)
    finally:
        print("WS Disconnected")

        for subscription in subscriptions:
            subscription.cancel()


async def handle_connection(reader, writer):
    print("New connection!")

    try:
        head = await reader.readline()
        assert head, "EOF"

        print("HEAD:", head)

        headers = await read_headers(reader)
        print("HEADERS:", headers)

        if head.startswith(b"GET /ws "):
            await handle_get_ws(reader, writer, headers)

        elif head.startswith(b"GET / "):
            with open("index.html", "r") as file:
                content = file.read()
                await writer.awrite(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n"
                )
                await writer.awrite(content)

        else:
            await writer.awrite("HTTP/1.1 404 NotFound\r\n\r\nNot Found!")
    except Exception as e:
        print("Error:", e)
        await writer.awrite("HTTP/1.1 500 InternalError\r\n\r\n{}".format(e))
    finally:
        await writer.aclose()


async def websocket_server():
    addr = socket.getaddrinfo("0.0.0.0", 80)[0][-1]
    server = await asyncio.start_server(handle_connection, addr[0], addr[1])
    print("Server is running on port 80")

    while True:
        await asyncio.sleep(3600)


async def main():
    power_anim_task = asyncio.create_task(anim_display_power_on())
    server_task = asyncio.create_task(websocket_server())

    await server_task
    await power_anim_task


asyncio.run(main())
