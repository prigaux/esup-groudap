import { debouncedWatch } from "@vueuse/core"
import { FunctionDirective, reactive, ref, UnwrapRef, watch } from "vue"

export function throttled_ref(initial_val: string, min_length?: number) {
    let real = ref(initial_val)
    let throttled = ref(initial_val)
    debouncedWatch(real, (val) => {
        throttled.value = min_length && val.length < min_length ? initial_val : val
    }, { debounce: 500 })
    
    return reactive({ real, throttled })
}

export function new_ref_watching<T>(source: any, value: () => T) {
    const r = ref(value())
    watch(source, () => {
        r.value = value() as UnwrapRef<T>
    })
    return r
}

export const vFocus : FunctionDirective<HTMLElement, void> = (el) => { 
    el.focus()
}

export const vClickWithoutMoving : FunctionDirective<HTMLElement, false | (() => void)> = (el, binding) => {
    const f = binding.value
    if (!f) return
    let moved = false
    el.addEventListener('mousedown', () => moved = false)
    el.addEventListener('mousemove', () => moved = true)
    let dblclicked = false
    el.addEventListener('dblclick', () => dblclicked = true)
    el.addEventListener('click', () => { 
        if (!moved) {
            dblclicked = false
            setTimeout(() => {
                if (!dblclicked) f()
            }, 300)
        }
    })
}

