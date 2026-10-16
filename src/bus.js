import { EventEmitter } from 'node:events';

// Barramento interno: a camada de negócio emite, o tempo real (socket.io) escuta.
export const bus = new EventEmitter();
