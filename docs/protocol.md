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
- `0x50000-0x50fff` - Video (8x8 @24bit)
- `0x51000-0x51fff` - Random generator

## Proc Memory Segmentation

- `0x00-0x0f` - interrupt offsets (8 x 16bit)
- `0x10` - start execution address
