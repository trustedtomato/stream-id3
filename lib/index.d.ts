/// <reference types="node" />
import { ReadStream } from 'fs';
import EventEmitter = require('events');
export interface EventEmitterOn<T, V> {
    on(type: T, listener: (data: V) => void): this;
    once(type: T, listener: (data: V) => void): this;
    emit(type: T, data: V): void;
}
export declare type Parser = EventEmitterOn<'frame', {
    id: string;
    [key: string]: any;
}> & EventEmitter;
export declare function streamTag(input: ReadStream | string): Parser;
export declare function streamTag(input: ReadStream | string, needed: string[] | true): Promise<Map<string, any>>;
