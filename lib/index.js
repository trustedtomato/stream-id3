"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = require("fs");
var EventEmitter = require("events");
/*--- useful functions ---*/
var decode = function (buf, encoding) {
    switch (encoding) {
        case 'utf16be':
            if (buf.length === 0)
                return '';
            var res = Buffer.alloc(buf.length);
            var i = 0;
            for (; i < buf.length - 1; i += 2) {
                res[i] = buf[i + 1];
                res[i + 1] = buf[i];
            }
            return res.toString('utf16le', 0, i);
        default:
            return buf.toString(encoding);
    }
};
var parseFrameEncoding = function (frame) {
    var encoding;
    var encodingOffset;
    if (frame[0] === 0) {
        encoding = 'ascii';
        encodingOffset = 1;
    }
    else if (frame[0] === 1) {
        if (frame[1] === 0xFE && frame[2] === 0xFF) {
            encoding = 'utf16be';
        }
        else {
            encoding = 'utf16le';
        }
        encodingOffset = 3;
    }
    else if (frame[0] === 2) {
        encoding = 'utf16be';
        encodingOffset = 1;
    }
    else if (frame[0] === 3) {
        encoding = 'utf8';
        encodingOffset = 1;
    }
    else {
        encoding = 'ascii';
        encodingOffset = 0;
    }
    return {
        encoding: encoding,
        encodingOffset: encodingOffset
    };
};
var syncSafeIntToInt = function (x) { return (x & 127) + ((x & 32512) >>> 1); };
var decodeFrame = function (id, frame) {
    if (id === 'TXXX') {
        var _a = parseFrameEncoding(frame), encoding = _a.encoding, encodingOffset = _a.encodingOffset;
        var descriptorEndIndex = frame.indexOf(0, encodingOffset);
        var descriptor = decode(frame.slice(encodingOffset, descriptorEndIndex), encoding);
        var value = decode(frame.slice(descriptorEndIndex + 1), encoding);
        return { id: id, descriptor: descriptor, value: value };
    }
    else if (id.startsWith('T')) {
        var _b = parseFrameEncoding(frame), encoding = _b.encoding, encodingOffset = _b.encodingOffset;
        var value = decode(frame.slice(encodingOffset), encoding);
        return { id: id, value: value };
    }
    else if (id === 'WXXX') {
        var _c = parseFrameEncoding(frame), encoding = _c.encoding, encodingOffset = _c.encodingOffset;
        var descriptorEndIndex = frame.indexOf(0, encodingOffset);
        var descriptor = decode(frame.slice(encodingOffset, descriptorEndIndex), encoding);
        var url = decode(frame.slice(descriptorEndIndex + 1), 'ascii');
        return { id: id, descriptor: descriptor, url: url };
    }
    else if (id.startsWith('W')) {
        var url = decode(frame, 'ascii');
        return { id: id, url: url };
    }
    else if (id === 'APIC') {
        var _d = parseFrameEncoding(frame), encoding = _d.encoding, encodingOffset = _d.encodingOffset;
        var mimeTypeEndIndex = frame.indexOf(0, encodingOffset);
        var mimeType = decode(frame.slice(encodingOffset, mimeTypeEndIndex), encoding);
        var descriptorEndIndex = mimeTypeEndIndex + 2;
        var descriptor = frame.slice(mimeTypeEndIndex + 1, descriptorEndIndex).toString('hex');
        var descriptionEndIndex = frame.indexOf(0, descriptorEndIndex);
        var description = decode(frame.slice(descriptorEndIndex, descriptionEndIndex), encoding);
        var buffer = frame.slice(descriptionEndIndex + 1);
        return { id: id, mimeType: mimeType, descriptor: descriptor, description: description, buffer: buffer };
    }
    else {
        return { id: id, value: frame };
    }
};
function streamTag(input, needed) {
    var parser = new EventEmitter();
    var stream = typeof input === 'string'
        ? fs_1.createReadStream(input)
        : input;
    // pre-stage: defining things which will be needed in state 0
    var headerSize = 10;
    var frameHeaderSize = 10;
    var state = 0;
    var end = false;
    var header = Buffer.alloc(0);
    parser.on('end', function () {
        end = true;
        if (typeof input === 'string') {
            stream.close();
        }
    });
    // state 0: parsing header
    var majorVersion;
    var patchVersion;
    var framesSize;
    var frameHeader = Buffer.alloc(0);
    // state 1: parsing frame header
    var frameName;
    var frameValue = Buffer.alloc(0);
    var frameValueLength;
    // state 2: parsing frame content
    /* after parsed, it goes back to state 1 so no need to define new variables */
    stream.on('data', function (chunk) {
        if (end)
            return;
        // state 0: parsing header
        if (state === 0) {
            header = Buffer.concat([header, chunk]);
            if (header.length < headerSize)
                return;
            if (header.toString('ascii', 0, 3) !== 'ID3') {
                parser.emit('error', new Error('There is no ID3 tag!'));
            }
            majorVersion = header[3];
            patchVersion = header[4];
            if (majorVersion !== 3 && majorVersion !== 4) {
                parser.emit('error', new Error('ID3v2.' + majorVersion + ' is not supported!'));
            }
            framesSize = (header[6] << 21) + (header[7] << 14) + (header[8] << 7) + header[9];
            chunk = header.slice(headerSize);
            header = undefined;
            state = 1;
        }
        framesSize -= chunk.length;
        if (framesSize < 0) {
            chunk = chunk.slice(0, chunk.length + framesSize);
            framesSize = 0;
        }
        while (true) {
            // state 1: parsing frame headers
            if (state === 1) {
                frameHeader = Buffer.concat([frameHeader, chunk]);
                if (frameHeader.length < frameHeaderSize)
                    break;
                var frameHeaderStartIndex = frameHeader.toString('ascii').search(/[A-Z]{3}[A-Z0-9]/);
                if (frameHeaderStartIndex === -1) {
                    frameHeader = frameHeader.slice(frameHeader.length - 3);
                    break;
                }
                var trueFrameHeader = frameHeader.slice(frameHeaderStartIndex);
                frameName = trueFrameHeader.toString('ascii', 0, 4);
                frameValueLength =
                    majorVersion === 3
                        ? parseInt(trueFrameHeader.toString('hex', 4, 8), 16)
                        : syncSafeIntToInt(trueFrameHeader.slice(4, 8).readUIntBE(0, 4));
                chunk = frameHeader.slice(frameHeaderSize);
                frameHeader = Buffer.alloc(0);
                state = 2;
            }
            // state 2: parsing frame values
            if (state === 2) {
                frameValue = Buffer.concat([frameValue, chunk]);
                if (frameValue.length < frameValueLength)
                    break;
                var formattedFrame = decodeFrame(frameName, frameValue.slice(0, frameValueLength));
                parser.emit('frame', formattedFrame);
                if (end)
                    return;
                chunk = frameValue.slice(frameValueLength);
                frameValue = Buffer.alloc(0);
                state = 1;
            }
        }
        if (framesSize === 0) {
            parser.emit('end');
        }
    });
    if (Array.isArray(needed)) {
        return new Promise(function (resolve, reject) {
            var leftNeeded = new Set(needed);
            var result = new Map();
            parser.on('frame', function (x) {
                if (leftNeeded.delete(x.id)) {
                    result.set(x.id, x);
                }
                if (typeof x.descriptor === 'string') {
                    var actualId = x.id + ':' + x.descriptor;
                    if (leftNeeded.delete(actualId)) {
                        result.set(actualId, x);
                    }
                }
                if (leftNeeded.size === 0) {
                    parser.emit('end');
                }
            });
            parser.on('end', function () {
                resolve(result);
            });
        });
    }
    else {
        return parser;
    }
}
exports.streamTag = streamTag;
;
