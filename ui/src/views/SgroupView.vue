<script lang="ts">
import { forEach, isEmpty, size } from 'lodash'
import { computed, Ref, ref, watchEffect } from 'vue'
import { asyncComputed } from '@vueuse/core'

import { Mright, MyMod, MyMods, PRecord, Right, SgroupAndMoreOut, SgroupsWithAttrs, SubjectAttrs_with_indirect, Subjects, SubjectsAndCount_with_indirect, SubjectSourceConfig } from '@/my_types';
import * as api from '@/api'
</script>

<script setup lang="ts">
import SgroupLink from '@/components/SgroupLink.vue';
import MyIcon from '@/components/MyIcon.vue';
import { right2text } from '@/lib';
import SubjectOrGroup from '@/components/SubjectOrGroup.vue';

const props = defineProps<{
  id: string,
}>()

let sscfgs = asyncComputed(api.config_subject_sources)

let sgroup = ref(undefined as SgroupAndMoreOut | undefined)
watchEffect(updateSgroup)

let rights = ref(undefined as PRecord<Right, Subjects> | undefined)

let showAddMember = ref(false)
let addMember_search_token = ref('')
let addMember_search_results = ref(undefined as Record<Right, Subjects> | undefined)

let members = computed(() => {
    if (showIndirect.value) {
        return flat_members.value
    } else {
        const direct_members = sgroup.value?.group?.direct_members
        return direct_members ? { count: size(direct_members), subjects: direct_members } : undefined
    }
})
let members_details = computed(() => {
    if (!members.value) return;
    const real_count = size(members.value.subjects)
    return {
        real_count,
        limited: members.value.count !== real_count
    }
})

let flat_members = ref(undefined as SubjectsAndCount_with_indirect | undefined)
let showIndirect = ref(false)
let flat_member_search_token = ref('')

async function addMember_search() {
    addMember_search_results.value = await api.search_subjects({ search_token: addMember_search_token.value, sizelimit: 10 })    
}

let tabToDisplay = ref('direct' as 'direct'|'rights')

async function updateSgroup() {
    const val = await api.sgroup(props.id)
    sgroup.value = val
    updateMembers()
}
async function updateRights() {
    rights.value = undefined
    const r = await api.sgroup_direct_rights(props.id)
    rights.value = r
}

async function searchFlatMembers() {
    const r: SubjectsAndCount_with_indirect = await api.group_flattened_mright({ id: props.id, mright: 'member', sizelimit: 50, search_token: flat_member_search_token.value })
    let direct_members = sgroup.value?.group?.direct_members || {}
    forEach(r.subjects, (attrs, dn) => {
        console.log(dn, dn in direct_members)
        attrs.indirect = !(dn in direct_members)
    })
    flat_members.value = r
}

function updateMembers(noCache? : boolean) {
    if (noCache) flat_members.value = undefined
    if (showIndirect.value && !flat_members.value) {
        searchFlatMembers().then(_ => updateMembers()) // not waiting for result async
    }
}

async function add_remove_direct_mright(dn: string, mright: Mright, mod: MyMod) {
    await api.modify_members_or_rights(props.id, { [mright]: { [mod]: ['ldap:///' + dn] } })
    if (mright === 'member') {
        updateSgroup()
    } else {
        updateRights()
    }
}
function add_direct_mright(dn: string, mright: Mright) {
    add_remove_direct_mright(dn, mright, 'add')
}
function remove_direct_mright(dn: string, mright: Mright) {
    add_remove_direct_mright(dn, mright, 'delete')
}

</script>

