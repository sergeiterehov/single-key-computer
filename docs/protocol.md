# WS Protocol

## Computer events

### Set Binary Display State

`'B' + 8 bytes` - bites are pixels

### Set Grayscale Display State

`'M' + 64 bytes` - bytes are pixels brightness

### Set Color (256) Display State

`'C' + 64 bytes` - each byte is pixels color

Byte format: `RGBGBRGB` - bites

### Set True Color (24 bit) Display State

`'T' + 64*3 bytes` - Red, Green, Blue components for each pixel

## Application events

### Button State

`'b\x01'` - button released
`'b\x00'` - button pressed

### Custom Ping

`'^PING$'` - dummy ping frame
