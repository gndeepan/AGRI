import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { MotionConfig } from 'motion/react'
import { Toaster } from 'sonner'
import { ApiError } from '@/api/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { OfflineIndicator } from '@/components/common/OfflineIndicator'
import { router } from './router'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false
        return count < 2
      },
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <OfflineIndicator />
          <RouterProvider router={router} />
          <Toaster position="top-center" richColors closeButton />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}
