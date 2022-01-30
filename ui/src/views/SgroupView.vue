<script lang="ts">
import { isEmpty, last, size } from 'lodash'
import { computed, FunctionDirective, reactive, Ref, ref, UnwrapRef, watch } from 'vue'
import router from '@/router';
import { asyncComputed } from '@vueuse/core'
import { throttled_ref } from '@/vue_helpers';
import { forEach, forEachAsync, some } from '@/helpers';
import { Mright, MyMod, PRecord, SgroupAndMoreOut, Subjects, SubjectsAndCount_with_more, Subjects_with_more } from '@/my_types';
import { right2text } from '@/lib';
import * as api from '@/api'

async function add_sscfg_dns(subjects: Subjects) {
    let sscfgs = (await api.config_subject_sources()).subject_sources
    forEach(subjects as Subjects_with_more, (attrs, dn) => {
        attrs.sscfg_dn = sscfgs.find(one => dn?.endsWith(one.dn))?.dn
    })
}

const flat_members_ = (props: Readonly<{ id: string; }>, sgroup: Ref<SgroupAndMoreOut>) => {
    let show = ref(false)
    let searching = ref(false)
    let search_token = throttled_ref('')
    let results = asyncComputed(async () => {
        if (!show.value) return;
        const search_token_ = search_token.throttled || ''
        //if (search_token_.length < 3) return;

        const r: SubjectsAndCount_with_more = await api.group_flattened_mright({ id: props.id, mright: 'member', sizelimit: 50, search_token: search_token_ })
        let direct_members = sgroup.value?.group?.direct_members || {}
        forEach(r.subjects, (attrs, dn) => {
            attrs.indirect = !(dn in direct_members)
        })
        await add_sscfg_dns(r.subjects)
        return r
    }, undefined, searching)
    return reactive({ show, searching, search_token, results })
}

const add_member_ = () => {
    let show = ref(false)
    let search_token = throttled_ref('')
    let results = asyncComputed(async () => {
        if (!show.value) return;
        const search_token_ = search_token.throttled
        if (search_token_.length < 3) return;
        return api.search_subjects({ search_token: search_token_, sizelimit: 10 })
    })
    return reactive({ show, search_token, results })
}

</script>

<script setup lang="ts">
import SgroupLink from '@/components/SgroupLink.vue';
import MyIcon from '@/components/MyIcon.vue';
import SubjectOrGroup from '@/components/SubjectOrGroup.vue';

const props = withDefaults(defineProps<{
  id: string,
  tabToDisplay: 'direct'|'rights',
}>(), { tabToDisplay: 'direct' })

const set_tabToDisplay = (tabToDisplay: 'direct'|'rights') => {
    const hash = tabToDisplay !== 'direct' ? '#tabToDisplay=' + tabToDisplay : ''
    router.push({ path: '/sgroup', query: { id: props.id }, hash })
}

let tabs = computed(() => {
    return {
        direct: sgroup.value?.group ? "Membres" : "Contenu du dossier",
        rights: 'Privilèges',
    }
})

let sscfgs = asyncComputed(api.config_subject_sources)

let sgroup_force_refresh = ref(0)
let sgroup = asyncComputed(async () => {
    const _ = sgroup_force_refresh.value // asyncComputed will know it needs to re-compute
    let sgroup = await api.sgroup(props.id)
    if (sgroup.group) {
        await add_sscfg_dns(sgroup.group.direct_members)
    }
    return sgroup
})

let flat_members = flat_members_(props, sgroup)

let members = computed(() => {
    if (flat_members.show) {
        return flat_members.results
    } else {
        const direct_members = sgroup.value?.group?.direct_members as Subjects_with_more
        return direct_members ? { count: size(direct_members), subjects: direct_members } : undefined
    }
})
let members_details = computed(() => {
    if (!members.value || !sscfgs.value) return;
    const real_count = size(members.value.subjects);
    return {
        real_count,
        limited: members.value.count !== real_count,
        may_have_indirects: some(members.value.subjects, (attrs, _) => attrs.sscfg_dn === sscfgs.value.groups_dn)
    }
})

let can_modify_member = computed(() => (
    ['updater', 'admin'].includes(sgroup.value?.right))
)

let add_member = add_member_()

async function add_remove_direct_mright(dn: string, mright: Mright, mod: MyMod) {
    await api.modify_members_or_rights(props.id, { [mright]: { [mod]: ['ldap:///' + dn] } })
    if (mright === 'member') {
        sgroup_force_refresh.value++
    } else {
        rights_force_refresh.value++
    }
}
function add_direct_mright(dn: string, mright: Mright) {
    add_remove_direct_mright(dn, mright, 'add')
}
function remove_direct_mright(dn: string, mright: Mright) {
    add_remove_direct_mright(dn, mright, 'delete')
}

