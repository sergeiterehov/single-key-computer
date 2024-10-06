# SKC Protocols

## HTTP Methods (little-endian)

All methods use **POST**!

- `/proc/reset` body `[]`
- `/bus/read` body `[24bit address, 8bit size]`
- `/bus/write` body `[24bit address, ...bytes]`
- `/rom/delete` body `[]`
- `/rom/write` body `[...bytes]`
- `/` body `[...bytes]` - save new index.html

## Memory mapping

- `0x00000-0x07CFF` - RAM
- `0x50000-0x50fff` - Video (8x8 @24bit)
- `0x51000-0x51fff` - Random generator
