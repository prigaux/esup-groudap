import * as assert from 'assert';
import {it} from '@jest/globals';
import { export_for_tests } from '../api_log';
const { blank_partial_line, parse_jsonl } = export_for_tests

it('blank_partial_line', () => {
    const test = (s: string) => {
        const b = Buffer.from(s)
        blank_partial_line(b)
        return b.toString()
    }
    assert.equal(test("aaa\nbbb"), "   \nbbb")
    assert.equal(test('...foo"}\n{"who":"bar"}'), `        \n{"who":"bar"}`)
})

it('parse_jsonl', () => {
    assert.deepEqual(parse_jsonl('{"who":"foo"}\n{"who":"bar"}'), [{"who":"foo"}, {"who":"bar"}])
})