let rights_force_refresh = ref(0)
let rights = asyncComputed(async () => {
    const _ = rights_force_refresh.value // asyncComputed will know it needs to re-compute
    if (props.tabToDisplay !== 'rights') return;
    let r = await api.sgroup_direct_rights(props.id)
    await forEachAsync(r, (subjects, _) => add_sscfg_dns(subjects))
    return r
})

const new_ref_watching = <T>(source: any, value: () => T) => {
    const r = ref(value())
    watch(source, () => {
        r.value = value() as UnwrapRef<T>
    })
    return r
}

type Attr = 'ou'|'description'
let modify_attrs = new_ref_watching(() => props.id, () => ({} as PRecord<Attr, { prev: string, status?: 'canceling'|'saving' }>))
const start_modify_attr = (attr: Attr) => {
    modify_attrs.value[attr] = { prev: sgroup.value.attrs[attr] }
}
const cancel_modify_attr = (attr: Attr, opt?: 'force') => {
    let state = modify_attrs.value[attr]
    if (state) {
        if (sgroup.value.attrs[attr] !== state.prev && opt !== 'force') {
            if (state.status) return
            state.status = 'canceling'
            if (!confirm('Voulez vous perdre les modifications ?')) {
                setTimeout(() => { if (state?.status === 'canceling') state.status = undefined }, 1000)
                return
            }
        }
        // restore previous value
        sgroup.value.attrs[attr] = state.prev
    }
    // stop modifying this attr:
    modify_attrs.value[attr] = undefined
}
const delayed_cancel_modify_attr = (attr: Attr) => {
    setTimeout(() => cancel_modify_attr(attr), 200)
}
const send_modify_attr = async (attr: Attr) => {
    let state = modify_attrs.value[attr]
    if (state) state.status = 'saving'
    await api.modify_sgroup_attrs(props.id, sgroup.value.attrs)
    modify_attrs.value[attr] = undefined
}

