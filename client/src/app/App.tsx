// T004 — Root App with React Router v7 BrowserRouter + lazy-loaded routes
import { RouterProvider } from 'react-router-dom'
import { router } from './routes'

export default function App() {
    return <RouterProvider router={router} />
}
