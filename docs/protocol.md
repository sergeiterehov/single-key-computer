# SKC Protocols

## HTTP Methods (little-endian)

All methods use **POST**!

- `/vm/restart` body `[]`
- `/proc/reset` body `[]`
- `/bus/read` body `[24bit address, 8bit size]`
- `/bus/write` body `[24bit address, ...bytes]`
- `/rom/load` body `[]`
- `/rom/delete` body `[]`
- `/rom/write` body `[...bytes]`
- `/index.html` body `[...bytes]` - save new index.html

## Memory mapping

- `0x00000-0x07CFF` - RAM
    * `0x00000` - Interrupt vectors 8 @16bit
    * `0x00010` - Initial Instruction Pointer
    * `0x07000` - Initial Stack Pinter
- `0x50000-0x50fff` - Video (8x8 @24bit)
- `0x51000-0x51fff` - Random generator (any read is random)
- `0x52000-0x52fff` - Keyboard (state @8bit = 0/1, ...)
- `0x53000-0x53fff` - Timers x8 {is_fired: @8bit, millis_counter: @32bit}

## Interrupts

- `0` - keyboard
- `1` - timer

## Instructions set

- `Hlt`
- `Push_IReg`
- `Pop_IReg`
- `Push_Size8_Array`
- `Pop_Size8`
- `Read`
- `Write`
- `Jmp_Offset16`
- `Jl_Offset16`
- `Add`
- `Mul`
- `Debug`

### TODO: register mapping

- `_31` - Instruction Pointer
- `_30` - Stack Pointer
- `_29` - RESERVED
- `_28` - RESERVED
- `_27` - RESERVED
- `_26` - RESERVED
- `_25` - RESERVED
- `_24` - RESERVED

### TODO: new IRQ set

- `enable_Irq8` enable irq
- `disable_Irq8` disable irq

### TODO: new jump set

- `Jmp_Offset16` unconditional jump
- `Jif_Offset16` pop 1 byte, jump if != 8x0
- `Jelse_Offset16` pop 1 byte, jump if == 8x0

### TODO: new boolean operations

- `And` b8, a8 -> a8 & b8
- `Or` b8, a8 -> a8 | b8
- `Not` a8 -> ^a8

- `Gt` b32, a32 -> {8x1: a32 > b32, 8x0: default}
- `Lt` b32, a32 -> {8x1: a32 < b32, 8x0: default}
- `Eq` b32, a32 -> {8x1: a32 = b32, 8x0: default}

### TODO: new math

- `Sub` b32, a32 -> a32 - b32
- `Div` b32, a32 -> a32 / b32
- `Mod` b32, a32 -> a32 % b32

### How to compare

```
// if a < x && x <= b {

// &&
    // a < x
    push {a} push {x} lt
    // x <= b
    push {x} push {b} gt not
and
jelse ELSE_1

// >> BODY

#here ELSE_1
// }
```

### How to call function

```
// int f(int a, int b) { return a + b }
// _0 = f(10, 20)

push 10
push 20
push _31 push 3 add
jmp func_f

pop _0

#here func_f
pop _0 // store ret
add
push _0 // restore ret
pop _31 // ret
```