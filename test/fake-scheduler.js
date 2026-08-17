export function createFakeScheduler() {
  let currentTime = 0
  let nextTimerId = 1
  const tasks = new Map()

  function nextDueTask(targetTime) {
    let selected = null
    for (const task of tasks.values()) {
      if (
        task.dueTime <= targetTime &&
        (!selected ||
          task.dueTime < selected.dueTime ||
          (task.dueTime === selected.dueTime && task.id < selected.id))
      ) {
        selected = task
      }
    }
    return selected
  }

  return {
    setTimeout(callback, delayMs) {
      const id = nextTimerId++
      tasks.set(id, { id, dueTime: currentTime + delayMs, callback })
      return id
    },

    clearTimeout(timerId) {
      tasks.delete(timerId)
    },

    advanceBy(durationMs) {
      const targetTime = currentTime + durationMs
      let task = nextDueTask(targetTime)

      while (task) {
        tasks.delete(task.id)
        currentTime = task.dueTime
        task.callback()
        task = nextDueTask(targetTime)
      }

      currentTime = targetTime
    },

    now() {
      return currentTime
    },

    pendingCount() {
      return tasks.size
    },
  }
}