<template>
<div v-if="sgroup">
    <a href=".">Accueil</a> &gt;
    <span v-for="(parent, i) in sgroup.parents">
        <SgroupLink :attrs="parent" />
        <span v-if="i < sgroup.parents.length"> &gt; </span>
    </span>

    <h2>
        <MyIcon :name="sgroup.stem ? 'folder' : 'users'" class="on-the-left" />
        {{sgroup.ou}}
    </h2>

    <fieldset>
        <legend><h4>Description</h4></legend>
        <div class="description">{{sgroup.description}}</div>
    </fieldset>

    <p></p>
    <fieldset>
        <label @click="tabToDisplay = 'direct'">
            <input type="radio" name="legend_choices" value='direct' v-model="tabToDisplay">
            {{sgroup.group ? "Membres" : "Contenu du dossier"}}
        </label>
        <label @click="tabToDisplay = 'rights'">
            <input type="radio" name="legend_choices" value='rights' v-model="tabToDisplay">
            Privilèges
        </label>

        <div v-if="tabToDisplay === 'rights'">
            <span v-if="sgroup.stem">
                Les entités ayant des privilèges sur ce dossier <b>et tous les sous-dossiers et sous-groupes</b>
            </span>
            <span v-else>
                Les entités ayant des privilèges sur ce groupe
            </span>
            <div v-if="rights">
                <div v-if="isEmpty(rights)"> <p></p> <i>Aucun</i> </div>
                <div v-for="(subjects, right) in rights">
                <h5>Droit "{{right2text[right]}}"</h5>
                <ul>
                    <li v-for="(subject, dn) in subjects">
                        <SubjectOrGroup :dn="dn" :attrs="subject" />
                        <button @click="remove_direct_mright(dn, right)">Supprimer</button>
                    </li>
                </ul>
                </div>
            </div>
        </div>
        <ul v-else-if="sgroup.stem">
            <div v-if="isEmpty(sgroup.stem.children)"> <p></p> <i>Vide</i> </div>
            <li v-for="(attrs, id) in sgroup.stem.children">
                <MyIcon name="folder" class="on-the-left" />
                <SgroupLink :attrs="attrs" :id="id" />
            </li>
        </ul>
        <div v-else-if="sgroup.group">
            <div style="height: 1rem"></div>

            <div v-if="showAddMember">
                Recherchez un utilisateur/groupe/... <button @click="showAddMember = false">fermer</button> <br>
                <form @submit.prevent="addMember_search">
                    <input class="search_token" v-model="addMember_search_token">
                </form>
                <fieldset v-if="addMember_search_results">
                    <legend>Résultats de recherche</legend>
                    <ul>
                        <template v-for="(subjects, ss) in addMember_search_results">
                            <li v-if="!isEmpty(subjects)">
                                <span class="ss_name">{{sscfgs?.find(sscfg => sscfg.dn === ss)?.name}}</span>
                                <ul>
                                    <li v-for="(subject, dn) in subjects">
                                        <SubjectOrGroup :dn="dn" :attrs="subject" />
                                        <button @click="add_direct_mright(dn, 'member')">Ajouter</button>
                                    </li>
                                </ul>
                            </li>
                        </template>
                    </ul>
                </fieldset>
            </div>
            <button @click="showAddMember = true" v-else>Ajouter des membres</button>
            <button @click="showIndirect = !showIndirect; updateMembers()">{{showIndirect ? "Cacher les indirects" : "Voir les indirects"}}</button>

            <div style="height: 1rem"></div>

            <div v-if="!members">Veuillez patentier...</div>
            <div v-else-if="members">
                Nb : {{members_details?.real_count}}
                    <span v-if="members_details?.limited"> / {{members?.count}}</span>

                    <div v-if="showIndirect">
                        <div v-if="members_details?.limited && !flat_member_search_token">Affichage limité, chercher dans les membres</div>
                        <div v-else>Filtrer les membres</div>
                        <form @submit.prevent="updateMembers(true)">
                            <input class="search_token" v-model="flat_member_search_token">
                        </form>
                    </div>
                <div v-if="isEmpty(members?.subjects)"> <p></p> <i>Aucun</i> </div>
                <table>
                    <tr v-for="(attrs, dn) in members?.subjects">
                        <SubjectOrGroup :dn="dn" :attrs="attrs" />
                        <td>
                            <i v-if="attrs.indirect">Indirect</i>
                            <button v-else @click="remove_direct_mright(dn, 'member')">Supprimer</button>
                        </td>
                    </tr>
                </table>
            </div>
        </div>
    </fieldset>


    <p><i>Mes droits sur ce groupe : {{right2text[sgroup.right]}}</i></p>

</div>
</template>

