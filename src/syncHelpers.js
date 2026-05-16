export const createSaveScheduler = () => {
  const pending = {}
  const refs = {}

  return {
    schedule: (key, fn, delay) => {
      pending[key] = true
      clearTimeout(refs[key])
      refs[key] = setTimeout(async () => {
        try {
          await fn()
        } finally {
          // Clear pending after a short delay to allow the local onSnapshot
          // triggered by this write to be processed first.
          setTimeout(() => {
            pending[key] = false
          }, 100)
        }
      }, delay)
    },
    hasPending: (key) => !!pending[key]
  }
}
