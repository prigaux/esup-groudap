<script lang="ts">
import { Mright, Subjects } from "@/my_types";
import { throttled_ref } from "@/vue_helpers";
import { ref } from "vue";
import { asyncComputed } from "@vueuse/core";
import * as api from '@/api'

</script>

<script setup lang="ts">
import { at, isEmpty } from 'lodash'
import { forEach, objectSortBy } from "@/helpers";
import SubjectOrGroup from "./SubjectOrGroup.vue";
import MyIcon from "./MyIcon.vue";

let sscfgs = asyncComputed(api.config_subject_sources)

let loading = ref(false)
let search_token = throttled_ref('')

let results = asyncComputed(async () => {
    if (!sscfgs.value) return
    const search_token_ = search_token.throttled
    if (search_token_.length < 3) return;
    const r = await api.search_subjects({ search_token: search_token_, sizelimit: 10 })
    forEach(r, (subjects, ssdn) => {
        const sscfg = sscfgs.value.subject_sources.find(sscfg => sscfg.dn === ssdn);
        if (sscfg) {
            r[ssdn] = objectSortBy(subjects, (subject, _) => at(subject.attrs, sscfg.display_attrs).join(';'))
        }
    })
    return r
}, undefined, loading)

</script>

<template>
<div>
    <input class="search_token" v-model="search_token.real">
    <MyIcon class="fa-spin end-of-input" name="spinner" v-if="loading"/>
</div>
<div class="popup" v-if="results">
    <table>
        <template v-for="(subjects, ssdn) in results">
            <template v-if="!isEmpty(subjects)">
                <thead class="ss_name">{{sscfgs?.subject_sources.find(sscfg => sscfg.dn === ssdn)?.name}}</thead>
                <tbody>
                    <tr v-for="(subject, dn) in subjects">
                        <td><SubjectOrGroup :dn="dn" :subject="subject" :ssdn="ssdn" /></td>
                        <td><button @click="$emit('add', dn)">Ajouter</button></td>
                    </tr>
                </tbody>
            </template>
        </template>
    </table>
</div>
</template>

<style scoped>
table tr.active {
    background-color: #16A170;
}
table tr.divider {
  height: 2px;
  background: #aaa;
}

tr.active, tr.active :deep(*) {
    color: white;
}
input {
    padding-right: 18px
}
.my-icon.end-of-input {
  margin-left: -18px;
}
</style>
