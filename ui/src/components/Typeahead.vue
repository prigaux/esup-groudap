<script lang="ts">
// inspired from https://github.com/pespantelis/vue-typeahead

import { escapeRegExp } from "lodash";
import { computed, onMounted, ref, watch } from "vue";

export type UnknownT = any // { header?: string } & (string | Record<string, unknown>)

const noResultsMsg = "Aucun résultat"
const default_moreResultsMsg = (limit: number) => (
    `Votre recherche est limitée à ${limit} résultats.<br>Pour les autres résultats veuillez affiner la recherche.`
)
</script>

<script setup lang="ts">
import MyIcon from "./MyIcon.vue";

interface Props<T> {
    modelValue?: T
    options: T[] | ((search: string) => Promise<T[]>) // either an Array (that will be filtered by matcher) or a function

    minChars?: number
    limit?: number
    formatting?: (e: T) => string
    placeholder?: string
    rows?: number
    focus?: boolean

    noResultsMsg?: string
    moreResultsMsg?: (limit: number) => string
}

let props = withDefaults(defineProps<Props<UnknownT>>(), {
    minChars: 0,
    limit: 10,
    formatting: (e) => e as string,
    noResultsMsg: "No results",
})
let emit = defineEmits(['update:modelValue'])

let moreResultsMsg_ = computed(() => (props.moreResultsMsg || default_moreResultsMsg)(props.limit))

let loading = ref(false)
let query = ref(props.modelValue ? props.formatting(props.modelValue) : '')
let items = ref([] as UnknownT[])
let noResults = ref(false)
let moreResults = ref(false)
let current = ref(0)
let cancel = ref((_?: unknown) => {})

let input_elt = ref(undefined as HTMLInputElement | undefined)

if (props.focus) {
    onMounted(() => input_elt.value?.focus())
}

watch(() => props.modelValue, _ => {
    const v = props.modelValue
    query.value = v === undefined ? '' : props.formatting(v);
})

function input_changed() {
    open();
}

function open() {
    cancel.value()

    if (props.minChars && (!query.value || query.value.length < props.minChars)) {
        stopAndClose()
        return
    }

    if (!props.options) {
        return;
    }
    if (typeof props.options !== "function") {
        setOptions(props.options.filter(matcher));
        return;
    }


    const async_options = props.options
    setTimeout(() => {
        loading.value = true
        Promise.race([
            new Promise((resolve) => cancel.value = resolve),
            async_options(query.value),
        ]).then((data) => {
            if (!data) return; // canceled
            setOptions(data as UnknownT[])
        })
    }, 500)
}

function matcher(entry : UnknownT) {
    if (typeof entry !== 'string') throw "invalid matcher for type " + typeof entry
    return entry.match(new RegExp(escapeRegExp(query.value || ''), "i"));
}

function setOptions(data: UnknownT[]) {
    current.value = 0
    items.value = props.limit ? data.slice(0, props.limit) : data
    moreResults.value = data.length > props.limit
    noResults.value = items.value.length === 0
    loading.value = false
}

function stopAndClose() {
    cancel.value()
    items.value = []
    noResults.value = false
    loading.value = false
}

function setActive (index: number) {
    current.value = index
}

function activeClass (index: number) {
    return {
        active: current.value === index
    }
}

function hit () {
    let chosen = items.value[current.value];
    query.value = props.formatting(chosen);
    emit('update:modelValue', chosen);
    stopAndClose();
}

function up () {
    current.value--
    if (current.value < 0) {
        current.value = items.value.length - 1; // wrap
    }
}

function down () {
    current.value++
    if (current.value >= items.value.length) {
        current.value = 0; // wrap
    }
}

</script>

<template>
    <div>
        <input :aria-label="placeholder" :placeholder="placeholder"
           v-model="query" ref="input_elt"
           type="text" autocomplete="off"
           @keydown.down.prevent="down"
           @keydown.up.prevent="up"
           @keydown.enter.prevent="hit"
           @keydown.esc="stopAndClose"
           @blur="stopAndClose"
           @focus="open"
           @input="input_changed">
        <MyIcon class="fa-spin end-of-input" name="spinner" v-if="loading"/>
   </div>

   <div class="popup">
    <ul v-show="items.length || noResults">
      <li v-if="moreResults" class="moreResultsMsg" v-html="moreResultsMsg_"></li>
      <li v-if="moreResults" role="separator" class="divider"></li>
      <template v-for="(item, $item) in items">
       <li role="separator" class="divider" v-if="$item > 0 && (item.header)"></li>
       <li role="separator" class="dropdown-header" v-html="item.header" v-if="item.header"></li>
       <li 
         :class="activeClass($item)"
         @click.prevent="hit"
         @mousemove="setActive($item)"
         @mousedown.prevent=""> <!-- do not blur "input" -->
        <slot :item="item"></slot>
       </li>
      </template>
      <li v-if="noResults"><a v-text="noResultsMsg"></a></li>
    </ul>
   </div>
</template>

<style scoped>
input {
    width: 100%;
    box-sizing: border-box;
}
ul {    
    line-height: 1.3;
}
li {
    display: block;
    padding-left: 0.5rem;
}
li.active {
    background-color: #16A170;
}
li.active, li.active :deep(*) {
    color: white;
}
input {
    padding-right: 18px
}
.my-icon.end-of-input {
  margin-left: -18px;
}
</style>
