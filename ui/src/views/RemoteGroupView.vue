<script lang="ts">
import { asyncComputed } from '@vueuse/core'
import { RemoteSqlQuery } from '@/my_types';

import Prism from 'prismjs'
import 'prismjs/components/prism-sql'
import 'prismjs/themes/prism.css'

import * as api from '@/api'
import { computed } from 'vue';

</script>

<script setup lang="ts">
import { isEmpty } from 'lodash'

const props = defineProps<{
    id: string,
    remote_sql_query: RemoteSqlQuery,
}>()
defineEmits(['save'])

const remotes = asyncComputed(() => api.config_remotes())
const sscfgs = asyncComputed(api.config_subject_sources)

const chosen_subject_source = computed(() => (
    sscfgs.value?.subject_sources.find(sscfg => sscfg.dn === props.remote_sql_query.to_subject_source.ssdn)
))

const highlighted_select_query = computed(() => (
    Prism.highlight(props.remote_sql_query.select_query + ' ', Prism.languages.sql, 'sql')
))

const guess_to_ss_id_attr = async () => {
    props.remote_sql_query.to_subject_source.id_attr = await api.test_remote_query_sql(props.id, props.remote_sql_query)    
}

</script>

<template>
<form @submit.prevent="$emit('save')">
    <label>
        <span class="label">Remote</span>
        <select v-model="remote_sql_query.remote_cfg_name">
            <option value="">Choisir</option>    
            <option v-for="(cfg, name) in remotes" :value="name">{{name}} ({{cfg.host}}/{{cfg.db_name}} @{{cfg.periodicity}})</option>
        </select>
    </label>
    <label>
        <span class="label">Requête</span>

        <div class="remote_sql_query">
        <pre class="language-sql">{{
            }}<code class="Xlanguage-sql" v-html="highlighted_select_query"></code>{{
            }}<textarea spellcheck="false" v-model="remote_sql_query.select_query"
                @keypress.enter.ctrl="$emit('save')"
            ></textarea>{{
        }}</pre>
        </div>
    </label>
    <label v-if="sscfgs">
        <span class="label">Subject source</span>
        <select v-model="remote_sql_query.to_subject_source.ssdn">
            <option value="">Aucun (les valeurs sont des DNs)</option>    
            <option v-for="sscfg in sscfgs.subject_sources" :value="sscfg.dn">{{sscfg.name}}</option>
        </select>
    </label>

    <label v-if="sscfgs && remote_sql_query.to_subject_source.ssdn">
        <span class="label">Subject id attr</span>
        <button v-if="!remote_sql_query.to_subject_source.id_attr" @click.prevent="guess_to_ss_id_attr">Valider la requête et deviner</button>
        ou forcer
        <input v-model="remote_sql_query.to_subject_source.id_attr">
        <span v-if="!isEmpty(chosen_subject_source?.id_attrs)">
            Suggestions : {{chosen_subject_source?.id_attrs?.join(', ')}}
        </span>
    </label>
</form>
</template>

<style scoped>
label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
}
label > * {
    flex-basis: fill;
    flex-grow: 1;
}
label > span.label {
    display: inline-block;
    max-width: 8rem;
}
label > button, label > span:not(.label) {
    flex-grow: 0;
}

.remote_sql_query {
    border: 1px solid #00225E;
    border-radius: 8px;
    padding: 0 0.5rem;
}

.language-sql {
    position: relative;
    padding: 0;
    background-color: #fff;
}
.language-sql textarea {
    position: absolute;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    border: 0;
    padding: 0;

    line-height: 1.5;

    color: #00000060;
    background: transparent;
    caret-color: #333333;

    resize: none;
    overflow: hidden; /* scrollbars make a mess, let pre grow. But sometimes a small scrollbar would like to appear... */
}
.language-sql textarea::selection {
    color: #000000A0;
}

.language-sql.err {
    border-color: red;
}

</style>