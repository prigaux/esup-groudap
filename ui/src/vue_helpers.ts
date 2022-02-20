import { debouncedWatch, watchOnce } from "@vueuse/core"
import { FunctionDirective, reactive, Ref, ref, UnwrapRef, watch, WatchOptions, WatchSource } from "vue"

export const maySingleton = <T>(val: T | undefined): T[] => (
    val ? [val] : []
)

// alike asyncComputed, but can be used with an existing Ref (alternative would be syncRef, but the lifetime is different)
export function setRefAsync<T>(ref: Ref<T>, asyncValue: Promise<T>, initialValue: T) {
    ref.value = initialValue
    asyncValue.then(value => ref.value = value)
}

// alike watchOnce but return a Promise
export const watchOnceP = <T, R>(source: WatchSource<T>, cb: () => R, options?: WatchOptions<boolean>): Promise<R> => (
    new Promise((resolve) => {
        watchOnce(source, () => resolve(cb()), options)
    })
)

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

