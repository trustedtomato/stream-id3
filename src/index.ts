import {ReadStream, createReadStream} from 'fs';
import EventEmitter = require('events');
import {Transform} from 'stream';


export interface EventEmitterOn<T, V>{
	on(type:T, listener:(data:V)=>void):this
	once(type:T, listener:(data:V)=>void):this
	emit(type:T, data:V):void
}

export interface Frame{
	id:string
	
	text?:string
	syncText?:[number, string][]
	buffer?:Buffer
	url?:string,

	descriptor?:string
	type?:string
	mimeType?:string
	description?:string
	languageCode?:string
	timeStampFormat?:string
}


/*--- useful functions ---*/
const hasOwnProperty = (target:object, name:string) => Object.prototype.hasOwnProperty.call(target, name);

const defaultToObject = {
	get: (target:{[key:string]:object}, name:string) =>
		!hasOwnProperty(target, name)
		? {}
		: target[name]
};

const decode = (buf:Buffer, encoding:string) => {
	if(encoding === 'utf16'){
		if(buf[0] === 0xFE && buf[1] === 0xFF){
			encoding = 'utf16be';
			buf = buf.slice(2);
		}else if(buf[1] === 0xFE && buf[0] === 0xFF){
			encoding = 'utf16le';
			buf = buf.slice(2);
		}else{
			encoding = 'utf16be';
		}
	}
	switch(encoding){
		case 'utf16be':
			if(buf.length === 0) return '';
			const res = Buffer.alloc(buf.length);
			let i = 0;
			for(; i < buf.length-1; i += 2){
				res[i] = buf[i+1];
				res[i+1] = buf[i];
			}
			return res.toString('utf16le',0,i);
		default:
			return buf.toString(encoding);
	}
};

const unicodeTerminator = Buffer.from([0, 0]);
const asciiTerminator = Buffer.from([0]);

const parseFrameEncoding = (frame:Buffer) => 
	frame[0] === 0 ? {encoding: 'ascii', terminator: asciiTerminator}
	: frame[0] === 1 ? {encoding: 'utf16', terminator: unicodeTerminator}
	: frame[0] === 2 ? {encoding: 'utf16be', terminator: unicodeTerminator}
	: frame[0] === 3 ? {encoding: 'utf8', terminator: asciiTerminator}
	: {encoding: 'ascii', terminator: asciiTerminator};

const syncSafeIntToInt = (x:number) => (x & 0b1111111) + ((x & 0b111111100000000) >>> 1);

