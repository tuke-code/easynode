
export const useSyncProps = (props, key, emit) => {
  return computed({
    get() {
      return props[key]
    },
    set(value) {
      emit(`update:${key}`, value)
    }
  })
}
