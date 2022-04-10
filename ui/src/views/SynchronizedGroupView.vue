<script lang="ts">
import { asyncComputed } from '@vueuse/core'
import { RemoteSqlQuery } from '@/my_types';

import Prism from 'prismjs'
import 'prismjs/components/prism-sql'
import 'prismjs/themes/prism.css'

import * as api from '@/api'
import { computed, ref, watch } from 'vue'
import { setRefAsync, watchOnceP } from '@/vue_helpers'

const indent_sql_query = (query: string) => {
    let r = ""
    let indentation = [{ prefix: "", has_select: true }]
    let indented_prev_line = true
    for (const token of Prism.tokenize(query, Prism.languages.sql)) {
        if (token instanceof Prism.Token) {
            const content = token.content.toString()
            const content_lower = content.toLowerCase()
            let indent = false

            if (token.type === 'punctuation') {
                if (content === '(') {
                    indentation.unshift({ ...indentation[0], has_select: false })
                } else if (content === ')') {
                    indent = indentation[0].has_select
                    indentation.shift()
                }
            } else if (token.type === 'keyword' && ["select", "from", "where", "inner"].includes(content_lower)) {
                indent = true
                if (!indentation[0].has_select && content_lower === 'select') {
                    indentation[0].has_select = true
                    indentation[0].prefix += "  "
                }
            } else if (!indented_prev_line && token.type === 'keyword' && ["join"].includes(content_lower)) {
                indent = true
            }

            if (indent) {
                r += (r ? "\n" : "") + indentation[0].prefix
            }
            r += content
            indented_prev_line = indent
        } else {
            const content = token.replace(/\s+$/, ' ') // simplify spaces
            r += content
        }
    }
    return r
}

</script>

<script setup lang="ts">
import { isEmpty, size, trim } from 'lodash'
import { maySingleton } from '@/vue_helpers'

const props = defineProps<{
    id: string,
    remote_sql_query: RemoteSqlQuery,
}>()
defineEmits(['save'])

const remotes = asyncComputed(() => api.config_remotes())
const ldapCfg = asyncComputed(api.config_ldap)

const chosen_subject_source = computed(() => (
    ldapCfg.value?.subject_sources.find(sscfg => sscfg.dn === props.remote_sql_query.to_subject_source.ssdn)
))

watch(() => props.remote_sql_query.select_query, (query) => {
    if (query && query.length > 100 && !trim(query).match(/\n/)) {
        const indented = indent_sql_query(query)
        if (indented !== query) {
            props.remote_sql_query.select_query = indented
        }
    }
})
const highlighted_select_query = computed(() => (
    Prism.highlight(props.remote_sql_query.select_query + ' ', Prism.languages.sql, 'sql')
))

let last_test_remote_query_sql = ref(undefined as api.TestRemoteQuerySql | undefined)
const test_remote_query_sql = async () => {
    const val = await api.test_remote_query_sql(props.id, props.remote_sql_query)
    if (val.ss_guess) {
        props.remote_sql_query.to_subject_source = val.ss_guess[0]
    }
    setRefAsync(last_test_remote_query_sql,
                watchOnceP(() => props.remote_sql_query, () => undefined, { deep: true }),
                val)
}

</script>

<template>
<form @submit.prevent="$emit('save')" v-if="remotes">
    <label>
        <span class="label">Remote</span>
            <select v-model="remote_sql_query.remote_cfg_name">
                <option value="">Choisir</option>    
                <option v-for="(_cfg, name) in remotes" :value="name">{{name}}</option>
            </select>
    </label>
    <label class="next-to-previous"><span class="label"></span>
        <div v-for="cfg in maySingleton(remotes[remote_sql_query.remote_cfg_name])">
            <small>
                <span class="key">hôte:</span> {{cfg.host}}
                <span class="key">db:</span> {{cfg.db_name}}
                <span class="key">periodicité:</span> {{cfg.periodicity}}
            </small>
        </div>
    </label>

    <label>
        <span class="label">Requête</span>

        <div class="remote_sql_query">
        <pre class="language-sql">{{
            }}<code class="language-sql" v-html="highlighted_select_query"></code>{{
            }}<textarea spellcheck="false" v-model="remote_sql_query.select_query"
                @keypress.enter.ctrl="$emit('save')"
            ></textarea>{{
        }}</pre>
        </div>
    </label>

    <label>
        <span class="label"></span>
        <button class="warning" v-if="remote_sql_query.remote_cfg_name && remote_sql_query.select_query" @click.prevent="test_remote_query_sql">Valider la requête et deviner les paramètres ci-dessous</button>
    </label>

    <label class="next-to-previous"><span class="label"></span>
        <TransitionGroup>
        <div v-for="lt in maySingleton(last_test_remote_query_sql)">
            <p>La requête a renvoyé {{lt.count}} valeurs. 
                <template v-if="lt.count">
                    <br>
                    <template v-if="lt.values_truncated">Extrait :</template>
                    <blockquote>
                        <pre>{{lt.values.join("\n")}}</pre>
                    </blockquote>
                </template>
            </p>
            <p style="margin-bottom: 0;" v-if="lt.ss_guess?.[1]">
                Les paramètres ci-dessous ont été devinés ({{size(lt.ss_guess?.[1])}} / {{lt.values.length}} sujets trouvés) :
            </p>
            <p class="warning" v-else>
                <span class="big">⚠</span> Aucune source de sujets ne correspond aux valeurs
            </p>
        </div>
        </TransitionGroup>
    </label>

    <label v-if="ldapCfg">
        <span class="label">Source de sujets LDAP</span>
        <select v-model="remote_sql_query.to_subject_source.ssdn">
            <option value="">Aucun (les valeurs sont des DNs)</option>    
            <option v-for="sscfg in ldapCfg.subject_sources" :value="sscfg.dn">{{sscfg.name}}</option>
        </select>
    </label>

    <label v-if="ldapCfg && remote_sql_query.to_subject_source.ssdn">
        <span class="label">Attribut LDAP</span>
        <input v-model="remote_sql_query.to_subject_source.id_attr">
    </label>
    <label class="next-to-previous"><span class="label"></span>
        <small v-if="!isEmpty(chosen_subject_source?.id_attrs)">
            Suggestions : {{chosen_subject_source?.id_attrs?.join(', ')}}
        </small>
    </label>
</form>
</template>

<style scoped>
label {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
}
label.next-to-previous {
    margin-top: -1rem;
}
label > * {
    flex-basis: fill;
    flex-grow: 1;
}
label > span.label {
    display: inline-block;
    max-width: 12rem;
}
label > span:not(.label) {
    flex-grow: 0;
}

.remote_sql_query {
    border: 1px solid #00225E;
    border-radius: 8px;
    padding: 0 0.5rem;
}

pre.language-sql {
    position: relative;
    padding: 0;
    background-color: #fff;
}
textarea {
    position: absolute;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    border: 0;
    padding: 0;

    line-height: 1.5;

    color: transparent; /* #00000060; */
    background: transparent;
    caret-color: #333333;

    resize: none;
    overflow: hidden; /* scrollbars make a mess, let pre grow. But sometimes a small scrollbar would like to appear... */
}
textarea::selection {
    color: #000000A0;
}

.v-enter-active, .v-leave-active {
  transition: all 0.5s ease;
}
.v-enter-from, .v-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.key {
    color: #00225E
}
.big {
    font-size: 150%;
}
</style>