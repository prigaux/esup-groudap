const api_url = document.location.href.replace(/[^/]*$/, 'api');

export const searchParams = () => (
    new URL(location.href).searchParams
)

export async function login() {
    const cfg = await (await fetch("/api/config/public")).json()
    if (cfg && cfg.cas_prefix_url) {
        document.location.href = cfg.cas_prefix_url + "/login?service=" + api_url + "/login"
    }
}

export async function api(api_function, params) {
    const url = new URL(api_url + '/' + api_function);
    for (const key in params) {
        url.searchParams.set(key, params[key]);
    }
    const response = await fetch(url);
    console.log(response);
    if (response.status === 200) {
        const json = await response.json()
        console.log(json)
        return json
    }
    if (response.status === 401) {
        await login();
        return new Promise(_ => {}) // return dead promise
    }
    throw new Error(response)
}

