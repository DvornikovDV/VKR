// Default MSW handlers (empty baseline — tests add their own via server.use())
import { HttpHandler } from 'msw'

export const handlers: HttpHandler[] = []
