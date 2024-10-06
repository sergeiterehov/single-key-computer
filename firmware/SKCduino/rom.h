uint8_t rom[] = {
// interrupts 8 * 16bit
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,

// 0: #name x i1

// 0: #name y i2

// 0: push 0
0x3, 0x4, 0x0, 0x0, 0x0, 0x0, 
// 6: pop y
0x2, 0x2, 
// 8: #here for_y

// 8: push 0
0x3, 0x4, 0x0, 0x0, 0x0, 0x0, 
// 14: pop x
0x2, 0x1, 
// 16: #here for_x

// 16: push 0x51000
0x3, 0x4, 0x0, 0x10, 0x5, 0x0, 
// 22: push [4]
0x3, 0x1, 0x4, 
// 25: read
0x10, 
// 26: debug
0xff, 
// 27: push 0
0x3, 0x4, 0x0, 0x0, 0x0, 0x0, 
// 33: jl black
0x21, 0xb, 0x0, 
// 36: push [32, 32, 32]
0x3, 0x3, 0x20, 0x20, 0x20, 
// 41: jmp endif
0x20, 0x8, 0x0, 
// 44: #here black

// 44: push [0, 0, 0]
0x3, 0x3, 0x0, 0x0, 0x0, 
// 49: #here endif

// 49: push y
0x1, 0x2, 
// 51: push 8
0x3, 0x4, 0x8, 0x0, 0x0, 0x0, 
// 57: mul
0x31, 
// 58: push x
0x1, 0x1, 
// 60: add
0x30, 
// 61: push 3
0x3, 0x4, 0x3, 0x0, 0x0, 0x0, 
// 67: mul
0x31, 
// 68: push 0x50000
0x3, 0x4, 0x0, 0x0, 0x5, 0x0, 
// 74: add
0x30, 
// 75: push [3]
0x3, 0x1, 0x3, 
// 78: write
0x11, 
// 79: push x
0x1, 0x1, 
// 81: push 1
0x3, 0x4, 0x1, 0x0, 0x0, 0x0, 
// 87: add
0x30, 
// 88: pop x
0x2, 0x1, 
// 90: push x
0x1, 0x1, 
// 92: push 8
0x3, 0x4, 0x8, 0x0, 0x0, 0x0, 
// 98: jl for_x
0x21, 0xae, 0xff, 
// 101: push y
0x1, 0x2, 
// 103: push 1
0x3, 0x4, 0x1, 0x0, 0x0, 0x0, 
// 109: add
0x30, 
// 110: pop y
0x2, 0x2, 
// 112: push y
0x1, 0x2, 
// 114: push 8
0x3, 0x4, 0x8, 0x0, 0x0, 0x0, 
// 120: jl for_y
0x21, 0x90, 0xff, 



// padding
0,0,0,0,0,0,0,
};