import { debouncedWatch, throttledWatch, useThrottle } from "@vueuse/core"
import { reactive, ref } from "vue"

export function throttled_ref(initial_val: string, min_length?: number) {
    let real = ref(initial_val)
    let throttled = ref(initial_val)
    debouncedWatch(real, (val) => {
        throttled.value = min_length && val.length < min_length ? initial_val : val
    }, { debounce: 500 })
    
    return reactive({ real, throttled })
}
