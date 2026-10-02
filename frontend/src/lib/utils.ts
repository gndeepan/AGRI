import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function clamp(v: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, v))
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