const decodeFrame = (id:string, frame:Buffer):Frame => {	
	if(id === 'TXXX'){
		const {encoding, terminator} = parseFrameEncoding(frame);

		const descriptorEndIndex = frame.indexOf(terminator, 1) + terminator.length;
		const descriptor = decode(frame.slice(1, descriptorEndIndex - terminator.length), encoding);
		
		const text = decode(frame.slice(descriptorEndIndex), encoding);
		
		return {id, descriptor, text};
	}


	else if(id.startsWith('T')){
		const {encoding} = parseFrameEncoding(frame);
		const text = decode(frame.slice(1), encoding);

		return {id, text};
	}


	else if(id === 'WXXX'){
		const {encoding, terminator} = parseFrameEncoding(frame);

		const descriptorEndIndex = frame.indexOf(terminator, 1) + terminator.length;
		const descriptor = decode(frame.slice(1, descriptorEndIndex - terminator.length), encoding);

		const url = decode(frame.slice(descriptorEndIndex), 'ascii');
		
		return {id, descriptor, url};
	}


	else if(id.startsWith('W')){
		const url = decode(frame, 'ascii');
		
		return {id, url};
	}


	else if(id === 'USLT'){
		const {encoding, terminator} = parseFrameEncoding(frame);
		
		const languageCode = decode(frame.slice(1, 4), 'ascii');
		
		const descriptorEndIndex = frame.indexOf(terminator, 4) + terminator.length;
		const descriptor = decode(frame.slice(4, descriptorEndIndex - terminator.length), encoding);

		const text = decode(frame.slice(descriptorEndIndex), encoding);

		return {id, languageCode, descriptor, text};
	}


	else if(id === 'SYLT'){
		const {encoding, terminator} = parseFrameEncoding(frame);
		
		const languageCode = frame.toString('ascii', 1, 4);
		const timeStampFormat = frame.toString('hex', 4, 5);
		const lengthOfBytes = timeStampFormat === '01' || timeStampFormat === '02' ? 4 : 0;
		const type = frame.toString('hex', 5, 6);
		const descriptorEndIndex = frame.indexOf(terminator, 6) + terminator.length;
		const descriptor = decode(frame.slice(6, descriptorEndIndex - terminator.length), encoding);

		const syncText:[number, string][] = [];
		let unprocessedLyrics = frame.slice(descriptorEndIndex);
		while(unprocessedLyrics.length){

			const textEnd = unprocessedLyrics.indexOf(terminator) + terminator.length;
			const text = decode(unprocessedLyrics.slice(0, textEnd - terminator.length), encoding);

			const timeStampBytes = unprocessedLyrics.slice(textEnd, textEnd + lengthOfBytes);
			const timeStamp = timeStampBytes.readUIntBE(0, timeStampBytes.length);

			syncText.push([timeStamp, text])
			unprocessedLyrics = unprocessedLyrics.slice(textEnd + lengthOfBytes);
		}

		return {id, syncText, type, descriptor, languageCode, timeStampFormat};
	}
	
	
	else if(id === 'APIC'){
		const {encoding, terminator} = parseFrameEncoding(frame);

		const mimeTypeEndIndex = frame.indexOf(terminator, 1);
		const mimeType = decode(frame.slice(1, mimeTypeEndIndex), encoding);

		const descriptorEndIndex = mimeTypeEndIndex + terminator.length + 1;
		const descriptor = frame.slice(mimeTypeEndIndex + terminator.length, descriptorEndIndex).toString('hex');

		const descriptionEndIndex = frame.indexOf(terminator, descriptorEndIndex);
		const description = decode(frame.slice(descriptorEndIndex, descriptionEndIndex), encoding);

		const buffer = frame.slice(descriptionEndIndex + 1);

		return {id, mimeType, descriptor, description, buffer};
	}


	else{
		return {id, buffer: frame};
	}
};



/*--- parsing the tag ---*/
export type Parser = EventEmitterOn<'frame', Frame> & EventEmitter;

