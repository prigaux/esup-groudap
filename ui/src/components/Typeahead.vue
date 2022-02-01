<script lang="ts">
// inspired from https://github.com/pespantelis/vue-typeahead

import { escapeRegExp } from "lodash";
import { computed, onMounted, ref, watch } from "vue";

type Validity = { valueMissing?: true; badInput?: boolean; valid?: boolean; }

export type UnknownT = { header?: string } & (string | Record<string, unknown>)

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
    editable?: boolean
    required?: boolean
    pattern?: string | RegExp
    name?: string
    id?: string
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
    editable: true,
    noResultsMsg: "No results",
})
let emit = defineEmits(['update:modelValue', 'update:validity'])

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

function emitValidity(validity: Validity) {
    input_elt.value?.setCustomValidity(validity.valid ? '' : 'err')
    emit('update:validity', validity)
}

function checkValidity(v: UnknownT | undefined, from : 'input' | 'parent') {
    // "v" is an accepted value
    const valueMissing = v === '' || v === undefined || v === null;        
    const validity = props.required && valueMissing ? { valueMissing } : 
                        !valueMissing && props.pattern && !new RegExp(props.pattern).test(v as string) ? { badInput: true } :
                        from === 'input' && !props.editable && !valueMissing ? { badInput: true } : { valid: true };
    emitValidity(validity);
}

onMounted(() => checkValidity(props.modelValue, 'parent'))

watch(() => props.modelValue, _ => {
    const v = props.modelValue
    query.value = v === undefined ? '' : props.formatting(v);
    checkValidity(v, 'parent');
})

function input_changed() {
    if (props.editable) {
        emit('update:modelValue', query.value);
    }
    checkValidity(query.value, 'input');
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
    return;
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
    if (!props.editable) {
        emitValidity({ valid : true });
    }
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
        <input :id="id" :name="name" :aria-label="placeholder" :placeholder="placeholder"
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
.popup {
    position: relative;
}
ul {    
    position: absolute;
    background-color: white;
    width: 100%;
    box-sizing: border-box;
    margin-top: 0;
    padding: 0.5rem 0;
    line-height: 1.3;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 8px;
    box-shadow: 0 5px 10px black
}
li {
    display: block;
    padding-left: 0.5rem;
}
li.active {
    background-color: #16A170;
}
/* NB: ">>>" is Vue.js scoped style specific */
li.active, li.active >>> * {
    color: white;
}
input {
    padding-right: 18px
}
.my-icon.end-of-input {
  margin-left: -18px;
}
</style>
