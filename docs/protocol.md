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
    * `0x00000` - Interrupt vectors 8 @32bit
    * `0x00100` - Initial Instruction Pointer
    * `0x07000` - Initial Stack Pinter
- `0x50000-0x50fff` - Video (8x8 @24bit)
- `0x51000-0x51fff` - Random generator (any read is random)
- `0x52000-0x52fff` - Keyboard (state @8bit = 0/1, ...)
- `0x53000-0x53fff` - Timers x8 {is_fired: @8bit, millis_counter: @32bit}

## Interrupts

- `0` - keyboard
- `1` - timer

## Directives

- `#offset [address]` set global program offset in memory
- `#name [alias] [register]`
- `#here [label]`

## Instructions set

- `HLT`
- `Push_IReg`
- `Pop_IReg`
- `Push_Size8_Array`
- `Pop_Size8`
- `READ`
- `WRITE`
- `JMP_Address32` unconditional jump
- `JIF_Address32` pop 1 byte, jump if != 8x0
- `JELSE_Address32` pop 1 byte, jump if == 8x0
- `ADD` b32, a32 -> a32 + b32
- `SUB` b32, a32 -> a32 - b32
- `MUL` b32, a32 -> a32 * b32
- `DIV` b32, a32 -> a32 / b32
- `MOD` b32, a32 -> a32 % b32
- `EQ` b32, a32 -> {8x1: a32 = b32, 8x0: default}
- `GT` b32, a32 -> {8x1: a32 > b32, 8x0: default}
- `LT` b32, a32 -> {8x1: a32 < b32, 8x0: default}
- `AND` b8, a8 -> a8 & b8
- `OR` b8, a8 -> a8 | b8
- `NOT` a8 -> ^a8
- `DEBUG`

### TODO: register mapping

- `_31` - Instruction Pointer
- `_30` - Stack Pointer
- `_29` - Enabled Interrupts
- `_28` - RESERVED
- `_27` - RESERVED
- `_26` - RESERVED
- `_25` - RESERVED
- `_24` - RESERVED

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