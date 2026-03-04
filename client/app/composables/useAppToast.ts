import { toast } from 'vue-sonner'
import { h } from 'vue'
import AppToast from '~/components/shared/AppToast.vue'
import { CircleCheckIcon, OctagonXIcon, InfoIcon, TriangleAlertIcon } from 'lucide-vue-next'

interface ToastOptions {
  title: string
  description?: string
  duration?: number
}

export function useAppToast() {
  function success(options: ToastOptions) {
    toast.custom(h(AppToast, {
      title: options.title,
      description: options.description,
      variant: 'default',
      icon: CircleCheckIcon,
    }), { duration: options.duration ?? 4000 })
  }

  function error(options: ToastOptions) {
    toast.custom(h(AppToast, {
      title: options.title,
      description: options.description,
      variant: 'destructive',
      icon: OctagonXIcon,
    }), { duration: options.duration ?? 5000 })
  }

  function info(options: ToastOptions) {
    toast.custom(h(AppToast, {
      title: options.title,
      description: options.description,
      variant: 'default',
      icon: InfoIcon,
    }), { duration: options.duration ?? 4000 })
  }

  function warning(options: ToastOptions) {
    toast.custom(h(AppToast, {
      title: options.title,
      description: options.description,
      variant: 'destructive',
      icon: TriangleAlertIcon,
    }), { duration: options.duration ?? 4000 })
  }

  return { success, error, info, warning }
}