export function readId3(input:ReadStream|string, parser:true):Parser
export function readId3(input:ReadStream|string, needed?:string[]):Promise<{[id:string]:Frame}>
export function readId3(input:ReadStream|string, needed?:string[]|true):Parser|Promise<{[id:string]:Frame}>{
	const parser:Parser = new EventEmitter();
	const stream = 
		typeof input === 'string'
		? createReadStream(input)
		: input;


	// pre-stage: defining things which will be needed in state 0
	const headerSize = 10;
	const frameHeaderSize = 10;
	let state = 0;
	let end = false;
	let header:Buffer = Buffer.alloc(0);
	parser.on('end', () => {
		end = true;
		if(typeof input === 'string'){
			stream.close();
		}
	});


	// state 0: parsing header
	let majorVersion:number;
	let patchVersion:number;
	let framesSize:number;
	let frameHeader:Buffer = Buffer.alloc(0);


	// state 1: parsing frame header
	let frameName:string;
	let frameValue:Buffer = Buffer.alloc(0);
	let frameValueLength:number;


	// state 2: parsing frame content
	/* after parsed, it goes back to state 1 so no need to define new variables */

	stream.on('data', (chunk:Buffer) => {
		if(end) return;


		// state 0: parsing header
		if(state === 0){
			header = Buffer.concat([header, chunk]);
			if(header.length < headerSize) return;

			if(header.toString('ascii', 0, 3) !== 'ID3'){
				parser.emit('error', new Error('There is no ID3 tag!'))
			}
			majorVersion = header[3];
			patchVersion = header[4];
			if(majorVersion !== 3 && majorVersion !== 4){
				parser.emit('error', new Error('ID3v2.'+majorVersion+' is not supported!'));
			}
			framesSize = (header[6] << 21) + (header[7] << 14) + (header[8] << 7) + header[9];

			chunk = header.slice(headerSize);
			header = undefined;
			state = 1;
		}
		
		
		framesSize -= chunk.length;
		if(framesSize < 0){
			chunk = chunk.slice(0, chunk.length + framesSize);
			framesSize = 0;
		}


		while(true){
			// state 1: parsing frame headers
			if(state === 1){
				frameHeader = Buffer.concat([frameHeader, chunk]);
				if(frameHeader.length < frameHeaderSize) break;

				const frameHeaderStartIndex = frameHeader.toString('ascii').search(/[A-Z]{3}[A-Z0-9]/);
				
				if(frameHeaderStartIndex === -1){
					frameHeader = frameHeader.slice(frameHeader.length - 3);
					break;
				}

				const trueFrameHeader = frameHeader.slice(frameHeaderStartIndex);
				frameName = trueFrameHeader.toString('ascii', 0, 4);
				frameValueLength =
					majorVersion === 3
					? parseInt(trueFrameHeader.toString('hex', 4, 8), 16)
					: syncSafeIntToInt(trueFrameHeader.slice(4, 8).readUIntBE(0, 4))
				
				chunk = frameHeader.slice(frameHeaderSize);
				frameHeader = Buffer.alloc(0);
				state = 2;
			}


			// state 2: parsing frame values
			if(state === 2){
				frameValue = Buffer.concat([frameValue, chunk]);
				if(frameValue.length < frameValueLength) break;
				
				const formattedFrame = decodeFrame(frameName, frameValue.slice(0, frameValueLength));
				parser.emit('frame', formattedFrame);
				if(end) return;
				
				chunk = frameValue.slice(frameValueLength);
				frameValue = Buffer.alloc(0);
				state = 1;
			}
		}


		if(framesSize === 0){
			parser.emit('end');
		}
	});

	if(Array.isArray(needed)){
		return new Promise((resolve, reject) => {
			const leftNeeded = new Set(needed);
			const result:{[id:string]:Frame} = new Proxy(Object.create(null), defaultToObject);
			parser.on('frame', x => {
				if(leftNeeded.delete(x.id)){
					result[x.id] = x;
				}
				if(typeof x.type === 'string'){
					const actualId = x.id + ':' + x.type;
					if(leftNeeded.delete(actualId)){
						result[actualId] = x;
					}
					if(typeof x.descriptor === 'string'){
						const actualId2 = actualId + ':' + x.descriptor;
						if(leftNeeded.delete(actualId2)){
							result[actualId2] = x;
						}
					}
				}else if(typeof x.descriptor === 'string'){
					const actualId = x.id + ':' + x.descriptor;
					if(leftNeeded.delete(actualId)){
						result[actualId] = x;
					}
				} 
				if(leftNeeded.size === 0){
					parser.emit('end');
				}
			});
			parser.on('end', () => {
				resolve(result);
			});
		});
	}else if(typeof needed === 'undefined'){
		return new Promise((resolve, reject) => {
			const result:{[id:string]:Frame} = new Proxy(Object.create(null), defaultToObject);
			parser.on('frame', x => {
				result[x.id] = x;
				if(typeof x.descriptor === 'string'){
					const actualId = x.id + ':' + x.descriptor;
					result[actualId] = x;
				}
			});
			parser.on('end', () => {
				resolve(result);
			});
		});
	}
	
	else{
		return parser;
	}
};