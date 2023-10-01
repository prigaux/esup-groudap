// @ts-expect-error
import fetch from 'node-fetch';
import { throw_ } from './helpers';
import { Request, Response } from 'express';

const parse_cas_response = (body: string) => {
    const user = body.includes("<cas:authenticationSuccess>") && body.match(/<cas:user>(.*?)</)?.[1]
    if (!user) {
        console.error("CAS auth failed", body)
        throw_("CAS auth failed")
    }
    return user
}

const http_get = async (url: string) => {
    const res = await fetch(url);
    return { status: res.status, body: await res.text() }
}

export const validate_ticket = async (cas_prefix_url: string, service: string, ticket: string) => {
    const url = `${cas_prefix_url}/serviceValidate?service=${service}&ticket=${ticket}`
    console.log("URL:", url);
    const { status, body } = await http_get(url)
    if (status === 200) {
        return parse_cas_response(body)
    } else {       
        throw `bad HTTP code {status}`
    }
}

export const handle_single_logout = async (req: Request, res: Response) => {
    const m = req.body?.logoutRequest?.match(/<samlp:SessionIndex>(.*)<\/samlp:SessionIndex>/)
    if (m) {
        req.sessionStore.destroy(m[1]);
        res.status(204).end()
    } else {
        res.end()
    }
}
