import * as assert from 'assert';
import {it} from '@jest/globals';
import { export_for_tests } from '../api_get';
const { user_highest_right } = export_for_tests

it('user_highest_right', () => {
    assert.equal(user_highest_right({}, [ 'foo' ]), undefined)

    const sgroup_attrs = {
        'memberURL;x-reader': [ 'reader_', 'admin_' ],
        'memberURL;x-admin': [ 'admin_', 'admin2_' ]
    }
    assert.equal(user_highest_right(sgroup_attrs, [ 'admin_' ]), 'admin')
    assert.equal(user_highest_right(sgroup_attrs, [ 'admin2_' ]), 'admin')
    assert.equal(user_highest_right(sgroup_attrs, [ 'reader_' ]), 'reader')
    assert.equal(user_highest_right(sgroup_attrs, [ 'foo' ]), undefined)
})
  