import type { MyServer, MySocket } from '@/pages/api/socket'

export const disconnect = (socket: MySocket): void => {
  socket.disconnect()
}
