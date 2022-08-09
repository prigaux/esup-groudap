import ldap_filter from "./ldap_filter"
import { sgroup_filter } from "./ldap_helpers";
import { one_group_matches_filter } from "./ldap_wrapper";
import { is_sgroup_existing, user_has_right_on_sgroup_filter, user_urls_ } from "./my_ldap";
import { LoggedUser, MySet, Right } from "./my_types"
import { parent_stem, parent_stems } from "./stem_helpers";

export async function user_has_right_on_at_least_one_sgroups(user_urls: MySet<string>, ids: string[], right: Right): Promise<boolean> {
    const ids_filter = ldap_filter.or(ids.map(sgroup_filter))
    const filter = ldap_filter.and2(
        ids_filter,
        user_has_right_on_sgroup_filter(user_urls, right),
    );
    
    return await one_group_matches_filter(filter)
}

export async function check_right_on_any_parents(logged_user: LoggedUser, id: string, right: Right) {
    if ('TrustedAdmin' in logged_user) {
        const parent_stem_ = parent_stem(id)
        if (parent_stem_ && !await is_sgroup_existing(parent_stem_)) { 
            throw `stem ${parent_stem_} does not exist`
        }    
    } else {
        console.log("  check_right_on_any_parents(%s, %s)", id, right);
        const user_urls = await user_urls_(logged_user.User)
        const parents = parent_stems(id);
        if (await user_has_right_on_at_least_one_sgroups(user_urls, parents, right)) {
            // ok!    
        } else {
            throw `no right on ${id} parents`
        }
    }
}

export async function check_right_on_self_or_any_parents(logged_user: LoggedUser, id: string, right: Right) {
    if ('TrustedAdmin' in logged_user) {
        // ok!
    } else {
        const user = logged_user.User;
        console.log("  check_right_on_self_or_any_parents(%s, %s)", id, right);
        const user_urls = await user_urls_(user)
        const self_and_parents = [ id, ...parent_stems(id) ]
        if (await user_has_right_on_at_least_one_sgroups(user_urls, self_and_parents, right)) {
            // ok!
        } else {
            throw `no right on ${id}`
        }
    }
}
