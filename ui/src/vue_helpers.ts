import { useThrottle } from "@vueuse/core"
import { reactive, ref } from "vue"

export function throttled_ref<T>(initial_val: T) {
    let real = ref(initial_val)
    let throttled = useThrottle(real, 300)
    return reactive({ real, throttled })
}

