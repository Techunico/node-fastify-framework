import { Server } from 'socket.io';

export class RealtimeService {
  constructor(private io: Server) {}

  emit(event: string, payload: any) {
    this.io.emit(event, payload);
  }

  toRoom(room: string, event: string, payload: any) {
    this.io.to(room).emit(event, payload);
  }

  // 🔥 NEW — semantic helpers

  emitToUser(userId: string, event: string, payload: any) {
    this.toRoom(`user:${userId}`, event, payload);
  }

  emitToTenant(tenantId: string, event: string, payload: any) {
    this.toRoom(`tenant:${tenantId}`, event, payload);
  }

  join(socketId: string, room: string) {
    const socket = this.io.sockets.sockets.get(socketId);
    socket?.join(room);
  }
}