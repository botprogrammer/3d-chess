/* eslint-disable no-console */
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Socket, ServerOptions } from 'socket.io'
import { Server } from 'socket.io'

import type { MakeMoveClient, MovingTo } from '@/components/Board'
import type { MessageClient } from '@/components/Chat'
import type { JoinRoomClient } from '@/components/GameCreation'
import type { Color } from '@/logic/pieces'
import type { CameraMove } from '@/server/cameraMove'
import { cameraMove } from '@/server/cameraMove'
import { disconnect } from '@/server/disconnect'
import { fetchPlayers } from '@/server/fetchPlayers'
import { joinRoom } from '@/server/joinRoom'
import { makeMove } from '@/server/makeMove'
import { resetGame } from '@/server/resetGame'
import { sendMessage } from '@/server/sendMessage'
import type { Message } from '@/state/player'

export type playerJoinedServer = {
  room: string
  username: string
  color: Color
  playerCount: number
}

export type Room = {
  room: string
}

export interface SocketClientToServer {
  createdMessage: (MessageClient: MessageClient) => void
  joinRoom: (JoinRoomClient: JoinRoomClient) => void
  makeMove: (MakeMoveClient: MakeMoveClient) => void
  cameraMove: (CameraMove: CameraMove) => void
  fetchPlayers: (Room: Room) => void
  resetGame: (Room: Room) => void
  playerLeft: (Room: Room) => void
  disconnect: (Room: Room) => void
  disconnecting: (Room: any) => void
  error: (Room: any) => void
  existingPlayer: (room: Room & { name: string }) => void
}

export interface SocketServerToClient {
  newIncomingMessage: (MessageClient: Message) => void
  playerJoined: (playerJoinedServer: playerJoinedServer) => void
  moveMade: (movingTo: MovingTo) => void
  cameraMoved: (CameraMove: CameraMove) => void
  playersInRoom: (players: number) => void
  gameReset: (data: boolean) => void
  newError: (error: string) => void
  joinRoom: (JoinRoomClient: JoinRoomClient) => void
  playerLeft: (Room: Room) => void
  clientExistingPlayer: (name: string) => void
}

export type MySocket = Socket<SocketClientToServer, SocketServerToClient>
export type MyServer = Server<SocketClientToServer, SocketServerToClient>

type SocketData = {
  room: string
  position: [number, number, number]
  color: string
}

export default function SocketHandler(
  req: NextApiRequest,
  res: NextApiResponse & {
    socket: {
      server: ServerOptions & {
        io: Server
      }
    }
  },
): void {
  try {
    // It means that socket server was already initialized
    if (res?.socket?.server?.io) {
      console.log(`Socket server already initialized`)
      res.end()
      return
    }

    console.log(`Initializing socket server...`)
    const io = new Server<SocketClientToServer, SocketServerToClient>(
      res?.socket?.server,
      {
        path: `/api/socket`,
        transports: [`websocket`],
        cors: {
          origin: `*`,
          methods: [`GET`, `POST`],
          credentials: true,
        },
        pingTimeout: 120000,
        pingInterval: 30000,
        connectTimeout: 20000,
        allowEIO3: true,
        maxHttpBufferSize: 1e8,
        allowUpgrades: true,
        perMessageDeflate: {
          threshold: 2048,
        },
        httpCompression: {
          threshold: 2048,
        },
      },
    )
    res.socket.server.io = io

    // Add global error handling
    io.engine.on(`connection_error`, (err: Error) => {
      console.error(`Connection error:`, err)
    })

    const onConnection = (socket: MySocket) => {
      console.log(`New client connected:`, socket.id)

      // Set up error handling first
      socket.on(`error`, (error) => {
        console.error(`Socket error for ${socket.id}:`, error)
      })

      // Set up disconnect handling with more detailed logging
      socket.on(`disconnect`, (reason) => {
        console.log(`Client ${socket.id} disconnected. Reason:`, reason)

        // Handle different disconnect reasons
        if (reason === `server namespace disconnect`) {
          console.log(`Server initiated disconnect, attempting to reconnect...`)
          // Don't remove listeners here as we want to reconnect
          return
        }

        // Clean up by removing all listeners for other disconnect reasons
        socket.removeAllListeners()
      })

      // Set up game event handlers
      const handlers = [
        sendMessage,
        joinRoom,
        makeMove,
        cameraMove,
        fetchPlayers,
        resetGame,
      ]

      // Initialize all handlers
      handlers.forEach((handler) => handler(socket, io))

      // Handle existing player checks
      socket.on(`existingPlayer`, (data) => {
        console.log(`Existing player check:`, data)
        io.sockets.in(data.room).emit(`clientExistingPlayer`, data.name)
      })
    }

    // Define actions inside
    io.on(`connection`, onConnection)

    console.log(`Socket server initialized successfully`)
    res.end()
  } catch (error) {
    console.error(`Failed to initialize socket server:`, error)
    res.status(500).end()
  }
}
