import * as assert from 'assert';
import {it} from '@jest/globals';

import conf from "../conf"
import { StemConfig } from '../my_types';
import { is_grandchild, parent_stem, parent_stems, validate_sgroup_id } from '../stem_helpers';

const stem_config = (separator = ".") : StemConfig => (
    { filter: "(objectClass=organizationalRole)", separator, root_id: "" }    
)

it('parent_stem should work', () => {
    conf.ldap.stem = stem_config();
    assert.equal(parent_stem("a.b.c"), "a.b.");
    assert.equal(parent_stem("a.b.c."), "a.b.");
    assert.equal(parent_stem("a"), "");
    assert.equal(parent_stem("a."), "");
    assert.equal(parent_stem(""), undefined);

    assert.deepEqual(parent_stems("a.b.c"), ["a.b.", "a.", ""]);
    assert.deepEqual(parent_stems("a."), [""]);
    assert.deepEqual(parent_stems(""), []);
})

it('parent_stem should work with another separator', () => {
    conf.ldap.stem = stem_config(":");
    assert.equal(parent_stem("a:b:c"), "a:b:");
    assert.equal(parent_stem("a:b:c."), "a:b:");
    assert.equal(parent_stem("a"), "");
    assert.equal(parent_stem("a:"), "");
    assert.equal(parent_stem(""), undefined);

    assert.deepEqual(parent_stems("a:b:c"), ["a:b:", "a:", ""]);
    assert.deepEqual(parent_stems("a:"), [""]);
    assert.deepEqual(parent_stems(""), []);
})

it('validate_sgroup_id', () => {
    conf.ldap.stem = stem_config();
    assert.doesNotThrow(() => validate_sgroup_id("a.b.c"));
    assert.doesNotThrow(() => validate_sgroup_id("a.b.c."));
    assert.doesNotThrow(() => validate_sgroup_id("a"));
    assert.doesNotThrow(() => validate_sgroup_id("a."));
    assert.doesNotThrow(() => validate_sgroup_id(""));
    assert.doesNotThrow(() => validate_sgroup_id("a.b-c_D"));

    assert.throws(() => validate_sgroup_id(".a"));
    assert.throws(() => validate_sgroup_id("."));
    assert.throws(() => validate_sgroup_id("a["));
    assert.throws(() => validate_sgroup_id("a,"));
})

it('is_grandchild', () => {
    conf.ldap.stem = stem_config();
    assert.ok(is_grandchild("a.", "a.b.c"));
    assert.ok(is_grandchild("a.", "a.b.c."));
    assert.ok(is_grandchild("a.", "a.b.c.d"));
    assert.ok(!is_grandchild("a.", "a."));
    assert.ok(!is_grandchild("a.", "a.b"));
    assert.ok(!is_grandchild("a.", "a.b."));

    assert.ok(is_grandchild("", "a.b"));
    assert.ok(is_grandchild("", "a.b."));
    assert.ok(is_grandchild("", "a.b.c"));
    assert.ok(!is_grandchild("", ""));
    assert.ok(!is_grandchild("", "b"));
    assert.ok(!is_grandchild("", "b."));
})
