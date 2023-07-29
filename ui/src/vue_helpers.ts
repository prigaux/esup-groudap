import { asyncComputed, debouncedWatch, watchOnce } from "@vueuse/core"
import { computed, ComputedRef, FunctionDirective, reactive, Ref, ref, UnwrapRef, watch, WatchOptions, WatchSource } from "vue"
import { Option } from "./my_types"

export type URef<T> = Ref<T | undefined>

/**
 * useful to have a local variable in Vue template: `v-for="v in maySingleton(long_and_complex_expression)"`
 */
export const maySingleton = <T>(val: T | undefined): T[] => (
    val ? [val] : []
)

/**
 * alike `asyncComputed`, but returns undefined during re-computation
 * (NB: `asyncComputed` type does not show the undefined initial behaviour, where ours do)
 */ 
export const asyncComputed_ = <T>(evaluationCallback: () => Promise<T>): ComputedRef<T | undefined> => {
    let evaluating = ref(false)
    let asyncResult = asyncComputed(evaluationCallback)
    return computed(() => evaluating.value ? undefined : asyncResult.value)
}

/**
 * alike `asyncComputed`, but not reactive => to be used with an existing `Ref`
 * (alternative would be `syncRef`, but the lifetime is different)
 */
export function setRefAsync<T>(ref: Ref<T>, initialValue: T, asyncValue: Promise<T>) {
    ref.value = initialValue
    asyncValue.then(value => ref.value = value)
}

/**
 * when `source` is modified, call `cb` once 
 * (alike `watchOnce` but returns a `Promise`)
 */
export const watchOnceP = <T, R>(source: WatchSource<T>, cb: () => R, options?: WatchOptions<boolean>): Promise<R> => (
    new Promise((resolve) => {
        watchOnce(source, () => resolve(cb()), options)
    })
)

/**
 * @param initial_val initial value
 * @param min_length minimal string length to take into account
 * @returns `.throttled` is `.real` value, but throttled (and omits changes if .real value is shorter than `min_length`)
 */
export function throttled_ref(initial_val: string, min_length?: number) {
    let real = ref(initial_val)
    let throttled = ref(initial_val)
    debouncedWatch(real, (val) => {
        throttled.value = min_length && val.length < min_length ? initial_val : val
    }, { debounce: 500 })
    
    return reactive({ real, throttled })
}

/**
 * alike `computed`, but the value can be forced using async `params.update`
 */
export function ref_watching<T>(params : { value: () => T, watch?: any, update?: () => Promise<T> }) {
    const r = ref(params.value()) as Ref<UnwrapRef<T>> & { update: () => void }
    watch(params.watch || params.value, () => {
        r.value = params.value() as UnwrapRef<T>
    })
    r.update = async () => {
        if (params.update) {
            r.value = await params.update() as UnwrapRef<T>
        }
    };
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

export let global_abort = ref(undefined as Option<() => void>)

