import * as assert from 'assert';
import {it} from '@jest/globals';
import { export_for_tests } from '../api_get';
import { toDn } from '../my_types';
const { user_highest_right } = export_for_tests

it('user_highest_right', () => {
    assert.equal(user_highest_right({}, toDn('foo')), undefined)

    const sgroup_attrs = {
        'supannGroupeLecteurDN': [ 'reader_', 'admin_' ],
        'owner': [ 'admin_', 'admin2_' ]
    }
    assert.equal(user_highest_right(sgroup_attrs, toDn('admin_')), 'admin')
    assert.equal(user_highest_right(sgroup_attrs, toDn('admin2_')), 'admin')
    assert.equal(user_highest_right(sgroup_attrs, toDn('reader_')), 'reader')
    assert.equal(user_highest_right(sgroup_attrs, toDn('foo')), undefined)
})
  