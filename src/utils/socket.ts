import { useEffect } from 'react'

import { toast } from 'react-toastify'
import type { Socket } from 'socket.io-client'
// eslint-disable-next-line import/no-named-as-default
import io from 'socket.io-client'
import create from 'zustand'

import type { MovingTo } from '@/components/Board'
import type {
  SocketClientToServer,
  SocketServerToClient,
  playerJoinedServer,
} from '@/pages/api/socket'
import type { CameraMove } from '@/server/cameraMove'
import { useGameSettingsState } from '@/state/game'
import type { Message } from '@/state/player'
import {
  useOpponentState,
  usePlayerState,
  useMessageState,
} from '@/state/player'

type ClientSocket = Socket<SocketServerToClient, SocketClientToServer>

interface SocketState {
  socket: ClientSocket | null
  setSocket: (socket: ClientSocket | null) => void
}

export const useSocketState = create<SocketState>((set) => ({
  socket: null,
  setSocket: (socket) => set({ socket }),
}))

let socket: ClientSocket

export const useSockets = ({ reset }: { reset: VoidFunction }): void => {
  const [addMessage] = useMessageState((state) => [state.addMessage])
  const { setGameStarted, setMovingTo } = useGameSettingsState((state) => ({
    setGameStarted: state.setGameStarted,
    setMovingTo: state.setMovingTo,
  }))
  const { setPlayerColor, setJoinedRoom } = usePlayerState((state) => state)

  const { setPosition, setName: setOpponentName } = useOpponentState(
    (state) => state,
  )

  const { socket: socketState, setSocket } = useSocketState((state) => ({
    socket: state.socket,
    setSocket: state.setSocket,
  }))

  useEffect(() => {
    let isConnecting = false

    const socketInitializer = async () => {
      if (isConnecting) return
      isConnecting = true

      try {
        console.log(`Initializing socket connection...`)
        await fetch(`/api/socket`)

        if (socket?.connected) {
          console.log(`Socket already connected`)
          isConnecting = false
          return
        }

        socket = io({
          path: `/api/socket`,
          transports: [`websocket`],
          reconnectionAttempts: Infinity,
          reconnectionDelay: 2000,
          reconnectionDelayMax: 10000,
          timeout: 20000,
          forceNew: false,
          autoConnect: true,
        })

        socket.on(`connect`, () => {
          console.log(`Socket connected successfully`)
          setSocket(socket)
          isConnecting = false
        })

        socket.on(`connect_error`, (error) => {
          console.error(`Socket connection error:`, error)
          isConnecting = false
          toast.error(
            `Failed to connect to game server. Please refresh the page.`,
          )
        })

        socket.on(`disconnect`, (reason) => {
          console.log(`Socket disconnected:`, reason)
          isConnecting = false
          // Only attempt to reconnect if the disconnection was not initiated by the client
          if (
            reason === `io server disconnect` ||
            reason === `transport close`
          ) {
            console.log(`Attempting to reconnect...`)
            socket.connect()
          }
        })

        socket.on(`newIncomingMessage`, (msg: Message) => {
          addMessage(msg)
        })

        socket.on(`playerJoined`, (data: playerJoinedServer) => {
          console.log(`Player joined:`, data)
          const split = data.username.split(`#`)
          addMessage({
            author: `System`,
            message: `${split[0]} has joined ${data.room}`,
          })
          const { id, username } = usePlayerState.getState()
          if (split[1] === id) {
            setPlayerColor(data.color)
            setJoinedRoom(true)
          } else {
            socket.emit(`existingPlayer`, {
              room: data.room,
              name: `${username}#${id}`,
            })
            setOpponentName(split[0])
          }
        })

        socket.on(`clientExistingPlayer`, (data: string) => {
          const split = data.split(`#`)
          if (split[1] !== usePlayerState.getState().id) {
            setOpponentName(split[0])
          }
        })

        socket.on(`cameraMoved`, (data: CameraMove) => {
          const { playerColor } = usePlayerState.getState()
          if (playerColor === data.color) {
            return
          }
          setPosition(data.position)
        })

        socket.on(`moveMade`, (data: MovingTo) => {
          setMovingTo(data)
        })

        socket.on(`gameReset`, () => {
          reset()
        })

        socket.on(`playersInRoom`, (data: number) => {
          if (data === 2) {
            setGameStarted(true)
          }
        })

        socket.on(`newError`, (err: string) => {
          console.error(`Socket error:`, err)
          toast.error(err, {
            toastId: err,
          })
        })
      } catch (error) {
        console.error(`Failed to initialize socket:`, error)
        toast.error(
          `Failed to initialize game connection. Please refresh the page.`,
        )
        isConnecting = false
      }
    }

    socketInitializer()

    return () => {
      if (socketState) {
        socketState.emit(`playerLeft`, { room: usePlayerState.getState().room })
        socketState.disconnect()
      }
    }
  }, [])
}
