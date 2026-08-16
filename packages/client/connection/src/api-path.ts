/**
 * The /api URL prefix — single source for both halves of the web transport.
 * The node half registers this prefix on the web server.
 */

/** Route prefix owning every api request (`/api` and `/api/<anything>`). */
export const API_PATH = '/api'

/** Remote-portal WebSocket pathname for multiplexed client-initiated RPCs. */
export const RPC_SOCKET_PATH = `${API_PATH}/rpc`