const vFocus : FunctionDirective<HTMLElement, void> = (el) => { 
    el.focus()
}
const vClickWithoutMoving : FunctionDirective<HTMLElement, false | (() => void)> = (el, binding) => {
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

const delete_sgroup = async () => {
    if (confirm("Supprimer ?")) {
        await api.delete_sgroup(props.id)
        const parent = last(sgroup.value.parents)
        router.push(parent?.right ? { path: '/sgroup', query: { id: parent.sgroup_id } } : { path: "/" })
    }
}
</script>

<template>
<div v-if="sgroup">
    <div style="float: right">
        ID : {{props.id}}
    </div>

    <a href=".">Accueil</a> &gt;
    <span v-for="(parent, i) in sgroup.parents">
        <SgroupLink :sgroup="parent" />
        <span v-if="i < sgroup.parents.length"> &gt; </span>
    </span>

    <h2>
        <MyIcon :name="sgroup.stem ? 'folder' : 'users'" class="on-the-left" />
    </h2>
    <template v-if="sgroup.right === 'admin'">
        <form v-if="modify_attrs.ou" @submit.prevent="send_modify_attr('ou')" class="modify_attr">
            <h2><input v-focus v-model="sgroup.attrs.ou" @focusout="delayed_cancel_modify_attr('ou')" @keydown.esc="cancel_modify_attr('ou')"></h2>
            <MyIcon name="check" class="on-the-right" @click="send_modify_attr('ou')" />
            <MyIcon name="close" class="on-the-right" @click="cancel_modify_attr('ou', 'force')" />
        </form>
        <span v-else>
            <h2 v-click-without-moving="() => start_modify_attr('ou')">{{sgroup.attrs.ou}}</h2>
            <MyIcon name="pencil" class="on-the-right" @click="start_modify_attr('ou')" />
        </span>       
    </template>
    <h2 v-else>{{sgroup.attrs.ou}}</h2>

    <fieldset>
        <legend>
            <h4>Description</h4>
            <template v-if="sgroup.right === 'admin'">
                <template v-if="modify_attrs.description">
                    <MyIcon name="check" class="on-the-right" @click="send_modify_attr('description')" />
                    <MyIcon name="close" class="on-the-right" @click="cancel_modify_attr('description', 'force')" />
                </template>
                <template v-else>
                    <MyIcon name="pencil" class="on-the-right" @click="start_modify_attr('description')" />
                </template>
            </template>
        </legend>
        <textarea v-if="modify_attrs.description" class="description" v-model="sgroup.attrs.description" 
            v-focus @focusout="delayed_cancel_modify_attr('description')" @keydown.esc="cancel_modify_attr('description')"
            @keypress.enter.ctrl="send_modify_attr('description')"
            >
        </textarea>
        <div v-else class="description" v-click-without-moving="sgroup.right === 'admin' && (() => start_modify_attr('description'))">
            {{sgroup.attrs.description}}
        </div>
    </fieldset>

    <p></p>
    <fieldset>
        <legend>
            <label v-for="(text, key) of tabs" @click="set_tabToDisplay(key)">
                <input type="radio" name="legend_choices" :value='key' :checked="tabToDisplay === key">
                    {{text}}
            </label>
        </legend>

        <div v-if="tabToDisplay === 'rights'">
       
            <span v-if="sgroup.stem">
                Les entités ayant des privilèges sur ce dossier <b>et tous les sous-dossiers et sous-groupes</b>
            </span>
            <span v-else>
                Les entités ayant des privilèges sur ce groupe
            </span>
            <div v-if="rights">
                <div v-if="isEmpty(rights)"> <p></p> <i>Aucun</i> </div>
                <table class="with-theads" v-else>
                  <template v-for="(subjects, right) in rights">
                    <thead><h5>Droit "{{right2text[right]}}"</h5></thead>
                    <tbody>
                        <tr v-for="(subject, dn) in subjects">
                            <td><SubjectOrGroup :dn="dn" :subject="subject" /></td>
                            <td><button v-if="sgroup.right == 'admin'" @click="remove_direct_mright(dn, right)">Supprimer</button></td>
                        </tr>
                    </tbody>
                  </template>
                </table>
            </div>
        </div>
        <ul v-else-if="sgroup.stem">
            <div v-if="isEmpty(sgroup.stem.children)"> <i>Vide</i> </div>
            <li v-for="(attrs, id) in sgroup.stem.children">
                <MyIcon name="folder" class="on-the-left" />
                <SgroupLink :sgroup="{ attrs }" :id="id" />
            </li>
        </ul>
        <div v-else-if="sgroup.group">
            <div v-if="add_member.show">
                Recherchez un utilisateur/groupe/... <button @click="add_member.show = false">fermer</button> <br>
                <input class="search_token" v-model="add_member.search_token.real">
                <fieldset v-if="add_member.results">
                    <legend>Résultats de recherche</legend>
                    <table>
                        <template v-for="(subjects, ssdn) in add_member.results">
                            <template v-if="!isEmpty(subjects)">
                                <thead class="ss_name">{{sscfgs?.subject_sources.find(sscfg => sscfg.dn === ssdn)?.name}}</thead>
                                <tbody>
                                    <tr v-for="(subject, dn) in subjects">
                                        <td><SubjectOrGroup :dn="dn" :subject="subject" :ssdn="ssdn" /></td>
                                        <td><button @click="add_direct_mright(dn, 'member')">Ajouter</button></td>
                                    </tr>
                                </tbody>
                            </template>
                        </template>
                    </table>
                </fieldset>
            </div>
            <button @click="add_member.show = true" v-else-if="can_modify_member">Ajouter des membres</button>
            <button @click="flat_members.show = !flat_members.show" v-if="members_details?.may_have_indirects">{{flat_members.show ? "Cacher les indirects" : "Voir les indirects"}}</button>

            <div style="height: 1rem"></div>

            <div v-if="!members || flat_members.searching">Veuillez patentier...</div>
            <div v-else-if="members">
                <p>Nombre : {{members_details?.real_count}}
                    <span v-if="members_details?.limited"> / {{members?.count}}</span>
                </p>

                    <div v-if="flat_members.show">
                        <div v-if="members_details?.limited && !flat_members.search_token.real">Affichage limité, chercher dans les membres</div>
                        <div v-else>Filtrer les membres</div>
                        <input class="search_token" v-model="flat_members.search_token.real">
                    </div>
                <div v-if="isEmpty(members?.subjects)"> <i>Aucun</i> </div>
                <table>
                    <tr v-for="(attrs, dn) in members?.subjects">
                        <td><SubjectOrGroup :dn="dn" :subject="attrs" /></td>
                        <td>
                            <i v-if="attrs.indirect">Indirect</i>
                            <button v-else-if="can_modify_member" @click="remove_direct_mright(dn, 'member')">Supprimer</button>
                        </td>
                    </tr>
                </table>
            </div>
        </div>
    </fieldset>

    <ul class="inline">
        <template v-if="sgroup.stem && sgroup.right === 'admin'">
            <li><RouterLink  :to="{ path: 'new_sgroup', query: { parent_id: props.id } }">
                <button>Créer un groupe</button>
            </RouterLink></li>

            <li><RouterLink  :to="{ path: 'new_sgroup', query: { parent_id: props.id, is_stem: true } }">
                <button>Créer un dossier</button>
            </RouterLink></li>
        </template>

        <template v-if="!sgroup.stem || isEmpty(sgroup.stem.children)">
            <li><button @click="delete_sgroup">Supprimer le {{sgroup.stem ? 'dossier' : 'groupe'}}</button></li>
        </template>
    </ul>

    <p><i>Mes droits sur ce {{sgroup.stem ? 'dossier' : 'groupe'}} : {{right2text[sgroup.right]}}</i></p>

</div>
</template>

<style scoped>
textarea {
    width: 100%;
    height: 10rem;
}
.modify_attr {
    display: inline-block;
}
.my-icon-check, .my-icon-close {
    --my-icon-size: 16px;
}
</style>