import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth, RequireAdmin, PublicOnly } from './guards'
import { PageSpinner } from '@/components/layout/PageSpinner'
import { RouteError } from '@/components/layout/RouteError'

const Landing = lazy(() => import('@/pages/Landing'))
const Login = lazy(() => import('@/pages/auth/Login'))
const Register = lazy(() => import('@/pages/auth/Register'))
const VerifyEmail = lazy(() => import('@/pages/auth/VerifyEmail'))
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'))
const Onboarding = lazy(() => import('@/pages/Onboarding'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const LandMap = lazy(() => import('@/pages/map/LandMap'))
const LandDetail = lazy(() => import('@/pages/lands/LandDetail'))
const Environment = lazy(() => import('@/pages/lands/Environment'))
const Discover = lazy(() => import('@/pages/lands/Discover'))
const PlanNew = lazy(() => import('@/pages/plans/PlanNew'))
const Plans = lazy(() => import('@/pages/plans/Plans'))
const FieldExperience = lazy(() => import('@/pages/plans/FieldExperience'))
const Records = lazy(() => import('@/pages/plans/Records'))
const Tasks = lazy(() => import('@/pages/Tasks'))
const Assistant = lazy(() => import('@/pages/Assistant'))
const Profile = lazy(() => import('@/pages/Profile'))
const Admin = lazy(() => import('@/pages/Admin'))
// Dev-only preview of every sky state; the import is dropped from production builds.
const SkyGallery = import.meta.env.DEV ? lazy(() => import('@/features/sky/SkyGallery')) : null

const LoginScenePreview = import.meta.env.DEV ? lazy(() => import('@/components/auth/login3d/Preview')) : null

const s = (el: ReactNode) => <Suspense fallback={<PageSpinner />}>{el}</Suspense>

export const router = createBrowserRouter([
  { path: '/', element: s(<Landing />), errorElement: <RouteError /> },
  {
    element: <PublicOnly />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: s(<Login />) },
      { path: '/register', element: s(<Register />) },
      { path: '/forgot-password', element: s(<ForgotPassword />) },
    ],
  },
  { path: '/verify-email', element: s(<VerifyEmail />), errorElement: <RouteError /> },
  { path: '/reset-password', element: s(<ResetPassword />), errorElement: <RouteError /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      { path: '/onboarding', element: s(<Onboarding />) },
      { path: '/app/map', element: s(<LandMap />) },
      {
        path: '/app',
        element: <AppShell />,
        children: [
          { index: true, element: s(<Dashboard />) },
          { path: 'lands/:landId', element: s(<LandDetail />) },
          { path: 'lands/:landId/environment', element: s(<Environment />) },
          { path: 'lands/:landId/discover', element: s(<Discover />) },
          { path: 'plans', element: s(<Plans />) },
          { path: 'plans/new', element: s(<PlanNew />) },
          { path: 'plans/:cycleId', element: s(<FieldExperience />) },
          { path: 'plans/:cycleId/records', element: s(<Records />) },
          { path: 'tasks', element: s(<Tasks />) },
          { path: 'assistant', element: s(<Assistant />) },
          { path: 'assistant/:conversationId', element: s(<Assistant />) },
          { path: 'profile', element: s(<Profile />) },
          { element: <RequireAdmin />, children: [{ path: 'admin', element: s(<Admin />) }] },
        ],
      },
    ],
  },
  ...(SkyGallery ? [{ path: '/dev/sky', element: s(<SkyGallery />) }] : []),
  ...(LoginScenePreview ? [{ path: '/dev/login-scene', element: s(<LoginScenePreview />) }] : []),
  { path: '*', element: <Navigate to="/" replace /> },
])
