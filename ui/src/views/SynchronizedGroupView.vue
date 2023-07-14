<script lang="ts">
import { asyncComputed } from '@vueuse/core'
import { RemoteQuery } from '@/my_types';

import Prism from 'prismjs'
import 'prismjs/components/prism-sql'
import 'prismjs/themes/prism.css'

import * as api from '@/api'
import * as ldap_filter_parser from '@/ldap_filter_parser'
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
    remote_query: RemoteQuery,
}>()
defineEmits(['save'])

const remotes = asyncComputed(() => api.config_remotes())
const ldapCfg = asyncComputed(api.config_ldap)

const remote = computed(() => remotes.value?.[props.remote_query.remote_cfg_name])
watch(() => remote.value, (remote) => {
    props.remote_query.isSql = remote.driver !== 'ldap'
})

const chosen_subject_source = computed(() => (
    ldapCfg.value?.subject_sources.find(sscfg => sscfg.dn === props.remote_query?.to_subject_source?.ssdn)
))

const select_or_filter = computed(() => (
    props.remote_query.isSql ? props.remote_query.select_query : props.remote_query.filter
))
const set_select_or_filter = (val: string) => (
    props.remote_query.isSql ? (props.remote_query.select_query = val) : (props.remote_query.filter = val)
)

watch(() => select_or_filter.value, (query) => {
    console.log(query?.length)
    if (query && query.length > 100 && !trim(query).match(/\n/)) {
        const indented = (props.remote_query.isSql ? indent_sql_query : ldap_filter_parser.indent)(query)
        if (indented !== query) {
            set_select_or_filter(indented)
        }
    }
})
const highlighted_select_or_filter = computed(() => (
    (select_or_filter.value ? 
        (props.remote_query.isSql ?
            Prism.highlight(select_or_filter.value, Prism.languages.sql, 'sql') :
            ldap_filter_parser.to_html(select_or_filter.value || '')) :
        '') + ' ' /* needed if value ends with \n + avoid empty textarea */
))

let last_test_remote_query = ref(undefined as api.TestRemoteQuery | undefined)
const test_remote_query = async () => {
    const val = await api.test_remote_query(props.id, props.remote_query)
    if (val.ss_guess && props.remote_query.isSql) {
        props.remote_query.to_subject_source = val.ss_guess[0]
    }
    setRefAsync(last_test_remote_query,
                watchOnceP(() => props.remote_query, () => undefined, { deep: true }),
                val)
}

</script>

<template>
<form @submit.prevent="$emit('save')" v-if="remotes">
    <label>
        <span class="label">Remote</span>
            <select v-model="remote_query.remote_cfg_name">
                <option value="">Choisir</option>    
                <option v-for="(_cfg, name) in remotes" :value="name">{{name}}</option>
            </select>
    </label>
    <label class="next-to-previous"><span class="label"></span>
        <div v-if="remote">
            <small>
                <template v-if="remote.driver === 'ldap'">
                  <span class="key">uri:</span> {{remote.connect.uri.join(" ")}}
                  <span class="key" v-if="remote.search_branch">search_branch:</span> {{remote.search_branch}}
                </template>
                <template v-else>
                  <span class="key">hôte:</span> {{remote.host}}
                  <span class="key">db:</span> {{remote.db_name}}
                </template>
                &nbsp;
                <span class="key">periodicité:</span> {{remote.periodicity}}
            </small>
        </div>
    </label>

    <label v-if="remote_query.isSql !== undefined">
        <span class="label">{{remote_query.isSql ? 'Requête' : 'Filtre'}}</span>

        <div class="remote_query">
        <pre class="language-sql language-ldap">{{
            }}<code class="language-sql language-ldap" v-html="highlighted_select_or_filter"></code>{{
            }}<textarea spellcheck="false" :value="select_or_filter" @input="set_select_or_filter($event.target?.value)"
                @keypress.enter.ctrl="$emit('save')"
            ></textarea>{{
        }}</pre>
        </div>
    </label>

    <label>
        <span class="label"></span>
        <button v-if="remote_query.remote_cfg_name && select_or_filter" 
            class="warning" 
            @click.prevent="test_remote_query">
            Valider la requête<span v-if="remote_query.isSql"> et deviner les paramètres ci-dessous</span>
        </button>
    </label>

    <label class="next-to-previous"><span class="label"></span>
        <TransitionGroup>
        <div v-for="lt in maySingleton(last_test_remote_query)">
            <p>La requête a renvoyé {{lt.count}} valeurs. 
                <template v-if="lt.count">
                    <br>
                    <template v-if="lt.values_truncated">Extrait :</template>
                    <blockquote>
                        <pre>{{lt.values.join("\n")}}</pre>
                    </blockquote>
                </template>
            </p>
            <template v-if="remote_query.isSql">
            <p style="margin-bottom: 0;" v-if="lt.ss_guess?.[1]">
                Les paramètres ci-dessous ont été devinés ({{size(lt.ss_guess?.[1])}} / {{lt.values.length}} sujets trouvés) :
            </p>
            <p class="warning" v-else>
                <span class="big">⚠</span> Aucune source de sujets ne correspond aux valeurs
            </p>
            </template>
        </div>
        </TransitionGroup>
    </label>

    <template v-if="ldapCfg && remote_query.isSql">
    <label>
        <span class="label">Source de sujets LDAP</span>
        <select v-model="remote_query.to_subject_source.ssdn">
            <option value="">Aucun (les valeurs sont des DNs)</option>    
            <option v-for="sscfg in ldapCfg.subject_sources" :value="sscfg.dn">{{sscfg.name}}</option>
        </select>
    </label>

    <label v-if="remote_query.to_subject_source.ssdn">
        <span class="label">Attribut LDAP</span>
        <input v-model="remote_query.to_subject_source.id_attr">
    </label>
    <label class="next-to-previous"><span class="label"></span>
        <small v-if="!isEmpty(chosen_subject_source?.id_attrs)">
            Suggestions : {{chosen_subject_source?.id_attrs?.join(', ')}}
        </small>
    </label>
    </template>
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

.remote_query {
    border: 1px solid #00225E;
    border-radius: 8px;
    padding: 0 0.5rem;
}

pre {
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

<style>
.invalid {
    font-weight: bold;
    color: red;
}
.punctuation0 {
    background-color: #ffa;
    color: #004;
}
.punctuation1 {
    background-color: #cff;
    color: #422;
}
.punctuation2 {
    background-color: #fef;
    color: #0c0;
}
.punctuation3 {
    background-color: #aaf;
    color: #400;
}
.punctuation4 {
    background-color: #faa;
    color: #242;
}
.punctuation5 {
    background-color: #fef;
    color: #00c;
}
</style>