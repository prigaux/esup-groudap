package groupald;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import groupald.HttpException;
import groupald.HttpUtils;
import groupald.HttpUtils.Pair;

public class HttpRequestGroupaldWS {

    private String url;
    private String trusted_auth_bearer;

    public HttpRequestGroupaldWS(String url, String trusted_auth_bearer) {
        this.url = url;
        this.trusted_auth_bearer = trusted_auth_bearer;
    }
        
    public Boolean exists(String id) throws HttpException {
        Pair[] params = { new Pair("id", id) };
        return request("/api/exists", params).booleanValue();
    }
    
    public JsonNode get(String id) throws HttpException {
        Pair[] params = { new Pair("id", id) };
        return request("/api/get", params);
    }
    public Map<String, String> get_attrs(String id) throws HttpException {
        return new ObjectMapper().convertValue(get(id).path("attrs"), Map.class);
    }    
    public Map<String, String> direct_members(String id) throws HttpException {
        return new ObjectMapper().convertValue(get(id).path("group").path("direct_members"), Map.class);
    }
    
    public JsonNode direct_rights(String id) throws HttpException {
        Pair[] params = { new Pair("id", id) };
        return request("/api/direct_rights", params);
    }

    public List<String> search_raw_sgroups_using_a_subject(String subject_dn, String mright) throws HttpException {
        Pair[] params = { new Pair("subject_dn", subject_dn), new Pair("mright", mright) };
        return convertToStringList(request("/api/raw/search_sgroups_using_a_subject", params));
    }

    public JsonNode get_subject(String subject_id) throws HttpException {
        Pair[] params = { new Pair("subject_id", subject_id) };
        return request("/api/get_subject", params);
    }

    public void delete(String id) throws HttpException {
        Pair[] query_params = { new Pair("id", id) };
        requestPOST("/api/delete", query_params, new Pair[] {});
    }
    public void create(String id, Map<String, String> attrs) throws HttpException {
        Pair[] query_params = { new Pair("id", id) };
        requestPOST("/api/create", query_params, attrs);
    }
    public void modify_attrs(String id, Map<String, String> attrs) throws HttpException {
        Pair[] query_params = { new Pair("id", id) };
        requestPOST("/api/modify_attrs", query_params, attrs);
    }
    
    public void modify_member_or_right(String id, String mright, String mod, String subject_dn) throws HttpException {
        Pair[] query_params = { new Pair("id", id) };
        Pair[] body_params = { new Pair("mright", mright), new Pair("mod", mod), new Pair("dn", subject_dn) };
        requestPOST("/api/modify_member_or_right", query_params, body_params);
    }
    
    private Integer convertToInteger(JsonNode json) {
        return json.isInt() ? json.intValue() : null;
    }
    
    private List<String> convertToStringList(JsonNode json) {
        List<String> l = new LinkedList<>();
        Iterator<JsonNode> it = json.elements();                
        while (it.hasNext())
                l.add(it.next().textValue());
        return l;
    }
        
    private Set<String> convertToStringSet(JsonNode json) {
        HashSet<String> l = new HashSet<>();
        Iterator<JsonNode> it = json.elements();                
        while (it.hasNext())
            l.add(it.next().textValue());
        return l;
    }

    private JsonNode requestPOST(String action, Pair[] query_params, Pair[] body_params) throws HttpException {
        return requestPOST(action, query_params, HttpUtils.formatParams(body_params));
    }
    private JsonNode requestPOST(String action, Pair[] query_params, Map<String, String> body_params) throws HttpException {
        return requestPOST(action, query_params, HttpUtils.formatParams(body_params));
    }
    private JsonNode requestPOST(String action, Pair[] query_params, String body) throws HttpException {
        String cooked_url = HttpUtils.cook_url(url + action, query_params);
        String json;
        try {
            HttpURLConnection uc = HttpUtils.openConnection(cooked_url);
            uc.setRequestProperty("Authorization", "Bearer " + trusted_auth_bearer);
            json = HttpUtils.requestPOST(uc, body);
        } catch (HttpException.WithStatusCode e) {
            throw remapException(e);
        }
        return parseResponse(json);
    }

    public JsonNode request(String action) throws HttpException {
        return request_(url + action);
    }

    private JsonNode request(String action, List<Pair> params) throws HttpException {
        String cooked_url = HttpUtils.cook_url(url + action, params);
        return request_(cooked_url);
    }

    private JsonNode request(String action, Pair[] params) throws HttpException {
        String cooked_url = HttpUtils.cook_url(url + action, params);
        return request_(cooked_url);
    }

    private JsonNode request_(String cooked_url) throws HttpException {
        String json;
        try {
            HttpURLConnection uc = HttpUtils.openConnection(cooked_url);
            uc.setRequestProperty ("Authorization", "Bearer " + trusted_auth_bearer);
            json = HttpUtils.requestGET(uc);
        } catch (HttpException.WithStatusCode e) {
            throw e;
        }
        return parseResponse(json);
    }

    private JsonNode parseResponse(String json) throws HttpException {
        try {
            return new ObjectMapper().readTree(json);
        } catch (IOException e) {
            Unchecked.throw_(e);
            return null;
        }
    }

    private HttpException remapException(HttpException.WithStatusCode e) {
        // we could not find a more useful exception
        Unchecked.throw_(e);
        return null;
    }

        private <A> LinkedList<A> singletonListOrEmpty(A e) {
                final LinkedList<A> l = new LinkedList<>();
                if (e != null) l.add(e);
                return l;
        }        
        
        static class Unchecked{
                /**
                * Throw any kind of exception without needing it to be checked
                * @param e any instance of a Exception
                */
                public static void throw_(Exception e) {
                        /**
                         * Abuse type erasure by making the compiler think we are throwing RuntimeException,
                         * which is unchecked, but then inserting any exception in there.
                         */
                        Unchecked.<RuntimeException>throwAnyImpl(e);
                }
                
                @SuppressWarnings("unchecked")
                private static<T extends Exception> void throwAnyImpl(Exception e) throws T {
                        throw (T) e;
                }
        }

}
