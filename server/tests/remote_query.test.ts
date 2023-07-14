import * as assert from 'assert';
import {it} from '@jest/globals';
import { parse_sql_url, to_sql_url } from '../remote_query';

const parse_and_to_string = (url: string) => (
    parse_sql_url(url)?.oMap(to_sql_url)
)
function test_ok(url: string) {
    assert.equal(parse_and_to_string(url), url);
}

it('test_parse_sql_url', () => {
    test_ok("sql: remote=foo : subject=ou=people,dc=nodomain?uid : select username from users");
    test_ok("sql: remote=foo : select concat('uid=', username, ',ou=people,dc=nodomain') from users");
    //assert.equal(parse_sql_url(""), undefined);
    //assert.throws(() => parse_sql_url("sql: select username from users"));
})
