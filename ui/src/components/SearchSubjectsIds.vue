<script lang="ts">
import { ref, watch } from "vue";
import * as api from '@/api'
import Subject from './Subject';
import { partition } from 'lodash';

</script>

<script setup lang="ts">
import { global_abort, vFocus } from '@/vue_helpers';
import { Dn, MonoAttrs, Option, Subjects } from "@/my_types";

let props = defineProps<{
    direct_members: Subjects
    source_dn?: string
}>()
let emit = defineEmits(['dns'])


let ids = ref("")
type errors = "multiple_match" | "no_match"
type oks = { id: string, dn: Dn, attrs: MonoAttrs, ssdn: Dn }[]
let result = ref(undefined as Option<{
    errors: { id: string, error: errors }[]
    need_import: oks
    already_member: oks
}>)

const error2text: Record<errors, string> = {
    no_match: "non trouvé",
    multiple_match: "plusieurs sujets correspondent",
}


watch(ids, () => result.value = undefined)
async function search_ids() {
    result.value = undefined
    const r = await api.subject_ids_to_dns(ids.value.split(/\s+/), props.source_dn, { abort: global_abort })
    const [ errors, oks ] = partition(r, one => "error" in one)
    const [ already_member, need_import ] = partition(oks as oks, one => one.dn in props.direct_members)
 
    // @ts-expect-error
    result.value = { errors, need_import, already_member }
}

function call_import() {
    emit("dns", result.value?.need_import.map(one => one.dn))
    ids.value = ""
}


</script>

<template>
    <div>
        <textarea v-focus v-model="ids"></textarea>
        <p v-if="result">
            <p v-if="result.errors.length" class="warning">
                Erreurs :
                <ul><li v-for="one of result.errors">
                    « {{one.id}} » {{error2text[one.error]}}
                </li></ul>
            </p>
            <p v-if="result.already_member.length">
                Déjà membres :
                <ul>
                    <li v-for="one of result.already_member">
                        <Subject :dn="one.dn" :subject="one" :ssdn="one.ssdn" />
                    </li>
                </ul>
            </p>
            <p v-if="result.need_import.length">
                Membres à importer :
                <ul>
                    <li v-for="one of result.need_import">
                        <Subject :dn="one.dn" :subject="one" :ssdn="one.ssdn" />
                    </li>
                </ul>
            </p>
            <button :disabled="result.need_import.length < 1" @click="call_import">
                Importer {{result.need_import.length}} membres
                <span v-if="result.errors.length"> (et ignorer les erreurs)</span>
            </button>
        </p>
        <p v-else>
            <button @click="search_ids">Analyser</button>
        </p>

   </div>
</template>

<style scoped>
textarea {
    width: 100%;
    height: 10rem;
}
</style>
